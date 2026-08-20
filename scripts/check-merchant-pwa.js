#!/usr/bin/env node
/**
 * «تطبيق التاجر» كان لينك في المتصفّح.
 *
 * الـPush كان شغّال، إنما اللوحة نفسها مكنش لها مانيفست — يعني مافيش تثبيت،
 * والتاجر بيفتح المتصفّح ويكتب العنوان كل مرة.
 *
 * ── الأربعة اللي الفحص ده بيمسكهم ────────────────────────────────────────
 *
 * ١) **الزرار مايظهرش غير لما التثبيت يكون متاح فعلاً.** زرار «ثبّت» بيتعرض
 *    على طول بيدّي واحدة من تلاتة: يضغط ومايحصلش حاجة · يقفل رسالة المتصفّح
 *    وإحنا نقول «اتثبّت» · يكون مثبّت أصلاً وإحنا نطلب منه يثبّت تاني.
 *    المتصفّح هو اللي بيقول (`beforeinstallprompt`)، مش إحنا.
 *
 * ٢) **«اتثبّت» معناها المتصفّح قال `accepted`.** مش إننا فتحنا الرسالة.
 *
 * ٣) **آيفون ليها كلامها.** سفاري ما بتطلقش الحدث ده خالص، فالزرار هناك زرار
 *    ميت — الخطوات المكتوبة هي اللي بتشتغل.
 *
 * ٤) **المانيفست بيتجاب بالكوكيز.** من غير `use-credentials` المتصفّح بيجيبه
 *    بلا جلسة، والسيرفر مايعرفش التاجر مين — فالأيقونة بتتثبّت باسم عام على
 *    تليفون صاحب المتجر.
 *
 * وكمان: الـservice worker كان بيتسجّل بس مع تفعيل الإشعارات — واللي مش عايز
 * إشعارات مكنش هيشوف «ثبّت» أبداً، لأن المتصفّح مابيعرضش تثبيت من غير واحد.
 *
 *   node scripts/check-merchant-pwa.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

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

/* ── ١. المانيفست ─────────────────────────────────────────────────────── */
{
  const c = code('src/routes/company.js');
  check('اللوحة ليها مانيفست', /router\.get\('\/manifest\.webmanifest'/.test(c));
  check('واللي مش داخل مالوش مانيفست (٤٠٤ مش أيقونة بلا معنى)',
    /if \(!req\.session \|\| !req\.session\.companyId\) return res\.status\(404\)/.test(c));
  check('والاسم اسم المتجر مش اسم عام',
    /name: \(c\.company_name \|\| 'المتجر'\) \+ ' — لوحة التحكم'/.test(c));
  check('والمجال جوّه اللوحة — اللينك اللي بره بيفتح في المتصفّح',
    /scope: '\/company\/'/.test(c) && /start_url: '\/company\/dashboard'/.test(c));
  check('ومانيفست شخصي مايتخزّنش على بروكسي مشترك',
    /Cache-Control', 'private/.test(c));
  check('والأيقونة أيقونة المتجر لو عنده واحدة',
    /const icon = c\.logo_url \|\| '\/logo-192\.png'/.test(c));

  const top = raw('src/views/company/_layout_top.ejs');
  check('والقالب بيطلبه **بالكوكيز**',
    /rel="manifest" href="\/company\/manifest\.webmanifest" crossorigin="use-credentials"/.test(top));
  check('ولون الشريط لون المتجر',
    /<meta name="theme-color" content="<%= session\.themeColor \|\| '#2563eb' %>"/.test(top));
}

/* ── ٢. الزرار مابيوعدش ───────────────────────────────────────────────── */
{
  const js = code('public/js/install.js');
  check('الزرار مخفي لحد ما المتصفّح يقول إن التثبيت متاح',
    /window\.addEventListener\('beforeinstallprompt'/.test(js)
    && /btn\.style\.display = ''/.test(js));
  check('و«اتثبّت» من رد المتصفّح مش من إننا فتحنا الرسالة',
    /choice && choice\.outcome === 'accepted'/.test(js));
  check('واللي اتقفل بيتقال إنه ما اتثبتش',
    /ما اتثبتش/.test(raw('public/js/install.js')));
  check('واللي مثبّت خلاص مابيتطلبش منه يثبّت تاني',
    /display-mode: standalone/.test(js) && /if \(standalone\) return;/.test(js));
  check('والآيفون بتاخد خطواتها مش زرار ميت',
    /iPad\|iPhone\|iPod/.test(js) && /إضافة إلى الشاشة الرئيسية/.test(raw('public/js/install.js')));
  check('والمتصفّح اللي مش بيثبّت بيتقال كده صراحةً',
    /مش بيثبّت التطبيقات/.test(raw('public/js/install.js')));

  check('والـservice worker بيتسجّل من غير ما يستنى الإشعارات',
    /navigator\.serviceWorker\.register\('\/sw\.js'\)/.test(js)
    && /if \('serviceWorker' in navigator\) \{[\s\S]{0,200}window\.addEventListener\('load'/.test(js));

  const sw = code('public/sw.js');
  check('والـSW فيه `fetch` (المتصفّح مابيعرضش تثبيت من غيره)',
    /addEventListener\('fetch'/.test(sw));

  const card = raw('src/views/company/_install_app.ejs');
  check('والكارت نفسه مخفي في الـHTML',
    /id="installCard"[^>]*style="display:none"/.test(card));
  check('وبيقول إن اللوحة محتاجة إنترنت — مش تطبيق أوفلاين',
    /محتاجة إنترنت/.test(card));
  check('وموجود على اللوحة الرئيسية',
    /_install_app/.test(raw('src/views/company/dashboard.ejs')));
}

console.log(fail === 0
  ? '\n✅ اللوحة بتتثبّت باسم المتجر — والزرار مابيوعدش بحاجة المتصفّح مش عاملها.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
