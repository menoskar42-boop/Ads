#!/usr/bin/env node
/**
 * صفحة «اشتراك ثابت ولا عمولة؟» (البند ٦٤).
 *
 * الخطة كاتبة على البند ده شرط صريح: **كل رقم فيها لازم يتأكّد من الكود
 * والأسعار الفعلية قبل النشر**. فالفحص ده بيفرض حاجتين:
 *
 * ── ١) مفيش رقم سعر مكتوب بالإيد في الصفحة ──────────────────────────────
 *
 * الصفحة بتقرا `src/lib/pricing.js` — نفس الملف اللي الاتناشر صفحة قطاع
 * بيسعّروا منه. رقم متكتوب في القالب معناه إن تغيير السعر في مكان واحد بيسيب
 * الصفحة دي بتقول رقم قديم، وهي بالذات صفحة **مقارنة أسعار**.
 *
 * ── ٢) مفيش اسم منافس ولا سعر منافس ────────────────────────────────────
 *
 * ودي مش مجاملة. أسعار المنصّات بتتغيّر، ونشر رقم عن شركة تانية ممكن يكون
 * غلط النهاردة أو بكرة — وده ادعاء مضلّل (سياسة أدسنس)، والقارئ اللي بيقارن
 * مش بيصدّقه أصلاً. المقارنة بين **النماذج**، والقارئ بيحسب بأرقامه هو.
 *
 * وكمان: الصفحة لازم تقول **اللي إحنا مش بنعمله**. صفحة مقارنة كلها مميزات
 * إعلان مش مقارنة.
 *
 *   node scripts/check-compare-page.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { PRICES, FREE_MONTHS, arabicNumber } = require('../src/lib/pricing');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const view = raw('src/views/legal/compare.ejs');
const route = raw('src/routes/legal.js');

/* ── ١. الأرقام من الكود ───────────────────────────────────────────────── */
{
  check('الراوت بيقرا الأسعار من `pricing.js`',
    /require\('\.\.\/lib\/pricing'\)/.test(route) && /router\.get\('\/compare'/.test(route));
  check('والصفحة بترسم الأسعار من الصفوف اللي جاتلها',
    /rows\.forEach\(function\(r\)\{/.test(view)
    && /arabicNumber\(r\.monthly\)/.test(view) && /arabicNumber\(r\.buy\)/.test(view));

  // مفيش سعر من أسعارنا متكتوب بالإيد في القالب.
  const ourNumbers = new Set();
  for (const p of Object.values(PRICES)) { ourNumbers.add(String(p.buy)); ourNumbers.add(String(p.monthly)); }
  const body = view.replace(/<%[\s\S]*?%>/g, ' ');   // شيل كود EJS، سيب النص المعروض
  const hardcoded = [...ourNumbers].filter((n) => {
    const ar = arabicNumber(Number(n));
    return body.includes(ar) || new RegExp('(^|[^\\d])' + n + '([^\\d]|$)').test(body);
  });
  check('ومفيش سعر من أسعارنا متكتوب بالإيد في القالب',
    hardcoded.length === 0, hardcoded.join(', ') || 'نضيف');

  check('وعدد الأنظمة محسوب مش مكتوب',
    /systemCount: rows\.length/.test(route) && /arabicNumber\(systemCount\)/.test(view));
  check('وشهور المجانية من نفس الملف',
    /arabicNumber\(FREE_MONTHS\)/.test(view) && FREE_MONTHS > 0);
  check('وكل نظام في `pricing.js` له اسم عربي في الصفحة',
    Object.keys(PRICES).every((k) => new RegExp("\\b" + k + ":").test(route.slice(route.indexOf('SYSTEM_LABELS')))),
    Object.keys(PRICES).length + ' نظام');
}

/* ── ٢. مفيش منافس بالاسم ولا برقمه ───────────────────────────────────── */
{
  const RIVALS = ['Wuilt', 'ويلت', 'زد', 'Zid', 'دكانة', 'دُكّانة', 'كنز', 'Kenz',
    'Shopify', 'شوبيفاي', 'Salla', 'سلة', 'Expand', 'أضعاف'];
  const named = RIVALS.filter((r) => view.includes(r));
  check('مفيش منافس متسمّى بالاسم', named.length === 0, named.join(', ') || 'ولا واحد');
  check('والصفحة بتقول ليه مافيش أسماء',
    /مش مقارنة بينا وبين شركة باسمها/.test(view));
  check('والنسبة المستعملة في الحسبة معلَنة إنها مثال',
    /مثال للحسبة مش رقم منصّة معيّنة/.test(view));
}

/* ── ٣. القيود مكتوبة زي المميزات ─────────────────────────────────────── */
{
  check('فيه قسم بيقول اللي إحنا مش بنعمله', /وإيه اللي إحنا <em>مش<\/em> بنعمله/.test(view));
  const limits = ['تطبيق موبايل أصلي', 'Google Merchant', 'شبكة مندوبين', 'Marketplace'];
  const missing = limits.filter((l) => !view.includes(l));
  check('وبيسمّي القيود بأسمائها', missing.length === 0, missing.join(', ') || limits.length + ' قيد');
  check('ومفيش ادعاء «إحنا الأفضل»',
    !/إحنا الأفضل|أفضل منصّة|الأرخص في السوق|رقم واحد في/.test(view));
  check('والصفحة بتدّي القارئ أسئلة يشغّلها علينا كمان',
    /تقدر تشغّله علينا دلوقتي/.test(view));
}

/* ── ٤. الأرقام المتنازع عليها مش هنا ─────────────────────────────────── */
{
  // تلات أرقام لسه مستنيين قرار المالك (قسم «ص» في BACKLOG) — ممنوع تظهر
  // على صفحة مقارنة قبل ما يتأكّد مصدرها.
  const unsourced = ['+٥٠ مشروع', '٥٠ مشروع', 'تسليم ٧ أيام', '٧ أيام', 'أرخص ٣', '١٢ ضعف'];
  const leaked = unsourced.filter((u) => view.includes(u));
  check('ومفيش رقم من الأرقام اللي لسه بلا مصدر', leaked.length === 0, leaked.join(', ') || 'نضيف');
}

/* ── ٥. الصفحة في السايت‌ماب ───────────────────────────────────────────── */
{
  check('الصفحة في السايت‌ماب', /\{ loc: '\/compare'/.test(route));
  check('وفي فحص السيو (بتترسم فعلاً)',
    /compare: \{ file: 'legal\/compare\.ejs'/.test(raw('scripts/seo-audit.js')));
}

console.log(fail === 0
  ? '\n✅ المقارنة بين النماذج، وأرقامنا من الكود، والقيود مكتوبة.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
