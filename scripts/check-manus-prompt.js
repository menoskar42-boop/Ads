#!/usr/bin/env node
/**
 * برومبت مانوس للسيو مربوط بالكود — مش نسخة متجمّدة من الحقائق.
 *
 * ── الغلطة اللي الفحص ده بيمنعها ───────────────────────────────────────
 *
 * برومبت ٦ في `docs/MANUS_SEO_GEO_PROMPT.md` بيدّي مانوس **قايمة روابط
 * حرفية** يفحصها في Search Console، وبيقول له **حقائق** عن السايت‌ماب
 * («adhd و mykid جوّاه بالفعل فالإرسال المنفصل تكرار — امسحه»).
 *
 * لو قطاع جديد اتضاف، أو صفحة اتشالت من السايت‌ماب، البرومبت مايعرفش.
 * ووقتها مانوس بيفحص قايمة ناقصة، أو — الأسوأ — **بيمسح سايت‌ماب**
 * بناءً على جملة بقت غلط. قرار المسح مالوش رجعة، فالحقيقة اللي وراه
 * لازم تتشد من الكود كل مرة مش تتكتب مرة.
 *
 * Usage: node scripts/check-manus-prompt.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const DOC = 'docs/MANUS_SEO_GEO_PROMPT.md';
const doc = read(DOC);
// السايت‌ماب نفسه ككود — بيتقرا نصاً، فالتعليقات تتشال الأول عشان تعليق
// بيشرح رابط ماينفعش يعدّي كأنه الرابط.
const sitemapSrc = read('src/routes/legal.js')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const { SECTORS } = require('../src/lib/sector_landings');
const { SERVICES } = require('../src/lib/services');
const gulfPages = require('../src/lib/gulf_pages');
const { ARTICLES } = require('../src/routes/blog_articles');

// ── ١) الـ١١ صفحة تجارية = اللي في الكود بالظبط، وكلها بـ/ar/ ──────────

const commercial = [...Object.keys(SECTORS).map((s) => '/' + s),
  '/car-workshop-management-egypt', '/dental'];

const missing = commercial.filter(
  (p) => !doc.includes('https://oscardevs.com/ar' + p)
);
check(`الـ${commercial.length} صفحة تجارية كلها في البرومبت بعنوان /ar/`,
  missing.length === 0,
  `ناقص: ${missing.join('، ')}. قطاع اتضاف في الكود ومادخلش قايمة الفحص، `
  + 'فمانوس هيطلب فهرسة لكل حاجة ماعدا الجديد — وهو أكتر واحد محتاجها.');

// والعكس: مفيش رابط في البرومبت مابقاش موجود في الكود.
const listed = [...doc.matchAll(/https:\/\/oscardevs\.com\/ar(\/[a-z0-9-]+)/g)]
  .map((m) => m[1]);
const stale = [...new Set(listed)].filter((p) => !commercial.includes(p));
check('مفيش صفحة في البرومبت اتشالت من الكود', stale.length === 0,
  `${stale.join('، ')} مذكورة في البرومبت ومش موجودة كصفحة قطاع. `
  + 'مانوس هيفحص رابط بيرد ٤٠٤ ويحسبه مشكلة فهرسة.');

// وماينفعش رابط بلا prefix في قايمة الفحص — دي بالظبط غلطة الفحص السابق.
const bareCommercial = commercial.filter((p) =>
  new RegExp('https://oscardevs\\.com' + p + '(?![a-z0-9-])').test(doc)
);
check('مفيش رابط تجاري بلا /ar/ في البرومبت', bareCommercial.length === 0,
  `${bareCommercial.join('، ')} مكتوبة من غير /ar/. الرابط ده بيرد ٣٠١ `
  + 'دلوقتي، وفحصه بيدّي "Page with redirect" — نتيجة مالهاش معنى.');

// ── ٢) حقيقة «adhd و mykid جوّه السايت‌ماب» لسه صح ─────────────────────
//
// دي الجملة اللي بناءً عليها مانوس **بيمسح** سايت‌ماب. لو اتشالت من
// الكود والبرومبت فاضل بيقولها، بيمسح غطاء حقيقي لصفحتين شغّالين.

for (const sub of ['adhd', 'mykid']) {
  const inSitemap = sitemapSrc.includes(`'https://${sub}.' + BASE_DOMAIN`);
  const claimed = doc.includes(`${sub}.oscardevs.com`);
  check(`${sub}: البرومبت والسايت‌ماب متفقين`, !claimed || inSitemap,
    `البرومبت بيقول إن ${sub} جوّه السايت‌ماب الأساسي وده بقى مش صح. `
    + 'مانوس هيمسح السايت‌ماب المنفصل بتاعه فيفضل بلا غطاء خالص.');
}

// والعكس تماماً لـmybible: البرومبت بيقول إنه **مش** جوّه، وبيمنع مسحه.
const mybibleIn = /'https:\/\/mybible\.' \+ BASE_DOMAIN/.test(sitemapSrc);
check('mybible لسه برّه السايت‌ماب زي ما البرومبت بيقول', !mybibleIn,
  'mybible بقى جوّه السايت‌ماب الأساسي، والبرومبت لسه بيقول لمانوس '
  + 'يسيب إدخاله المنفصل. حدّث البرومبت.');

// ── ٣) عدد الروابط الثابتة اللي البرومبت بيقارن عليه ───────────────────
//
// مانوس بيقارن "Discovered URLs" بالرقم ده عشان يعرف لو جوجل قرت الملف
// ناقص. رقم قديم = إنذار كاذب، أو أسوأ: مشكلة حقيقية عدّت كأنها عادية.

const BASE_ENTRIES = 10;   // / about contact blog apply faq help our-work company-facts compare
const EXTRA = 4;           // dental · ورشة · research · radiology
const SUBDOMAINS = 2;      // adhd · mykid
const staticCount = BASE_ENTRIES + Object.keys(SECTORS).length
  + Object.keys(SERVICES).length + gulfPages.pages().length
  + EXTRA + SUBDOMAINS + ARTICLES.length;

const ar = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[+d]);
check(`العدد الثابت في البرومبت = ${staticCount}`,
  doc.includes(ar(staticCount)) || doc.includes(String(staticCount)),
  `الكود بيطلع ${staticCount} رابط ثابت والبرومبت بيقول رقم تاني. `
  + 'مانوس بيقارن عليه عشان يكتشف لو جوجل قرت الملف ناقص.');

// ── ٤) السايت‌ماب الرسمي واحد — والبرومبت بيسمّيه صح ───────────────────

const declared = [...read('public/robots.txt').matchAll(/^Sitemap:\s*(\S+)/gmi)]
  .map((m) => m[1]);
check('robots.txt بيعلن سايت‌ماب واحد بس', declared.length === 1,
  `بيعلن ${declared.length}: ${declared.join('، ')}. البرومبت مبني على `
  + 'إن فيه واحد رسمي، وأي تاني تكرار.');
if (declared.length === 1) {
  check('البرومبت بيسمّي نفس السايت‌ماب', doc.includes(declared[0]),
    `robots.txt بيعلن ${declared[0]} والبرومبت بيتكلم عن رابط تاني — `
    + 'مانوس ممكن يمسح الرسمي وهو فاكره فرعي.');
}

// ── ٥) الخطوط الحمرا لسه مكتوبة ────────────────────────────────────────
//
// البرومبت ده بيدّي حد وصول لأداة فيها أزرار مالهاش رجعة. المنع لازم
// يفضل حرفي في النص، مش يتشال في تحرير سريع.

for (const [label, needle] of [
  ['منع المسح الأعمى (قاعدة التلات خطوات)', 'ماتمسحش'],
  ['منع لمس robots.txt', 'ماتلمسش'],
  ['منع أي إجراء تاني في Search Console', 'Removals'],
]) {
  check(label, doc.includes(needle),
    `اختفى «${needle}» من البرومبت. ده مش تفصيلة تحرير — ده الفرق بين `
    + 'فحص وبين مسح بيانات مالوش رجعة.');
}

console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ البرومبت متطابق مع الكود');
process.exit(failed ? 1 : 0);
