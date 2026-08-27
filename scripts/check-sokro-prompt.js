#!/usr/bin/env node
/**
 * برومبت اختبار سكرو مربوط بالكود.
 *
 * ── الغلطة اللي الفحص ده بيمنعها ───────────────────────────────────────
 *
 * البرومبت بيدّي مراجع خارجي **قايمة مسارات وأسماء ورسايل خطأ حرفية**
 * يختبرها. لو مسار اتغيّر أو دليل اتشال أو نطاق حسّاس اتضاف، البرومبت
 * مايعرفش — والمراجع بيرجع يقول «الصفحة ٤٠٤» على حاجة إحنا شيلناها،
 * أو **مايختبرش** بوابة موافقة جديدة لأنها مش في قايمته. والتانية أخطر:
 * نطاق حسّاس بلا اختبار معناه إننا مش عارفين إن بوابته شغّالة.
 *
 * Usage: node scripts/check-sokro-prompt.js
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

const DOC = 'docs/SOKRO_QA_PROMPT.md';
const doc = read(DOC);
const router = read('sokro/router.js');

// ── ١) كل مسار في البرومبت له راوت فعلاً ───────────────────────────────
//
// ماعدا واحد مقصود: المسار الوهمي اللي بيختبر الـ٤٠٤.

const DELIBERATE_404 = '/guides/does-not-exist';
const paths = [...new Set([...doc.matchAll(/https:\/\/sokro\.oscardevs\.com(\/[a-z0-9/._-]*)/g)]
  .map((m) => m[1]))].filter((p) => p !== DELIBERATE_404);

const routed = (p) => {
  if (p === '/' ) return /router\.get\('\/',/.test(router);
  if (p.startsWith('/guides/')) return /router\.get\('\/guides\/:slug'/.test(router);
  return new RegExp("router\\.(get|post)\\('" + p.replace(/[.]/g, '\\.') + "'").test(router);
};
const dead = paths.filter((p) => !routed(p));
check(`الـ${paths.length} مسار في البرومبت ليهم راوتات`, dead.length === 0,
  `${dead.join('، ')} مش موجودين في sokro/router.js. المراجع هيرجع بتقرير `
  + 'عن ٤٠٤ على حاجة إحنا شيلناها.');

check('ومسار الـ٤٠٤ المقصود لسه في البرومبت', doc.includes(DELIBERATE_404),
  'من غيره مافيش حاجة بتتأكد إن الدليل المش موجود بيرد ٤٠٤ مش ٢٠٠.');

// ── ٢) الأدلة العامة = اللي في `content.js` بالظبط ─────────────────────

const { PAGES } = require('../sokro/content');
const slugs = PAGES.map((p) => p.slug);
const missing = slugs.filter((s) => !doc.includes('/guides/' + s));
check(`الـ${slugs.length} دليل كلهم في البرومبت`, missing.length === 0,
  `ناقص: ${missing.join('، ')}. دليل جديد بره الاختبار معناه صفحة عامة `
  + 'مفهرسة محدّش شافها.');

const listed = [...doc.matchAll(/\/guides\/([a-z0-9-]+)/g)].map((m) => m[1])
  .filter((s) => s !== DELIBERATE_404.split('/').pop());
const stale = [...new Set(listed)].filter((s) => !slugs.includes(s));
check('ومفيش دليل في البرومبت اتشال من الكود', stale.length === 0,
  `${stale.join('، ')} مذكورين في البرومبت ومش في content.js.`);

// ── ٣) النطاقات الحسّاسة = اللي في `permissions` بالظبط ────────────────
//
// دي أخطر بند: نطاق حسّاس جديد مش في البرومبت معناه بوابة موافقة
// محدّش اختبرها.

const perms = read('sokro/permissions/index.js')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const block = (perms.match(/const SENSITIVE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
const scopes = [...block.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
check('في نطاقات حسّاسة معرّفة', scopes.length > 0,
  'ماقدرتش أقرا SENSITIVE من sokro/permissions/index.js — الفحص أعمى.');
const unlisted = scopes.filter((s) => !doc.includes(s));
check(`الـ${scopes.length} نطاق حسّاس كلهم مذكورين في البرومبت`, unlisted.length === 0,
  `ناقص: ${unlisted.join('، ')}. النطاق اللي مش في قايمة المراجع `
  + 'بوابته مابتتختبرش — ومش هنعرف إنها بايظة غير من عميل.');

// ── ٤) رسايل الخطأ المقتبسة حرفياً لسه زي ما هي ────────────────────────
//
// البرومبت بيقول للمراجع «الرسالة دي متوقّعة، كمّل». لو النص اتغيّر،
// بيتبلّغ عنها كعطلة — أو الأسوأ: عطلة حقيقية تعدّي كأنها متوقّعة.

const quoted = 'تعذّر إنشاء PDF على الخادم حاليًا — استخدم Excel أو Markdown';
check('رسالة تعذّر الـPDF مطابقة للكود', router.includes(quoted) && doc.includes(quoted),
  'البرومبت بيقول للمراجع إن الرسالة دي متوقّعة — لو اتغيّرت في الكود '
  + 'هيتبلّغ عنها كعطلة، أو عطلة حقيقية تعدّي كأنها متوقّعة.');

// ── ٥) الخطوط الحمرا لسه مكتوبة ────────────────────────────────────────
//
// سكرو **بينفّذ**. البرومبت ده بيدّي حد وصول لمساعد بيفتح متصفح ويبعت
// رسايل ويعمل مكالمات. المنع لازم يفضل حرفي في النص.

for (const [label, needle] of [
  ['منع الموافقة على أي إجراء حسّاس', 'ماتوافقش'],
  ['منع بيانات الدخول الحقيقية', 'ماتدخلش أي بيانات دخول حقيقية'],
  ['منع إرسال واتساب حقيقي أو مكالمة', 'ماتبعتش رسالة واتساب حقيقية'],
  ['منع أي حاجة بفلوس', 'مفيش أي حاجة ليها علاقة بفلوس'],
]) {
  check(label, doc.includes(needle),
    `اختفى «${needle}». ده مش تفصيلة تحرير — سكرو بينفّذ فعلاً.`);
}

// ── ٦) وحالة الميزات بتتقرا مش بتتفترض ─────────────────────────────────

const config = require('../sokro/core/config');
check('البرومبت بيطلب قراءة `features` من /api/ping',
  doc.includes('features') && doc.includes('/api/ping'),
  'من غير ده المراجع هيحكم على أكشن إنه بايظ وهو مطفي بإعداد.');
check('وبينبّه إن browser مطفي افتراضياً',
  config.features.browser === true || doc.includes('browser'),
  'الإعداد بيقول browser=false والبرومبت مابينبّهش — هيتبلّغ كعطلة.');

console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ برومبت سكرو متطابق مع الكود');
process.exit(failed ? 1 : 0);
