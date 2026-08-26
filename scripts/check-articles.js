#!/usr/bin/env node
/**
 * كل رابط داخلي في مقال لازم يودّي على صفحة موجودة فعلاً — ومفيش موضوعين
 * بنفس السلَج أو نفس العنوان.
 *
 * ── ليه الفحص ده اتكتب ──────────────────────────────────────────────────
 *
 * وصلت عشرين مسوّدة مقال من مصدرين خارجيين للمراجعة قبل النشر. المسوّدات
 * العشرة الأولى كانت بتقترح اتنين وعشرين رابط داخلي — واحد بس منهم بيودّي
 * على صفحة موجودة عندنا. الباقي (`/services/...`، `/industries/...`،
 * `/demos/clinic`) اتكتبوا لموقع متخيّل مش موقعنا.
 *
 * ولو اتنشروا زي ما هما، مكانش هيحصل أي خطأ: الصفحة بتتبني، والمقال بيتقرا،
 * والزائر بيدوس على «شوف نظام العيادة» ويلاقي ٤٠٤. وجوجل بيمشي على نفس
 * الروابط ويسجّل عندنا صفحة مليانة لينكات مكسورة — ودي إشارة جودة سلبية
 * مباشرة في `docs/GOOGLE_SEARCH_CENTRAL.md`.
 *
 * الفحص ده هو اللي بيمنع مسوّدة زي دي إنها تعدّي.
 *
 * ── والتكرار ────────────────────────────────────────────────────────────
 *
 * نفس المسوّدات كان فيها مقال سلَجه `best-pharmacy-software-egypt` — وده
 * **منشور عندنا بالفعل**. اتنين بنفس الموضوع بيتنافسوا على نفس الكلمة
 * (cannibalization)، والأسوأ إن السلَج المكرّر بيدوس على المنشور. الفحص
 * بيقفل الاتنين.
 *
 * Usage: node scripts/check-articles.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const fail = (why) => { console.log('❌ ' + why); failed += 1; };

// ── إيه اللي بنعتبره صفحة موجودة ────────────────────────────────────────

const registry = read('src/routes/blog_articles.js');
const slugs = [...registry.matchAll(/slug:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
const titles = [...registry.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);

/**
 * المسارات الحرفية من ملفات التوجيه.
 *
 * `.get('/about')` بيتقرا، لكن الصفحات القطاعية **مابتتكتبش كده** — هي
 * حلقة على `SECTORS`. لو الفحص شاف الحرفي بس كان هيقول إن تسع روابط
 * سليمة في المقالات مكسورة، وأول واحد يشغّله كان هيصلّح روابط شغّالة.
 * الفحص اللي بيبلّغ عن غلط مش موجود بيتقفل بعد تلات مرات.
 */
/**
 * المسارات الموجودة فعلاً — **من المصدر الواحد**.
 *
 * ⚠️ النسخة الأولى كانت بتقرا `.get('/path')` الحرفي من ملفات التوجيه
 * وبتضيف `SECTORS` بالإيد. النتيجة إنها مكانتش بتعرف صفحات **الخدمات**
 * (اللي بتتسجّل بحلقة زي القطاعات بالظبط) — فمقال بيلينك
 * `/ar/crm-development-egypt` كان بيترفض على إنه رابط مكسور، وهو سليم.
 *
 * الفحص اللي بيبلّغ عن غلط مش موجود بيتقفل بعد تلات مرات. فالقايمة بقت
 * `langRoutes.publicPaths()` — نفس اللي الميدل‌وير والسايت‌ماب بيقروا
 * منها، فأي نوع صفحات جديد بيدخل هنا لوحده.
 */
const langRoutes = require('../src/lib/lang_routes');
const paths = langRoutes.publicPaths();
// `/privacy` و`/terms` صفحات حقيقية بس `noindex` وبره القايمة عن قصد.
for (const p of ['/privacy', '/terms']) paths.add(p);

const articleSlugs = new Set(slugs);

// ── ١) كل رابط داخلي بيوصل ──────────────────────────────────────────────

const DIR = 'src/views/blog/articles';
const bodies = fs.readdirSync(path.join(ROOT, DIR)).filter((f) => f.endsWith('.ejs'));
let links = 0;
let broken = 0;
const unprefixed = [];
const NO_PREFIX = new Set(['/privacy', '/terms']);
for (const file of bodies) {
  const html = read(DIR + '/' + file);
  for (const m of html.matchAll(/href="(\/[^"?#]*)/g)) {
    // بنشيل السلاش الأخير: `/about/` و`/about` نفس الصفحة عندنا.
    // وبنشيل prefix اللغة كمان: الصفحات العامة بقت على `/ar/…`، والفحص
    // بيتأكد من **الصفحة** مش من الـprefix. رابط من غير prefix بيتمسك
    // في القاعدة اللي تحت — عشان رابط بيتحوّل ٣٠١ مش رابط سليم.
    let p = m[1].replace(/\/$/, '') || '/';
    const pref = /^\/(ar|en)(\/.*)?$/.exec(p);
    // `/privacy` و`/terms` مقصود إنهم `noindex,follow` وبره السايت‌ماب،
    // فمش صفحات عامة ومالهمش نسخة لغوية — الـprefix عليهم غلط مش صح.
    if (!pref) { if (!NO_PREFIX.has(p)) unprefixed.push(`${file}: ${p}`); }
    else { p = pref[2] || '/'; }
    links += 1;
    if (p.startsWith('/blog/')) {
      if (!articleSlugs.has(p.slice(6))) {
        fail(`[${file}] رابط لمقال مش موجود: ${p}`); broken += 1;
      }
      continue;
    }
    if (!paths.has(p)) { fail(`[${file}] رابط لصفحة مش مسجّلة: ${p}`); broken += 1; }
  }
}
if (!broken) console.log(`✅ ${links} رابط داخلي في ${bodies.length} مقال — كلهم بيوصلوا`);

/* ── رابط من غير prefix لغة = رابط بيتحوّل ٣٠١ ──────────────────────────
 *
 * `/about` شغّال، بس بيتحوّل. الزائر مش هيلاحظ؛ جوجل هتلاحظ: تحويلة جوّه
 * الموقع بتضيّع جزء من قوة الرابط وبتبطّأ الزحف. والأسوأ إن كل مقال جديد
 * هيتكتب بالعادة القديمة لو مفيش حاجة بتقول لأ. */
if (unprefixed.length) {
  fail(`رابط من غير prefix اللغة (بيتحوّل ٣٠١ بدل ما يوصل على طول): ${unprefixed.slice(0, 8).join(' · ')}`
    + (unprefixed.length > 8 ? ` … و${unprefixed.length - 8} غيرهم` : ''));
} else {
  console.log('✅ وكل رابط عليه prefix اللغة — مفيش تحويلة داخلية');
}

// ── ٢) مفيش سلَج ولا عنوان مكرّر ────────────────────────────────────────

const dupe = (list, what) => {
  const seen = new Set();
  const bad = [];
  for (const v of list) { if (seen.has(v)) bad.push(v); seen.add(v); }
  if (bad.length) fail(`${what} مكرّر: ${bad.join(' · ')}`);
  return bad.length === 0;
};
if (dupe(slugs, 'سلَج') & dupe(titles, 'عنوان')) {
  console.log(`✅ ${slugs.length} مقال — مفيش سلَج ولا عنوان مكرّر`);
}

// ── ٣) كل مقال ليه جسم، وكل جسم ليه مقال ────────────────────────────────

const orphanBody = bodies
  .map((f) => f.replace(/\.ejs$/, ''))
  .filter((s) => !articleSlugs.has(s));
const missingBody = slugs.filter((s) => !bodies.includes(s + '.ejs'));
if (orphanBody.length) fail(`جسم مقال من غير تسجيل: ${orphanBody.join(' · ')}`);
if (missingBody.length) fail(`مقال مسجّل من غير جسم: ${missingBody.join(' · ')}`);
if (!orphanBody.length && !missingBody.length) {
  console.log('✅ كل مقال مسجّل ليه جسم، ومفيش جسم يتيم');
}

// ── ٤) الحد الأدنى للطول ────────────────────────────────────────────────
//
// `seo-audit` بيفحص ده كمان، لكن هناك جوّه فحص كبير بيتشغّل على الموقع
// كله. هنا هو **بوابة المقال الجديد**: اللي بيضيف مقال بيشغّل ده.

const MIN_WORDS = 300;
const short = [];
for (const file of bodies) {
  const text = read(DIR + '/' + file)
    .replace(/<%[\s\S]*?%>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) short.push(`${file} (${words})`);
}
if (short.length) fail(`مقال أقصر من ${MIN_WORDS} كلمة: ${short.join(' · ')}`);
else console.log(`✅ كل المقالات ${MIN_WORDS} كلمة أو أكتر`);

// ── ٥) مفيش وعد بإطلاق في مقال ────────────────────────────
//
// مقال `restaurant-online-ordering` فضل شهور بيقول للزائر إن نظام
// المطاعم لسه مانزلش ويطلب منه يسجّل اهتمامه ويستنّى — والنظام
// شغّال وليه صفحة وديمو. الزائر اللي قرا المقال واقتنع اتقاله «قريباً»
// فمشي. ده مش غلط إملائي — ده صفحة مفهرسة بتقول حاجة مش صحيحة
// عن منتجنا.
//
// كل الأنظمة في `PRICES` شغّالة وليها ديمو. فمافيش حاجة «قريباً».

const PROMISES = [
  'بتجهّز قريباً',
  'هيتطلق قريباً',
  'عند الإطلاق',
  'قريباً إن شاء',
];
const promised = [];
for (const file of bodies) {
  const html = read(DIR + '/' + file);
  for (const phrase of PROMISES) {
    if (html.includes(phrase)) promised.push(`${file}: «${phrase}»`);
  }
}
if (promised.length) {
  fail('مقال بيوعد بإطلاق والنظام شغّال خلاص: ' + promised.join(' · '));
} else {
  console.log('✅ مفيش مقال بيقول للزائر يستنّى نظام شغّال');
}

process.exit(failed ? 1 : 0);
