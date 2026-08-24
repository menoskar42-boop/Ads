#!/usr/bin/env node
/**
 * `file.mimetype` is not a fact about the file.
 *
 * Every uploader in the project filtered on it, and it is a string the client
 * writes into the multipart part header:
 *
 *     curl -F "image_file=@shell.html;type=image/png" …
 *
 * walks straight through `/^image\/(png|jpeg|gif|webp)$/`. The saved name then
 * took its extension from `originalname` — another client string — so the file
 * landed in `public/uploads` as `product-7-1699.html`.
 *
 * Serving is already defended (`nosniff` + a sandbox CSP on /uploads). This is
 * the other end: **do not store a lie**. The two protect against different
 * mistakes, and the one at the door is what keeps the wrong bytes out of
 * Object Storage, out of backups, and out of whatever serves these files next
 * year — none of which inherit that CSP.
 *
 * Two things get checked, and the second is the one that keeps being true:
 *
 *   · the sniffer works, run against real magic bytes;
 *   · **no uploader anywhere escapes the wrapper**. Fourteen call sites in
 *     seven files is exactly the shape where one gets missed, so this sweeps
 *     for a bare `.single(` / `.fields(` / `.array(` instead of listing the
 *     ones that exist today.
 *
 *   node scripts/check-upload-type.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const uploads = require('../src/lib/uploads');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The sniffer, on actual bytes ──────────────────────────────────────── */
const B = (...parts) => Buffer.concat(parts.map((p) =>
  typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p)));
const pad = Buffer.alloc(16);

const SAMPLES = {
  png:  B([0x89], 'PNG\r\n\x1a\n', pad),
  jpg:  B([0xff, 0xd8, 0xff, 0xe0], pad),
  gif:  B('GIF89a', pad),
  webp: B('RIFF', [0, 0, 0, 0], 'WEBP', pad),
  mp4:  B([0, 0, 0, 0x20], 'ftypisom', pad),
  heic: B([0, 0, 0, 0x18], 'ftypheic', pad),
  wav:  B('RIFF', [0, 0, 0, 0], 'WAVE', pad),
  ogg:  B('OggS', pad),
  mp3:  B('ID3', pad),
  matroska: B([0x1a, 0x45, 0xdf, 0xa3], pad),
  dicom: B(Buffer.alloc(128), 'DICM', pad),
  avi:  B('RIFF', [0, 0, 0, 0], 'AVI ', pad),
};
for (const [kind, buf] of Object.entries(SAMPLES)) {
  check('بيعرف ' + kind + ' من بايتاته', uploads.sniff(buf) === kind, uploads.sniff(buf));
}

const ATTACKS = {
  'HTML مقنّع كصورة': B('<!doctype html><script>alert(1)</script>', pad),
  'SVG (محتوى نشط)': B('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', pad),
  'PHP': B('<?php system($_GET[0]); ?>', pad),
  'ZIP/Office': B('PK\x03\x04', pad),
  'ملف فاضي': Buffer.alloc(0),
  'بايتين بس': Buffer.from([0x89, 0x50]),
};
for (const [label, buf] of Object.entries(ATTACKS)) {
  check(label + ' → مش متعرَّف (يعني مرفوض)', uploads.sniff(buf) === null, String(uploads.sniff(buf)));
}
check('و«صورة» مش من عيلة الفيديو والعكس',
  !uploads.FAMILIES.image.includes('mp4') && !uploads.FAMILIES.video.includes('png'));
check('وHEIC من الموبايل بتعدّي كصورة مش كفيديو',
  uploads.FAMILIES.image.includes('heic') && !uploads.FAMILIES.video.includes('heic'));

/* ── The extension comes from the declared type, not the filename ──────── */
check('الامتداد من النوع المعلن',
  uploads.extname({ mimetype: 'image/png', originalname: 'x.html' }) === '.png'
  && uploads.extname({ mimetype: 'image/jpeg' }) === '.jpg');
check('ونوع مش في القايمة بياخد الافتراضي مش امتداد العميل',
  uploads.extname({ mimetype: 'text/html', originalname: 'x.html' }, '.bin') === '.bin');

// والقاعدة دي لازم تكون مطبّقة في **كل** رافع في الكود، مش في واحد.
// كانت مكسورة في `makeMediaUploader` (رافع صور وفيديو المنتج): بياخد الامتداد
// من `path.extname(file.originalname)` — يعني من اسم الملف اللي العميل باعته —
// جنب رافع تاني في نفس الملف بيعمل الصح. PNG مرفوعة باسم `x.jpg` كانت بتتحفظ
// `.jpg` وتتقدّم بـ`image/jpeg`، فالمتصفّح بيتلغبط والكاش بيتلوّث.
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + m.slice(p.length).replace(/[^\n]/g, ' '));
  const namers = src.match(/filename: \(req, file, cb\) => \{[\s\S]*?\}/g) || [];
  check('كل الرافعين بياخدوا الامتداد من النوع المعلن',
    namers.length >= 2 && namers.every((n) => /uploads\.extname\(file/.test(n)),
    namers.length + ' رافع');
  check('ومفيش رافع بيقرا امتداد من اسم الملف بتاع العميل',
    !/path\.extname\(file\.originalname\)/.test(src));
}

/* ── The middleware refuses, deletes, and answers ──────────────────────── */
{
  const tmp = path.join(require('os').tmpdir(), 'upl-check-' + Date.now() + '.png');
  fs.writeFileSync(tmp, ATTACKS['HTML مقنّع كصورة']);
  const req = { file: { path: tmp, originalname: 'shell.png', mimetype: 'image/png' }, accepts: () => false };
  let status = null, passed = false;
  const res = { status(c) { status = c; return this; }, send() { return this; }, json() { return this; } };
  const warn = console.warn; console.warn = () => {};
  try { uploads.verify('image')(req, res, () => { passed = true; }); } finally { console.warn = warn; }
  check('ملف HTML باسم .png بيترفض بـ415', status === 415 && !passed, `status ${status}`);
  check('والملف بيتمسح من على الديسك', !fs.existsSync(tmp));
  check('و`req.file` بيتشال فالراوت مايشوفوش', !req.file);
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  const good = path.join(require('os').tmpdir(), 'upl-ok-' + Date.now() + '.png');
  fs.writeFileSync(good, SAMPLES.png);
  const req2 = { file: { path: good, originalname: 'a.png', mimetype: 'image/png' }, accepts: () => false };
  let ok2 = false;
  uploads.verify('image')(req2, res, () => { ok2 = true; });
  check('وصورة PNG حقيقية بتعدّي', ok2 && fs.existsSync(good));
  fs.unlinkSync(good);
}

/* ── No uploader escapes the wrapper ───────────────────────────────────── */
{
  const nl = (m) => m.replace(/[^\n]/g, ' ');
  /* Two spreadsheet uploaders. CSV has no signature at all, so a byte check
     there would reject every valid CSV or wave everything through; both are
     parsed by a real spreadsheet reader that fails loudly instead. Named here
     so the exemption stays a decision rather than an oversight. */
  const EXEMPT = ['src/routes/research_auditor.js', 'src/routes/accounting.js'];
  const bare = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules') continue;
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { walk(full); continue; }
      if (!f.name.endsWith('.js')) continue;
      const rel = path.relative(ROOT, full);
      if (EXEMPT.includes(rel)) continue;
      const src = fs.readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, nl)
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
      if (!/require\(['"]multer['"]\)/.test(src)) continue;
      for (const m of src.matchAll(/\.(single|fields|array|any)\(/g)) {
        // Covered when the wrapper opens before it and closes after it.
        const before = src.slice(0, m.index);
        const opens = (before.match(/uploads\.guard\(/g) || []).length;
        const closes = (before.match(/\}\)\.(single|fields|array|any)\([^)]*\),\s*'[a-z]+'\)/g) || []).length;
        if (opens > closes) continue;
        bare.push(rel + ':' + before.split('\n').length + ' .' + m[1] + '(');
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  check('مفيش رافع ملفات بره الغلاف', bare.length === 0, bare.join(' · ') || 'كلهم متغلّفين');

  // And the wrapper is actually used somewhere — "no bare calls" is also true
  // of a project that stopped accepting uploads.
  let wrapped = 0;
  const count = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules') continue;
      const full = path.join(dir, f.name);
      if (f.isDirectory()) { count(full); continue; }
      if (f.name.endsWith('.js')) wrapped += (fs.readFileSync(full, 'utf8').match(/uploads\.guard\(/g) || []).length;
    }
  };
  count(path.join(ROOT, 'src'));
  check('والغلاف مستخدم فعلاً', wrapped >= 8, wrapped + ' رافع');
}

/* ── The exit stays defended too ───────────────────────────────────────── */
{
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  check('و/uploads لسه بـnosniff وسانّدبوكس عند العرض',
    /X-Content-Type-Options', 'nosniff'/.test(srv) && /sandbox/.test(srv));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني ملف مش صورة ممكن يتخزّن على إنه صورة.`
  : '\nالملف بيتفحص من بايتاته، والامتداد من النوع المعلن مش من اسم العميل.');
process.exit(fail ? 1 : 0);
