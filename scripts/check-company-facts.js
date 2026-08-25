#!/usr/bin/env node
/**
 * قاموس الحقائق: رقم واحد، مصدر واحد.
 *
 * ── المشكلة اللي كتبت الفحص ده ──────────────────────────────────────────
 *
 * مراجعة الجيو الخارجية حطّت «اعتماد قاموس حقائق مركزي» كأول بند P0.
 * السبب إن محرّك الإجابة لما بيتسأل «كم نظاماً تقدّم OscarDevs؟» بيقرا
 * كذا صفحة عندنا؛ لو صفحة قالت رقم وصفحة قالت غيره **مافيش إجابة واحدة
 * يقتبسها**، وأسوأ حالة إنه يقتبس الغلط.
 *
 * وقت كتابة الفحص الأرقام كانت **متطابقة فعلاً** — بس كل واحد منهم
 * متكتوب بالإيد في خمس قوالب. الاتفاق كان صدفة مش نظام: أول ما حد يزوّد
 * نظام تلتاشر لازم يفتكر خمس أماكن، والفحص ده بيخلّي النسيان مستحيل.
 *
 * ── الحاجة اللي الفحص بيحرسها فعلاً ────────────────────────────────────
 *
 * مش «الأرقام متساوية» — دي نتيجة. اللي بيتحرس هو **إن مفيش رقم متكتوب
 * بالإيد أصلاً**: كل قالب بيقرا من `facts`. رقمين متساويين مكتوبين
 * بالإيد بيعدّوا أي فحص مقارنة، وبيتعارضوا بعد أول تعديل.
 *
 * وعدد الأنظمة **محسوب** من `PRICES` مش مخزّن: النظام الجديد لازم
 * يتسعّر، فالعدد بيتغيّر لوحده في التلات أماكن مع بعض.
 *
 *   node scripts/check-company-facts.js
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
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const CF = require('../src/lib/company_facts');
const { PRICES } = require('../src/lib/pricing');
const f = CF.facts();

/* ── ١. العدد محسوب مش مخزّن ──────────────────────────────────────────── */
{
  const src = raw('src/lib/company_facts.js');
  check('عدد الأنظمة محسوب من `PRICES` مش رقم مكتوب',
    /Object\.keys\(PRICES\)\.length/.test(src) && !/SYSTEMS_COUNT = \d+/.test(src),
    f.systemsCount + ' نظام');

  check('والعدد بيساوي قايمة الأسعار فعلاً',
    f.systemsCount === Object.keys(PRICES).length);
}

/* ── ٢. القوالب بتقرا من المصدر ───────────────────────────────────────── */
{
  const home = raw('src/views/home.ejs');
  check('الصفحة الرئيسية بتقرا الأرقام من `facts`',
    /facts\.systemsCount/.test(home) && /facts\.deliveryDays/.test(home)
    && /facts\.projectsDelivered/.test(home));

  check('وشارة العرض المجاني من `facts.freeOffer`',
    /facts\.freeOffer/.test(home) && !/مجاناً لمدة ٦ شهور/.test(home),
    'كانت متكتوبة ١٢ مرة بالإيد');

  // الرقم المكتوب بالإيد هو المشكلة، مش اختلافه.
  //
  // البحث في الصفحة كلها **مابينفعش**: `12` بتقع على `padding:12px`،
  // و`50` بتقع على «٥٠٪ مقدم» — شرط دفع مالوش علاقة. فالفحص بيتقفل على
  // **شريط الأرقام نفسه**: البلوك ده وظيفته يعرض الحقائق، فأي رقم حرفي
  // جوّاه رقم اتكتب بالإيد.
  const bar = (home.match(/<div class="stats-bar">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/) || [''])[0];
  check('شريط الأرقام موجود', bar.length > 0);
  const shownInBar = bar.replace(/<%[\s\S]*?%>/g, ' ');
  const hard = (shownInBar.match(/\d+/g) || []);
  check('ومفيش رقم متكتوب بالإيد في شريط الأرقام',
    hard.length === 0, hard.join(', ') || 'كله من `facts`');
}

/* ── ٣. المرور الوحيد للقوالب ─────────────────────────────────────────── */
{
  const mw = raw('src/middleware/urls.js');
  check('الحقائق بتتحط في `res.locals` (EJS مافيهاش require)',
    /res\.locals\.facts = companyFacts\.facts\(\)/.test(mw)
    && /require\('\.\.\/lib\/company_facts'\)/.test(mw));

  // والفحص نفسه لازم يقرا من نفس المصدر، وإلا بيرندر أرقام غير المنشورة.
  const audit = raw('scripts/seo-audit.js');
  check('وفحص السيو بيقرا من نفس المصدر مش نسخة متجمّدة',
    /facts: require\('\.\.\/src\/lib\/company_facts'\)\.facts\(\)/.test(audit));
}

/* ── ٤. الرقم اللي مالوش مصدر معلَّم ──────────────────────────────────── */
{
  check('«مشروع تم تسليمه» معلَّم إنه بلا مصدر',
    CF.PROJECTS_DELIVERED.sourced === false,
    'قرار «نشيله ولا نوثّقه» لسه على المالك');

  // ده الشرط اللي بيمنع الرقم يكبر بالسكوت. زيادته من غير مصدر ادعاء
  // على صفحة بتدّعي دقّة — وده اللي بيخلّي محرّك الإجابة مايثقش فيها.
  check('وقيمته ماتغيّرتش من غير ما يتوثّق',
    CF.PROJECTS_DELIVERED.value === 50 || CF.PROJECTS_DELIVERED.sourced === true,
    'لو زوّدته لازم `sourced: true` ومعاه المصدر');
}

/* ── ٥. وقت التسليم مكتوب معاه بيخصّ إيه ──────────────────────────────── */
{
  check('وقت التسليم معاه نطاقه',
    typeof CF.DELIVERY_SCOPE === 'string' && CF.DELIVERY_SCOPE.length > 10,
    CF.DELIVERY_SCOPE);

  // `/faq` بتقول إن المشروع المخصّص من أسبوع لأسبوعين. ده **مش** تعارض
  // طالما كل رقم مكتوب جنبه بيخصّ إيه — الرقم من غير وصفه هو الادعاء.
  const faq = raw('src/views/legal/faq.ejs');
  check('و`/faq` بتفرّق بين الجاهز والمخصّص',
    /أسبوع لأسبوعين/.test(faq) && /فوراً/.test(faq));
}

console.log(fail ? `\n⚠️  ${fail} مخالفة.` : '\nالحقائق من مصدر واحد.');
process.exit(fail ? 1 : 0);
