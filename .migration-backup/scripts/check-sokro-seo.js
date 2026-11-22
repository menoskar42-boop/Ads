#!/usr/bin/env node
/**
 * صفحات سكرو العامة تحت **نفس** قاعدة السيو بتاعة الموقع الأساسي.
 *
 * ── الغلطة اللي الفحص ده اتكتب بعدها ───────────────────────────────────
 *
 * اختبار خارجي (٢٠٢٦-٠٨-٢٧) قاس أوصاف أدلة سكرو ولقى اتنين منهم ١٢٨
 * و١٣٢ حرف — تحت الحد المكتوب في `BING_WEBMASTER_HELP.md` (١٥٠–١٦٠).
 *
 * والسبب مش إن حد كتبهم غلط: **سكرو كان بره كل الفحوص.** `seo-audit`
 * بيرندر قوالب EJS من `src/views`، وسكرو صفحاته بتتبني من
 * `sokro/content.js` بدالة `render` بتاعتها. فأربع صفحات عامة مفهرسة
 * على نطاق فرعي عاشوا من غير أي حارس.
 *
 * ودي نفس عيلة الغلطة اللي حصلت مع صفحات الخليج بالظبط: قالب بره الفحص
 * = عيب بيعيش. القاعدة **بتتقرا من `seo-audit`** مش بتتكتب تاني هنا،
 * فلو الحد اتغيّر هناك بيتغيّر هنا معاه.
 *
 * Usage: node scripts/check-sokro-seo.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// مصدر واحد للقاعدة — لو `DESC_MIN` اترفع في الموقع الأساسي، سكرو بيتبعه.
const { TITLE_MAX, DESC_MIN, DESC_MAX } = require('./seo-audit');
const content = require('../sokro/content');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

// ── ١) الصفحة الرئيسية ─────────────────────────────────────────────────
//
// عنوانها ووصفها ثابتين في `router.js` (مش في `content.js`)، فبيتقروا
// كنص. لو اتحوّلوا لمصدر تاني الريجيكس هيقع — وده صح: الفحص ماينفعش
// يفضل أخضر وهو مش لاقي اللي بيقيسه.
const router = fs.readFileSync(path.join(ROOT, 'sokro/router.js'), 'utf8');
const grab = (name) => (router.match(new RegExp('^const ' + name + " = '([^']*)'", 'm')) || [])[1];
const landing = { slug: '(الرئيسية)', title: grab('TITLE'), desc: grab('DESC') };
check('لقيت عنوان ووصف الصفحة الرئيسية في الكود',
  !!(landing.title && landing.desc),
  'الثابتين TITLE/DESC اتغيّر شكلهم في router.js — الفحص مش بيقيس حاجة.');

// ── ٢) كل صفحة عامة تحت نفس الحدود ─────────────────────────────────────

const pages = [landing].concat(content.PAGES.map((p) => ({ slug: p.slug, title: p.title, desc: p.desc })));
for (const p of pages) {
  if (!p.title || !p.desc) continue;
  check(`[${p.slug}] العنوان ${p.title.length} حرف`, p.title.length <= TITLE_MAX,
    `الحد ${TITLE_MAX} — العنوان الأطول بيتقصّ في نتيجة البحث.`);
  check(`[${p.slug}] الوصف ${p.desc.length} حرف`,
    p.desc.length >= DESC_MIN && p.desc.length <= DESC_MAX,
    `المطلوب ${DESC_MIN}–${DESC_MAX}. ده بالظبط اللي بينج بلّغ عنه.`);
}

// ── ٣) وكل صفحة في السايت‌ماب — مفيش دليل بره ──────────────────────────
//
// السايت‌ماب بيتبني من `content.PAGES`، فالتغطية مضمونة بالبناء. الفحص
// هنا بيتأكد إن ده لسه صحيح ومحدّش كتب قايمة بالإيد جنبها.
check('السايت‌ماب بيتبني من `content.PAGES` مش بقايمة مكتوبة',
  /content\.PAGES\.map/.test(router),
  'قايمة مكتوبة بالإيد هتنسى دليل — والدليل المنسي صفحة مالهاش طريق.');

// ── ٤) ولا إعلان على أي صفحة ───────────────────────────────────────────
//
// `/app` شاشة تطبيق: إعلان عليها مخالفة صريحة لسياسة أدسنس، والحساب
// `pub-3132188303904900` خط أحمر في `CLAUDE.md`.
const appHtml = fs.readFileSync(path.join(ROOT, 'sokro/ui/app.html'), 'utf8');
const ads = /adsbygoogle|pagead2\.googlesyndication/;
check('مفيش أدسنس في شاشة التطبيق', !ads.test(appHtml),
  'إعلان على شاشة تطبيق مخالفة صريحة لسياسة أدسنس.');
check('ولا في صفحات المحتوى', !ads.test(router) && !ads.test(fs.readFileSync(path.join(ROOT, 'sokro/content.js'), 'utf8')),
  'صفحات سكرو مالهاش إعلانات — التطبيق اشتراك مش إعلانات.');
check('و`/app` عليها noindex', /<meta name="robots" content="noindex/.test(appHtml),
  'شاشة التطبيق ماتتأرشفش — محتوى بلا قيمة للباحث وسياسة أدسنس.');

console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ سيو سكرو تحت نفس قاعدة الموقع');
process.exit(failed ? 1 : 0);
