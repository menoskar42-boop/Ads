'use strict';

/**
 * قاموس الحقائق المركزي — الرقم الواحد اللي كل الصفحات بتقراه.
 *
 * ── ليه ──────────────────────────────────────────────────────────────────
 *
 * مراجعة الجيو الخارجية حطّت ده كأول بند P0، والسبب مش شكلي: محرّك
 * الإجابة لما يتسأل «كم نظاماً تقدّم OscarDevs؟» بيقرا كذا صفحة عندنا.
 * لو صفحة قالت رقم وصفحة قالت غيره، **مافيش إجابة واحدة يقتبسها** —
 * وأحسن حالة إنه مايجاوبش، وأسوأ حالة إنه يقتبس الغلط.
 *
 * الأرقام دلوقتي متطابقة فعلاً (١٢ نظام · ٧ أيام · ٦ شهور)، بس كل واحد
 * منهم **متكتوب بالإيد في خمس قوالب**. الاتفاق الحالي صدفة مش نظام:
 * أول ما حد يزوّد نظام تلتاشر، لازم يفتكر خمس أماكن. الملف ده بيخلّي
 * النسيان مستحيل بدل ما يخلّيه غلطة.
 *
 * ── القاعدة: احسب، ماتخزّنش ────────────────────────────────────────────
 *
 * `SYSTEMS_COUNT` **مش رقم مكتوب** — هو `Object.keys(PRICES).length`.
 * نظام جديد بيتضاف في `pricing.js` (لازم يتسعّر أصلاً)، والعدد بيتغيّر
 * لوحده في الصفحة الرئيسية وصفحة الحقائق و`llms.txt` مع بعض. رقم مخزّن
 * كان هيبقى مصدر تعارض تالت.
 *
 * ── واللي مالوش مصدر ───────────────────────────────────────────────────
 *
 * `PROJECTS_DELIVERED` معلّم `sourced: false` عن قصد. الرقم ده معروض على
 * الصفحة الرئيسية من قبل الملف ده، وقرار «نشيله ولا نوثّقه» لسه على
 * المالك (مكتوب في `docs/BACKLOG.md` قسم «ص»). حطّه هنا معناه إن القرار
 * لما يتاخد بيتنفّذ في سطر واحد — مش إن الرقم اتوثّق.
 *
 * ادّعاء بلا مصدر على صفحة بتدّعي دقّة هو بالظبط اللي بيخلّي محرّك
 * الإجابة ماياخدش الصفحة كمرجع.
 */

const { PRICES, FREE_MONTHS, arabicNumber } = require('./pricing');

/** عدد الأنظمة الجاهزة — محسوب من قايمة الأسعار، مش مكتوب. */
const SYSTEMS_COUNT = Object.keys(PRICES).length;

/**
 * وقت التسليم بالأيام — **للأنظمة الجاهزة**.
 *
 * الوصف مهم زي الرقم: `/faq` بتقول إن المشروع المخصّص من أسبوع لأسبوعين،
 * وده مش تعارض طالما كل رقم مكتوب جنبه بيخصّ إيه. الرقم من غير وصفه هو
 * اللي بيبقى ادعاء.
 */
const DELIVERY_DAYS = 7;
const DELIVERY_SCOPE = 'من اعتماد التصميم الأولي، للأنظمة الجاهزة';

/**
 * مشاريع اتسلّمت. `sourced: false` = **لسه مالوش مصدر موثّق**.
 * ماتزوّدش الرقم ده من غير ما المالك يأكّده.
 */
const PROJECTS_DELIVERED = { value: 50, prefix: '+', sourced: false };

/** جملة العرض المجاني — نص واحد، عشان مايتكتبش بصيغتين. */
function freeOfferLine() {
  return `مجاناً لمدة ${arabicNumber(FREE_MONTHS)} شهور — لفترة محدودة`;
}

/** الحقائق اللي القوالب بتقراها. */
function facts() {
  return {
    systemsCount: SYSTEMS_COUNT,
    systemsCountAr: arabicNumber(SYSTEMS_COUNT),
    freeMonths: FREE_MONTHS,
    freeMonthsAr: arabicNumber(FREE_MONTHS),
    freeOffer: freeOfferLine(),
    deliveryDays: DELIVERY_DAYS,
    deliveryDaysAr: arabicNumber(DELIVERY_DAYS),
    deliveryScope: DELIVERY_SCOPE,
    projectsDelivered: PROJECTS_DELIVERED,
  };
}

module.exports = {
  SYSTEMS_COUNT,
  DELIVERY_DAYS,
  DELIVERY_SCOPE,
  PROJECTS_DELIVERED,
  FREE_MONTHS,
  freeOfferLine,
  facts,
};
