#!/usr/bin/env node
/**
 * التفاسير لازم تشتغل من الملفات اللي **في جيت** لوحدها — من غير إنترنت.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: المالك شاف تحت التفسير سطر «المصدر:
 * تفسير عربي منشور على St-Takla.org» وافتكر إن الموقع بيسحب التفسير من
 * سانت تكلا وهو أصلاً عندنا. السطر ده **نسبة للمؤلّف** ثابتة في
 * `TafsirText.tsx` وبتظهر تحت كل تفسير سواء جه من عندنا أو من برّه —
 * فمش دليل على أي حاجة. الدليل الحقيقي هو اللي الفحص ده بيقيسه.
 *
 * وفيه فخ حقيقي جنبه: `mybible/.gitignore` بيستبعد
 * `client/public/tafsir/` (ملفات الأسفار الكاملة). يعني أي نسخة جديدة
 * من الريبو أو أي كونتينر جديد **بيقوم من غيرها**. اللي بيخلّي التفاسير
 * شغّالة هو `client/public/tafsir-parts/` المتسجّل في جيت. لو حد مسح
 * منها ملف أو اعتمد على `tafsir/` من غير ما ياخد باله، التفاسير هتقع
 * على السيرفر بس هتفضل شغّالة على جهازه — وده بالظبط اللي الفحص ده
 * بيمنعه.
 *
 * بيقيس سلوك، مش نص: بيشغّل `tafsir-service` الحقيقي جوّه مجلّد مؤقّت
 * فيه **الملفات المتسجّلة في جيت بس** (من غير `tafsir/` خالص)، وبيتأكد:
 *   ١) كل ملفات `tafsir-parts` متسجّلة في جيت.
 *   ٢) التغطية كاملة من غير `tafsir/`: مفيش سفر ناقص، والأصحاحات ≥ الحد.
 *   ٣) عيّنة أصحاحات بترجّع نص حقيقي من القرص.
 *   ٤) كل إصحاح في `LIVE_MISSING_CHAPTER_URLS` مش موجود عندنا فعلاً —
 *      يعني السحب من سانت تكلا آخر حل لما ما يبقاش عندنا، مش بديل لحاجة
 *      عندنا. لو حد ضاف إصحاح للقايمة دي وهو موجود محلياً، الفحص بيقع.
 *
 * الفحص ما بيلمسش الشبكة.
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MYBIBLE = path.join(ROOT, 'mybible');
const SERVICE = path.join(MYBIBLE, 'server/tafsir-service.ts');
const PARTS = path.join(MYBIBLE, 'client/public/tafsir-parts');

// أقل تغطية مقبولة. القياس وقت كتابة الفحص: ١٣٠٨ من ١٣٢٦ إصحاح، صفر سفر
// ناقص. الحد أقل شوية عشان تصليح سجل مرقّم غلط ما يوقّعش الفحص، لكنه
// بيمسك أي مسح جماعي لملفات الأجزاء.
const MIN_CHAPTERS = 1290;

// عيّنة أسفار من العهدين ومن الأسفار القانونية التانية.
const SAMPLE = [
  ['تكوين', 1], ['خروج', 20], ['يشوع', 4], ['مزامير', 23], ['إشعياء', 53],
  ['متى', 5], ['مرقس', 1], ['يوحنا', 3], ['رومية', 8], ['رؤيا', 21],
  ['يهوديت', 8], ['حكمة سليمان', 3],
];
const MIN_LEN = 500;   // أقل من كده مش تفسير إصحاح، ده عنوان

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(SERVICE) || !fs.existsSync(PARTS)) {
  console.log('⏭️  mybible مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}

/* ── ١) كل جزء متسجّل في جيت ──────────────────────────────────────────── */
let tracked = new Set();
try {
  tracked = new Set(
    execFileSync('git', ['ls-files', '-z', 'mybible/client/public/tafsir-parts'],
      { cwd: ROOT, maxBuffer: 1 << 24 })
      .toString('utf8').split('\0').filter(Boolean)
      .map((p) => path.basename(p)),
  );
} catch (e) {
  console.error('⚠️  مش قادر أقرا من جيت — الفحص ده مش قادر يقيس: ' + e.message);
  process.exit(1);
}

const onDisk = fs.readdirSync(PARTS).filter((f) => f.endsWith('.csv'));
const untracked = onDisk.filter((f) => !tracked.has(f));
if (untracked.length) {
  fail(`ملفات تفسير مش متسجّلة في جيت (هتضيع على السيرفر): ${untracked.slice(0, 5).join(' · ')}`
    + (untracked.length > 5 ? ` … و${untracked.length - 5} كمان` : ''));
}

/* ── سانّدبوكس «نسخة جديدة»: الأجزاء بس، من غير tafsir/ ───────────────── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tafsir-offline-'));
const pub = path.join(tmp, 'client', 'public');
fs.mkdirSync(pub, { recursive: true });
fs.symlinkSync(PARTS, path.join(pub, 'tafsir-parts'), 'dir');
// مفيش `tafsir/` خالص — ده بالظبط وضع أي كونتينر جديد.

const probe = path.join(tmp, 'probe.mjs');
fs.writeFileSync(probe, `
const svc = await import(${JSON.stringify('file://' + SERVICE)});
const out = { dirs: {}, coverage: null, sample: [], live: [] };
out.dirs.tafsirExists = (await import('node:fs')).existsSync('client/public/tafsir');
const cov = svc.getTafsirCoverage(true);
out.coverage = { ...cov.totals, tafsirDir: cov.tafsirDir, partsDir: cov.partsDir };
out.books = svc.listAvailableBooks().length;
for (const [b, c] of ${JSON.stringify(SAMPLE)}) {
  const t = svc.getChapterTafsir(b, c);
  out.sample.push([b, c, t ? t.length : 0]);
}
// الأصحاحات اللي الكود بيسمح لنفسه يسحبها حيّة — لازم تكون فعلاً مش عندنا
for (const [book, chapters] of Object.entries(svc.LIVE_MISSING_CHAPTERS ?? {})) {
  for (const c of chapters) out.live.push([book, c, svc.getChapterTafsir(book, c) ? 1 : 0]);
}
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`, 'utf8');

let raw;
try {
  raw = execFileSync(process.execPath, ['--no-warnings', probe], {
    cwd: tmp,
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1 << 26,
  }).toString('utf8');
} catch (e) {
  console.error('⚠️  مش قادر أشغّل tafsir-service (محتاج Node ≥ 22.6 بيفك أنواع TS):');
  console.error('    ' + String(e.stderr || e.message).split('\n').slice(0, 4).join('\n    '));
  console.error('    مش هعدّيه أخضر وأنا مش قادر أقيس.');
  process.exit(1);
}

const marker = raw.indexOf('@@JSON@@');
if (marker < 0) { console.error('⚠️  الفحص ما رجّعش نتيجة'); process.exit(1); }
const res = JSON.parse(raw.slice(marker + 8));

/* ── ٢) التغطية من غير tafsir/ ────────────────────────────────────────── */
if (res.dirs.tafsirExists) {
  fail('السانّدبوكس اتلوّث: `client/public/tafsir` اتعمل جوّه المجلّد المؤقّت');
}
if (res.coverage.missingBooks > 0) {
  fail(`${res.coverage.missingBooks} سفر من غير تفسير لما نعتمد على الملفات المتسجّلة في جيت بس`);
}
if (res.coverage.presentChapters < MIN_CHAPTERS) {
  fail(`التغطية وقعت: ${res.coverage.presentChapters} إصحاح بس (الحد ${MIN_CHAPTERS}). `
    + 'يبقى فيه ملفات أجزاء اتمسحت، أو الاعتماد بقى على `client/public/tafsir/` اللي مش في جيت.');
}

/* ── ٣) عيّنة أصحاحات بترجّع نص حقيقي ─────────────────────────────────── */
for (const [b, c, len] of res.sample) {
  if (len < MIN_LEN) {
    fail(`تفسير ${b} ${c} رجع ${len} حرف (الحد ${MIN_LEN}) — المفروض يتقرا من القرص`);
  }
}

/* ── ٤) السحب الحيّ آخر حل، مش بديل لحاجة عندنا ───────────────────────── */
if (!res.live.length) {
  fail('`LIVE_MISSING_CHAPTERS` مش متصدَّرة من tafsir-service — من غيرها الفحص '
    + 'مش قادر يتأكد إن السحب من سانت تكلا آخر حل. صدّرها.');
}
for (const [b, c, local] of res.live) {
  if (local) {
    fail(`${b} ${c} مكتوب في قايمة السحب الحيّ من سانت تكلا وهو **موجود عندنا** — `
      + 'شيله من القايمة، مش منطقي نروح للشبكة ونحنا عندنا النص.');
  }
}

if (process.exitCode) process.exit(1);
console.log(`✅ التفاسير شغّالة من جيت لوحدها: ${res.books} سفر · `
  + `${res.coverage.presentChapters}/${res.coverage.expectedChapters} إصحاح · `
  + `${res.live.length} إصحاح بس بيتسحب من سانت تكلا (مش موجود عندنا)`);
