#!/usr/bin/env node
/**
 * كلام مش بتاع التاجر معروض على صفحته باسمه.
 *
 * صفحة البورتفوليو العامة بتعرض **ستة** كروت خدمات، واللوحة كانت بتعدّل
 * **تلاتة**. يعني نص الخدمات اللي على صفحة التاجر كان النص الافتراضي بتاع
 * المهنة — كلام محترم، بس مش كلامه، ومفيش مكان في النظام كله يغيّره منه.
 * زبون بيقرا الصفحة مش عارف إن التلاتة التانيين مش من التاجر.
 *
 * والتانية: `portfolio_items.before_image_url` موجود في المخطط من ساعة ما
 * دراسة الحالة اتعملت، **ومفيش أي شاشة بتكتبه** — نفس شكل الغلطة اللي كانت
 * في كتالوج موبيليا (عمود مستني حد يملاه ومحدش يقدر). فالمقارنة «قبل/بعد»،
 * وهي أقوى حاجة في دراسة حالة، ماكانتش بتوصل أبداً.
 *
 * ── القواعد ──────────────────────────────────────────────────────────────
 *
 * ١) اللي بيتعرض بيتعدّل: عدد خانات الخدمات في اللوحة = عدد الكروت في
 *    الصفحة العامة. الفحص بيعدّهم من الملفين نفسهم مش من رقم مكتوب هنا.
 * ٢) النص الرمادي في اللوحة = النص اللي هيظهر فعلاً لو الخانة فضلت فاضية.
 * ٣) **«قبل» من غير «بعد» مش مقارنة** — مابتتخزّنش، ومابتتعرضش.
 * ٤) الصورتين بيتمسحوا مع الصف — ملف بيفضل على القرص للأبد مشكلة بتكبر.
 *
 *   node scripts/check-portfolio-edit.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { getPreset, PRESETS } = require('../src/lib/portfolio_presets');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── ١. اللي بيتعرض بيتعدّل ────────────────────────────────────────────── */
{
  const page = raw('src/views/tenant_portfolio.ejs');
  // الكروت اللي الصفحة العامة بتقرا منها.
  const shown = new Set((page.match(/company\.service(\d)_title/g) || [])
    .map((m) => m.match(/\d/)[0]));
  const profile = raw('src/views/company/profile.ejs');
  const server = code('server.js');
  const route = code('src/routes/company.js');

  check('الصفحة العامة بتعرض ٦ خدمات', shown.size === 6, [...shown].join(','));

  // اللوحة بتبني الخانات من لوب على ١..٦ — فالعدد بيتقرا من اللوب نفسه.
  const loop = /\[1,2,3,4,5,6\]\.map\(function\(i\)\{/.test(profile)
    && /'service' \+ i \+ '_title'/.test(profile);
  check('واللوحة بتعدّل نفس العدد', loop);

  const missingCols = [...shown].filter(
    (n) => !new RegExp(`ADD COLUMN IF NOT EXISTS service${n}_title`).test(server));
  check('وكل خدمة ليها عمود في القاعدة', missingCols.length === 0, missingCols.join(',') || 'تمام');

  const missingSave = [...shown].filter((n) => !new RegExp(`service${n}_title=`).test(route));
  check('وكلها بتتحفظ من الراوت', missingSave.length === 0, missingSave.join(',') || 'تمام');
  const missingBind = [...shown].filter((n) => !new RegExp(`svc\\('service${n}_title'\\)`).test(route));
  check('وقيمها بتتبعت فعلاً', missingBind.length === 0, missingBind.join(',') || 'تمام');
}

/* ── ٢. النص الرمادي = اللي هيظهر ─────────────────────────────────────── */
{
  const profile = raw('src/views/company/profile.ejs');
  check('اللوحة بتقرا الافتراضي من preset المهنة مش من نص مكتوب فيها',
    /preset\.services/.test(profile) && !/'الاستشارات'/.test(profile));

  const route = code('src/routes/company.js');
  check('والراوت بيبعت الـpreset للصفحة', /preset: getPreset\(/.test(route));
  // وكل مهنة عندها ست خدمات فعلاً، وإلا الخانة الرمادية هتفضل فاضية.
  const short = Object.keys(PRESETS).filter((k) => (PRESETS[k].services || []).length < 6);
  check('وكل مهنة عندها ٦ خدمات افتراضية', short.length === 0, short.join(', ') || 'تمام');
  check('و`getPreset` بترجع حاجة حتى للمهنة المش معروفة',
    !!(getPreset('لا-توجد') || {}).services);
}

/* ── ٣. «قبل» من غير «بعد» مش مقارنة ──────────────────────────────────── */
{
  const route = code('src/routes/company.js');
  check('الفورم بيقبل الصورتين', /name: 'before_image_file'/.test(route));
  check('و«قبل» مابتتخزّنش من غير «بعد»',
    /if \(finalImageUrl\) beforeUrl = `\/uploads\/\$\{beforeFile\.filename\}`;/.test(route)
    && /else removeUpload\(`\/uploads\/\$\{beforeFile\.filename\}`\)/.test(route));
  check('والتعديل بيشيلها لو الأساسية راحت',
    /if \(!imageUrl && beforeUrl\) \{ removeUpload\(beforeUrl\); beforeUrl = null; \}/.test(route));
  check('وفيه مسح صريح', /remove_before === '1'/.test(route));
  check('والقديمة بتتشال لما تتبدّل',
    /const old = beforeUrl;[\s\S]{0,120}?removeUpload\(old\)/.test(route));
  check('والعمود بيتكتب في الإضافة والتعديل',
    /before_image_url\)\s*\n?\s*VALUES/.test(route) && /before_image_url=\$15/.test(route));

  const page = raw('src/views/tenant_portfolio.ejs');
  check('والصفحة بتعرض المقارنة لما الاتنين موجودين بس',
    /item\.before_image_url && item\.image_url/.test(page));
  check('وكل صورة مكتوب تحتها قبل ولا بعد', /figcaption>قبل</.test(page) && /figcaption>بعد</.test(page));
  // الوصف البديل لازم يقول أنهي واحدة — قارئ الشاشة مش شايف الترتيب.
  check('والوصف البديل بيقول أنهي واحدة',
    /alt="قبل — /.test(page) && /alt="بعد — /.test(page));

  const fields = raw('src/views/company/_portfolio_fields.ejs');
  check('واللوحة فيها خانة «قبل»', /name="before_image_file"/.test(fields));
  check('وبتقول إن الأساسية هي «بعد»', /هي «بعد»/.test(fields));
}

/* ── ٤. الملفات بتروح مع الصف ─────────────────────────────────────────── */
{
  const route = code('src/routes/company.js');
  check('المسح بيرجّع الصورتين',
    /RETURNING image_url, before_image_url/.test(route));
  check('وبيشيلهم الاتنين من القرص',
    /removeUpload\(gone\.rows\[0\]\.image_url\); removeUpload\(gone\.rows\[0\]\.before_image_url\)/.test(route));
}

console.log(fail === 0
  ? '\n✅ الست خدمات بتتعدّل من اللوحة، و«قبل/بعد» بتوصل للصفحة — ومفيش صورة يتيمة.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
