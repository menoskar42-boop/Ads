#!/usr/bin/env node
/**
 * Kakeibo receipts were public files.
 *
 * Receipt photos were written to `public/uploads` and linked as
 * `/uploads/kkb-<userId>-<timestamp>.jpg`, which `express.static` serves to
 * anybody who asks. A receipt is a financial document — the shop, the amount,
 * the date, sometimes a card's last four — belonging to a person who uploaded
 * it into a private budgeting app. And the filename carried the user id, so
 * "you would have to guess it" was never much of an answer: one shared link,
 * one referrer in somebody's logs, and the pattern is right there.
 *
 * They now live outside the web root and come back through a route that asks
 * the database whether this session owns the row — in the same query that
 * finds the file, not a separate one.
 *
 *   node scripts/check-receipt-privacy.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const nl = (m) => m.replace(/[^\n]/g, ' ');
const strip = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const router = strip(fs.readFileSync(path.join(ROOT, 'src/kakeibo/router.js'), 'utf8'));
const schema = strip(fs.readFileSync(path.join(ROOT, 'src/kakeibo/schema.js'), 'utf8'));

/* ── Where the file lands ──────────────────────────────────────────────── */
check('الإيصالات بتتكتب برّه جذر الويب',
  /uploadDir = path\.join\(__dirname, '\.\.\/\.\.\/private_uploads\/kakeibo'\)/.test(router));
check('ومفيش حاجة في كاكيبو لسه بتكتب في public/uploads',
  !/public\/uploads/.test(router));
check('و`private_uploads/` مستثنى من جيت (مش هيترفع بالغلط)',
  /^private_uploads\/$/m.test(fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8')));

/* ── The link stored on the row points at the guarded route ────────────── */
{
  const stored = [...router.matchAll(/receiptUrl = '([^']+)'/g)].map((m) => m[1]);
  check('الرابط المحفوظ بيوديّ على الراوت المحروس',
    stored.length > 0 && stored.every((u) => u === '/kakeibo/receipt/'),
    stored.join(' | ') || 'مالقيتش');
}

/* ── The route proves ownership, and proves it in the query ────────────── */
{
  const route = (router.match(/router\.get\('\/kakeibo\/receipt\/:file'[\s\S]*?\n\}\);/) || [''])[0];
  check('لقيت راوت الإيصال', !!route);
  check('وعليه حارس تسجيل الدخول', /requireKkb/.test(route));
  /* The ownership test and the lookup are one statement. A SELECT of the row
     followed by a separate "and is it mine?" is the shape that grows a hole
     the first time somebody adds an early return above the check. */
  check('والملكية بتتثبت في نفس الجملة اللي بتلاقي الملف',
    /WHERE user_id=\$1 AND receipt_url=\$2/.test(route));
  check('ولو مش بتاعته بيرجع 404 (مش 403 اللي بتأكّد إن الملف موجود)',
    /if \(!owned\.rows\.length\) return res\.status\(404\)/.test(route));
  check('واسم الملف بيتقشّر بـ`path.basename` (مفيش `../`)',
    /path\.basename\(String\(req\.params\.file/.test(route));
  check('والمسار الناتج بيتراجع إنه جوّه الفولدر',
    /startsWith\(uploadDir \+ path\.sep\)/.test(route));
  check('ومفيش كاش مشترك على مستند مالي',
    /Cache-Control', 'private/.test(route));
  check('و`nosniff` وسانّدبوكس على المحتوى',
    /nosniff/.test(route) && /sandbox/.test(route));
}

/* ── The ones already written get moved ────────────────────────────────── */
{
  check('في هجرة بتنقل الملفات القديمة برّه public',
    /migrateReceiptsOutOfPublic/.test(schema));
  check('وبتصلّح الروابط المحفوظة في الصفوف',
    /UPDATE kkb_expenses[\s\S]{0,200}receipt_url LIKE '\/uploads\/kkb-%'/.test(schema));
  /* Files first, then rows: a crash between the two leaves rows pointing at a
     file that still exists, which is recoverable. The other order loses them. */
  const iFiles = schema.indexOf('fs.renameSync');
  const iRows = schema.indexOf('UPDATE kkb_expenses');
  check('والملفات بتتنقل قبل الصفوف (لو وقع بينهم، الصف لسه بيلاقي ملفه)',
    iFiles > -1 && iRows > iFiles, `files@${iFiles} rows@${iRows}`);
  check('والهجرة مابتوقعش التشغيل لو فشلت', /catch \(e\) \{[\s\S]{0,120}kakeibo receipts migration/.test(schema));
}

/* ── Nothing public-facing points at the old path any more ─────────────── */
{
  const views = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (!f.name.endsWith('.ejs')) continue;
      if (/\/uploads\/kkb/.test(fs.readFileSync(full, 'utf8'))) views.push(path.relative(ROOT, full));
    }
  };
  walk(path.join(ROOT, 'src/views'));
  check('ومفيش قالب لسه بيبني `/uploads/kkb-…` بنفسه', views.length === 0, views.join(' · ') || 'ولا واحد');
}

console.log(fail
  ? `\n${fail} مشكلة — يعني إيصال حد ممكن يتفتح من غير ما يكون بتاعه.`
  : '\nالإيصال برّه جذر الويب، ومابيتفتحش غير لصاحبه.');
process.exit(fail ? 1 : 0);
