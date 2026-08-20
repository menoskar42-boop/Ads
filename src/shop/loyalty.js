// نقاط الولاء — الحسبة في مكان واحد، ومعدّلاتها بتاعة التاجر.
//
// اللي كان بيحصل: كل متجر على المنصّة بيدّي **نقطة لكل جنيه**، و١٠٠ نقطة
// بتتصرف بجنيه. يعني كل تاجر بيدّي خصم ١٪ على كل بيعة — من غير ما يختاره،
// ومن غير ما يشوفه في أي شاشة، ومن غير ما يقدر يغيّره. والأرقام دي كانت
// مكتوبة جوّه راوت الطلب مرتين (مرة للعرض ومرة للكتابة).
//
// ── الأربعة اللي الملف ده بيصلّحهم ───────────────────────────────────────
//
// ١) **المعدّل بقى إعداد.** التاجر بيقول بياخد كام نقطة على الجنيه، والنقطة
//    بتساوي كام، وأقصى نسبة من الطلب تتدفع بنقاط. الافتراضي هو اللي كان
//    شغّال بالظبط (١ · ١٠٠ · ١٠٠٪) — مافيش متجر هيلاقي أرقامه اتغيّرت.
//
// ٢) **النقاط على البضاعة، مش على الشحن.** الشحن فلوس بتروح للمندوب —
//    التاجر مكنش المفروض يدفع عليها ولاء.
//
// ٣) **ورصيد المحفظة مابيقللش النقاط.** المحفظة **طريقة دفع** مش خصم: العميل
//    اشترى بضاعة بمية جنيه، سواء دفعها كاش ولا من رصيده. اللي كان بيحصل إن
//    اللي بيدفع من محفظته بياخد نقط أقل على نفس الشراء.
//
// ٤) **قفل الميزة بيقفلها على السيرفر.** `company_features.loyalty` كان
//    بيخفي الخانة من الشاشة والكتابة تفضل بتدّي وتصرف نقاط زي ما هي. زرار
//    بيقفل الصورة بس مش زرار.
'use strict';

// اللي كان متصلّب في الكود — بقى الافتراضي، عشان مافيش متجر يصحى يلاقي
// معدّله اتغيّر تحت رجليه.
const DEFAULTS = { earnPer: 1, redeemPer: 100, maxPercent: 100 };

const clamp = (n, lo, hi, d) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return d;
  return Math.min(hi, Math.max(lo, v));
};

/**
 * إعدادات الولاء للمتجر.
 *
 * @param row      صف `companies`
 * @param enabled  حالة الميزة من `company_features` (الحقيقة الوحيدة للتشغيل)
 *
 * ملحوظة مقصودة: **مافيش هنا مفتاح تشغيل تاني.** مفتاحين لنفس الحاجة معناه
 * إن حد هيقفل واحد ويفتكر إنها اتقفلت.
 */
function settingsFrom(row, enabled) {
  const r = row || {};
  return {
    enabled: enabled !== false,
    // ٠ معناها «مافيش كسب» وهي إجابة صحيحة، فالحد الأدنى صفر مش واحد.
    earnPer: clamp(r.loyalty_earn_per, 0, 100, DEFAULTS.earnPer),
    // النقطة لازم تساوي حاجة: قسمة على صفر مش سعر.
    redeemPer: Math.max(1, Math.round(clamp(r.loyalty_redeem_per, 1, 100000, DEFAULTS.redeemPer))),
    maxPercent: clamp(r.loyalty_max_percent, 0, 100, DEFAULTS.maxPercent),
  };
}

/**
 * النقاط المكسوبة من طلب.
 *
 * @param goodsTotal ثمن **البضاعة** بعد الخصم — من غير شحن، ومن غير ما
 *        ينقص منه رصيد المحفظة.
 */
function earnFor(goodsTotal, cfg) {
  const c = cfg || settingsFrom(null, true);
  if (!c.enabled || !(c.earnPer > 0)) return 0;
  const base = Number(goodsTotal);
  if (!Number.isFinite(base) || base <= 0) return 0;
  return Math.floor(base * c.earnPer);
}

/**
 * صرف نقاط على طلب.
 *
 * @param want    اللي العميل طلب يصرفه
 * @param balance رصيده الفعلي
 * @param payable المبلغ المستحق قبل النقاط
 *
 * @returns { points, discount } — النقاط اللي اتصرفت فعلاً والخصم المقابل.
 *
 * التلات سقوف كلها بتتطبّق: رصيده، وسقف النسبة اللي التاجر حطّها، والمبلغ
 * نفسه. والنقاط المتخصومة هي **مقابل الخصم اللي اتحسب بالظبط** — الباقي
 * اللي مايكمّلش وحدة بيفضل في رصيد العميل مش بيتاخد منه.
 */
function redeemFor(want, balance, payable, cfg) {
  const c = cfg || settingsFrom(null, true);
  const none = { points: 0, discount: 0 };
  if (!c.enabled) return none;
  const w = Math.floor(Number(want));
  const bal = Math.floor(Number(balance));
  const due = Number(payable);
  if (!Number.isFinite(w) || w <= 0) return none;
  if (!Number.isFinite(bal) || bal <= 0) return none;
  if (!Number.isFinite(due) || due <= 0) return none;

  const cap = Math.floor((due * c.maxPercent) / 100);
  if (!(cap > 0)) return none;
  const affordable = Math.min(w, bal, cap * c.redeemPer);
  const discount = Math.floor(affordable / c.redeemPer);
  if (!(discount > 0)) return none;
  return { points: discount * c.redeemPer, discount };
}

/** أقصى نقاط ينفع تتصرف على مبلغ — عشان الشاشة تقول للعميل من غير ما تخمّن. */
function maxRedeemable(balance, payable, cfg) {
  return redeemFor(Number(balance) || 0, balance, payable, cfg).points;
}

module.exports = { DEFAULTS, settingsFrom, earnFor, redeemFor, maxRedeemable };
