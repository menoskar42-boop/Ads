#!/usr/bin/env node
/**
 * أسبوعين استنى أحداث مش جاية.
 *
 * حفظ أرقام البيكسل كان بيشيل الحروف الغريبة وخلاص، فأي حاجة بتتقبل. والغلطة
 * اللي بتحصل في العملي مش حروف غريبة — إنك تلزق **رقم المنصّة الغلط في
 * الخانة الغلط**: الـGA4 في خانة ميتا. الصفحة بتقول «اتحفظ»، والسكربت بيتحمّل
 * على المتجر، و`fbq('init','G-ABC123')` بيفشل **بصمت** في المتصفح — مفيش خطأ
 * على الشاشة، ومفيش أحداث في مدير الإعلانات، والتاجر مش عارف ليه.
 *
 * ── القواعد ──────────────────────────────────────────────────────────────
 *
 * ١) كل خانة ليها شكل، والرفض بيقول **إيه اللي اتلزق**: شكل غلط · سنيبت
 *    كامل · رقم منصّة تانية (وباسمها). تلات أسباب مختلفة لأن التاجر بيصلّح
 *    كل واحد بطريقة.
 *
 * ٢) **الفاضي مش غلط.** مسح الرقم قرار — التاجر بيوقف التتبّع.
 *
 * ٣) **زرار الاختبار بيقول اللي إحنا شايفينه بس.** الصفحة تقدر تعرف إن
 *    السكربت اتحمّل في المتصفح ده؛ مش تقدر تعرف إن ميتا استلمت الحدث. اللوحة
 *    بتقول كده صراحةً، وبتفرّق بين «مش متظبّط» و«مااتحملش» و«اتحمّل».
 *
 *   node scripts/check-pixel-ids.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PX = require('../src/lib/pixel_ids');

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

/* ── ١. الأرقام الصح بتعدّي ─────────────────────────────────────────────── */
{
  check('رقم ميتا بيعدّي', PX.validate('fb_pixel_id', '123456789012345').ok === true);
  check('ورقم تيك توك', PX.validate('tiktok_pixel_id', 'C1AB2CD3EF4GH5IJ6KL7').ok === true);
  check('ورقم GA4', PX.validate('ga4_id', 'G-ABCD123456').ok === true);
  // التاجر بيلزق بحروف صغيرة، وده مش خطأ منه.
  check('والحروف الصغيرة بتتظبّط مش بتترفض',
    PX.validate('ga4_id', 'g-abcd123456').value === 'G-ABCD123456');
  check('والمسافات حوالين الرقم مابتوقعوش',
    PX.validate('fb_pixel_id', '  123456789012345  ').ok === true);
}

/* ── ٢. الفاضي قرار مش غلط ──────────────────────────────────────────────── */
{
  const r = PX.validate('fb_pixel_id', '');
  check('الخانة الفاضية بتتقبل', r.ok === true);
  check('وبتتخزّن NULL — يعني التتبّع اتوقف فعلاً', r.value === null);
  const all = PX.validateAll({ fb_pixel_id: '', tiktok_pixel_id: '', ga4_id: '' });
  check('ومسح التلاتة مابيرفضش النموذج', Object.keys(all.errors).length === 0);
  check('والتلاتة بيبقوا NULL',
    all.values.fb_pixel_id === null && all.values.tiktok_pixel_id === null && all.values.ga4_id === null);
}

/* ── ٣. الغلطة اللي البند موجود عشانها ─────────────────────────────────── */
{
  const wrong = PX.validate('fb_pixel_id', 'G-ABCD123456');
  check('رقم GA4 في خانة ميتا بيترفض', wrong.ok === false);
  check('وبيتقال إنه رقم GA4 بالاسم', wrong.why === 'wrong_platform' && wrong.looksLike === 'ga4_id');

  const tt = PX.validate('tiktok_pixel_id', '123456789012345');
  check('ورقم ميتا في خانة تيك توك بيترفض باسمه',
    tt.why === 'wrong_platform' && tt.looksLike === 'fb_pixel_id');

  const snip = PX.validate('fb_pixel_id', "<script>fbq('init','123456789012345')</script>");
  check('والسنيبت كله بيترفض بسبب مختلف', snip.why === 'snippet');
  check('والرابط كمان', PX.validate('ga4_id', 'https://tagmanager.google.com/x').why === 'snippet');
  check('والخربشة بترجع «شكل»', PX.validate('ga4_id', 'ABC').why === 'shape');
  // مهم: الرفض مابيخزّنش نص نضيف — قيمة نص مقبولة أسوأ من رفض.
  check('وأي رفض قيمته null', [wrong, tt, snip].every((x) => x.value === null));
}

/* ── ٤. الحفظ مابيكملش على خانة غلط ────────────────────────────────────── */
{
  const route = code('src/routes/company.js');
  const post = (route.match(/router\.post\('\/marketing'[\s\S]*?\n\}\);/) || [''])[0];
  check('الراوت بيتحقّق قبل ما يكتب', /PX\.validateAll\(b\)/.test(post));
  check('وفيه خانة غلط = مفيش حفظ خالص',
    /if \(Object\.keys\(errors\)\.length\)[\s\S]{0,200}?return res\.redirect/.test(post));
  check('والحفظ بياخد القيم المتحقّق منها مش من الـbody',
    /values\.fb_pixel_id, values\.tiktok_pixel_id, values\.ga4_id/.test(post));
  check('ومفيش تنضيف قديم بيقبل أي حاجة',
    !/replace\(\/\[\^\\w\.\\-\]\/g, ''\)/.test(post));

  const get = (route.match(/router\.get\('\/marketing'[\s\S]*?\n\}\);/) || [''])[0];
  check('وأسباب الرفض من قايمة السيرفر مش من الرابط',
    /\['shape', 'snippet', 'wrong_platform'\]\.includes\(why\)/.test(get));
  check('والخانة نفسها لازم تكون خانة معروفة', /PX\.PLATFORMS\[field\]/.test(get));

  const view = raw('src/views/company/marketing.ejs');
  check('والشاشة بتقول السبب تحت الخانة نفسها', /badMsg\(f\)/.test(view));
  check('و«ده رقم منصّة تانية» جملة لوحدها', /wrong_platform/.test(view));
  check('و«ده سنيبت» جملة لوحدها', /snippet/.test(view));
}

/* ── ٥. لوحة الاختبار بتقول اللي شايفاه بس ─────────────────────────────── */
{
  const px = raw('src/views/partials/merchant_pixels.ejs');
  check('اللوحة بتفتح بالرابط بس', /odv_test=1/.test(px));
  check('وبتقول تلات حالات مش اتنين',
    /مش متظبّط/.test(px) && /مااتحمّلش/.test(px) && /اتحمّل في المتصفح/.test(px));
  // الادعاء اللي ممنوع: «الحدث وصل لميتا». إحنا شايفين المتصفح بس.
  check('ومابتدّعيش إن المنصّة استلمت الحدث',
    /Test Events/.test(px) && !/وصل للمنصّة|اتسجّل عند فيسبوك/.test(px));
  check('والحدث التجريبي بقيمة صفر عشان مايبوّظش أرقام التاجر',
    /odvTrack\('ViewContent', \{ name: 'odv-test', value: 0 \}\)/.test(px));
  check('والحالة بتتقرا من وجود الكائن نفسه',
    /!!window\.fbq/.test(px) && /!!window\.ttq/.test(px) && /!!window\.gtag/.test(px));
  check('والإعداد بيتبعت بدالة الـJSON الآمنة', /jsonLd\(!!__fb\)/.test(px));

  const view = raw('src/views/company/marketing.ejs');
  check('واللوحة فيها لينك من صفحة التاجر', /odv_test=1/.test(view));
  check('واللينك على متجر التاجر نفسه', /company\.slug %>\.oscardevs\.com/.test(view));
}

console.log(fail === 0
  ? '\n✅ الرقم الغلط في الخانة الغلط بيترفض باسمه، وزرار الاختبار بيقول اللي شايفه مش اللي نتمناه.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
