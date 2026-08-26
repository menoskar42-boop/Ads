#!/usr/bin/env node
/**
 * الديمو مايتأرشفش ومايشيلش إعلانات — والترتيب في الكود هو اللي بيضمن ده.
 *
 * ── ليه فحص لوحده ──────────────────────────────────────────────────────
 *
 * الجيت موجود في `src/routes/tenant.js`:
 *
 *     if (isDemoSlug(company.slug)) indexable = false;   // (أ)
 *     if (!indexable) res.locals.showAds = false;        // (ب)
 *
 * الاتنين صح، بس **الترتيب هو اللي بيشتغل**. لو حد نقل (ب) فوق (أ) — وده
 * تعديل شكله بريء تماماً — الديمو يفضل `noindex` بس **يرجع ياخد إعلانات**،
 * لأن `showAds` هتتحسب على `indexable` القديمة قبل ما الديمو يطفّيها.
 *
 * والنتيجة: إعلانات أدسنس على متجر ديمو بعشر منتجات مخترعة بأسعارها. ودي
 * مخالفة «محتوى قليل القيمة» و«محتوى عيّنة معروض كأنه حقيقي» مع بعض، على
 * الحساب اللي `CLAUDE.md` بيقول إنه خط أحمر (`pub-3132188303904900`).
 *
 * ودي مش نظرية: المراجعة الخارجية سجّلتها فعلاً مرة (`BUG-DELTA-004`).
 * الكود دلوقتي صح، والفحص ده هو اللي بيمنع رجوعها.
 *
 * ⚠️ الفحص ده **بيقرا ترتيب الأسطر**، مش بيشغّل الراوت — الراوت محتاج
 * قاعدة بيانات. فحص بيشغّل كان أقوى، بس فحص بيقرا الترتيب أحسن بكتير من
 * مفيش فحص.
 *
 * Usage: node scripts/check-demo-ads.js
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

/** شيل التعليقات — التعليق اللي بيشرح الغلط مالوش ذنب. */
const code = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ');

const src = code(read('src/routes/tenant.js'));

// ── ١) الجيت موجود ──────────────────────────────────────────────────────

const gateRe = /if \(isDemoSlug\(company\.slug\)\) indexable = false;/;
const adsRe = /if \(!indexable\) res\.locals\.showAds = false;/;

check('جيت الديمو موجود في `tenant.js`', gateRe.test(src),
  'من غيره أي ديمو بيتأرشف كأنه نشاط حقيقي.');
check('وجيت الإعلانات على الصفحة الرقيقة موجود', adsRe.test(src),
  'من غيره الصفحة الرقيقة بتاخد إعلانات.');

// ── ٢) والترتيب صح ─────────────────────────────────────────────────────
//
// دي القاعدة اللي الفحص اتكتب عشانها.

const gateAt = src.search(gateRe);
const adsAt = src.search(adsRe);
check('جيت الديمو **قبل** جيت الإعلانات',
  gateAt > -1 && adsAt > -1 && gateAt < adsAt,
  `الديمو عند ${gateAt} والإعلانات عند ${adsAt}. لو الإعلانات اتحسبت الأول، `
  + 'الديمو بيفضل noindex بس **بيرجع ياخد إعلانات** — والمراجعة الخارجية '
  + 'سجّلت الحالة دي قبل كده كـ`BUG-DELTA-004`.');

// ── ٣) كل ديمو في قايمة واحدة، والقايمة هي اللي بتتقرا ──────────────────
//
// النسخة القديمة كانت بتستثني كل نوع باسمه (`slug !== 'petra'` …) وكان
// بينتسي منها أنواع. `isDemoSlug` قايمة واحدة.

const { DEMO_SLUGS } = require('../src/lib/demo_mode');
check(`قايمة الديمو فيها ${DEMO_SLUGS.size} سلَج`, DEMO_SLUGS.size >= 12,
  'ناقصة — أي ديمو بره القايمة بيتأرشف وعليه إعلانات.');

check('مفيش استثناء بسلَج مكتوب بالإيد بدل القايمة',
  !/company\.slug !== '[a-z]+'/.test(src),
  'استثناء بالاسم معناه إن الديمو الجاي هيتنسى — ودي بالظبط الغلطة اللي '
  + '`isDemoSlug` اتعملت عشانها.');

// ── ٤) والقطاعات اللي قالبها رقيق مالهاش إعلانات ────────────────────────

const AD_FREE = ['pharmacy', 'clinic', 'nutrition'];
for (const t of AD_FREE) {
  check(`قطاع ${t} بلا إعلانات`,
    new RegExp(`company\\.page_type === '${t}'\\) res\\.locals\\.showAds = false`).test(src),
    'قرار المالك: القطاعات دي خالية من الإعلانات (بيانات طبية/دوائية).');
}
check('والقطاعات الخمسة الرقيقة بلا إعلانات',
  /\['orders', 'workshop', 'hall', 'nursery', 'installments'\][\s\S]{0,80}showAds = false/.test(src),
  'قوالبها بتطلع ١٠١–١٥٩ كلمة، والحد ٢٥٠ للصفحة اللي عليها إعلانات.');

process.exit(failed ? 1 : 0);
