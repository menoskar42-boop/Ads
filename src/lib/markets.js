'use strict';
/**
 * الأسواق: مصر · السعودية · الإمارات — وسعر لكل سوق.
 *
 * ── ليه سعر منفصل مش تحويل عملة ────────────────────────────────────────
 *
 * ١٧٩ ج مصري ≈ ١٤ ريال. أي عميل سعودي بيشوف نظام إدارة صيدلية بـ١٤ ريال
 * في الشهر **مش بيقول «رخيص»، بيقول «فيه إيه؟»**. ده مش تخمين مني — ده
 * اللي مراجعة كلود كتبته حرفياً في خانة نقاط الضعف: «التسعير المنخفض جداً
 * و٦ أشهر مجانية قد يخلقان شكوكاً حول الدعم».
 *
 * السعر إشارة جودة قبل ما يكون رقم. فالأسعار الخليجية **مكتوبة لسوقها**
 * مش محوّلة من المصري.
 *
 * ── ⚠️ الأرقام دي قرار مالك، مش قياس سوق ───────────────────────────────
 *
 * `sourced: false` على كل سوق غير مصر معناه: الأرقام دي **اجتهاد** مبني
 * على وضع OscarDevs (مزوّد صغير بيدخل سوق جديد) مش على مسح أسعار منافسين
 * مقاس. الفرق مهم: لو المالك قرّر يغيّرها بعد أول ثلاث مكالمات، ده تصحيح
 * طبيعي مش تراجع.
 *
 * وأول ما يبقى فيه قياس حقيقي (أسعار منافسين مرصودة بتاريخ ومصدر)،
 * `sourced` بيتحوّل `true` والمصدر بيتكتب هنا.
 *
 * ── الريال والدرهم بنفس الرقم عن قصد ───────────────────────────────────
 *
 * الاتنين مربوطين بالدولار بسعر متقارب (٣٫٧٥ و٣٫٦٧)، فالفرق بينهم أقل من
 * ٢٪. رقمين مختلفين لفرق ٢٪ بيضيف صيانة من غير ما يضيف معنى — والعميل
 * الإماراتي مابيقارنش سعره بالسعودي أصلاً.
 *
 * ── والعزل عن `PRICES` ─────────────────────────────────────────────────
 *
 * `pricing.PRICES` فضل زي ما هو: مصر هي السوق الأصلي، و`SYSTEMS_COUNT`
 * محسوب منه. الملف ده بيضيف أسواق **فوقه** ومابيغيّرش فيه.
 */

const { PRICES, arabicNumber } = require('./pricing');

/**
 * الأسواق.
 *
 * `lang` هي اللغة الافتراضية للسوق — قرار المالك: الخليج بالإنجليزي
 * («علشان يحسّوا بالفخامة»). ودي بتحدّد الرابط اللي بننشره ونستهدف بيه،
 * **مش تحويل تلقائي بالـIP**: جوجل بتحذّر من ده صراحةً، والزاحف بيدخل من
 * أمريكا فبيشوف نسخة واحدة بس. الصفحة العربية عليها زر تبديل ظاهر.
 */
const MARKETS = {
  eg: {
    code: 'EG',
    name: 'مصر',
    nameEn: 'Egypt',
    shortEn: 'Egypt',
    lang: 'ar',
    currency: 'EGP',
    currencyAr: 'ج',
    currencyEn: 'EGP',
    sourced: true, // السوق الأصلي — الأسعار دي اللي بنبيع بيها فعلاً
    prefix: '/ar',
  },
  sa: {
    code: 'SA',
    name: 'السعودية',
    nameEn: 'Saudi Arabia',
    // الاسم المختصر للميتا — العنوان والوصف محدودين بالطول.
    shortEn: 'Saudi Arabia',
    lang: 'en',
    currency: 'SAR',
    currencyAr: 'ر.س',
    currencyEn: 'SAR',
    sourced: false,
    prefix: '/en/sa',
  },
  ae: {
    code: 'AE',
    name: 'الإمارات',
    nameEn: 'United Arab Emirates',
    // «the UAE» هو الشكل الطبيعي بالإنجليزي، و«United Arab Emirates» عشرين
    // حرف — فرق تمن حروف عن السعودية بيخلّي وصف واحد يعدّي حد الستين
    // في سوق ويقصّر في التاني.
    shortEn: 'the UAE',
    lang: 'en',
    currency: 'AED',
    currencyAr: 'د.إ',
    currencyEn: 'AED',
    sourced: false,
    prefix: '/en/ae',
  },
};

/**
 * أسعار الخليج — شهري وشراء كامل.
 *
 * مبنية على تدرّج الأنظمة نفسه اللي في مصر (البورتفوليو أرخص حاجة،
 * والعيادة أغلى حاجة)، بس بأرقام سوقها. الشراء الكامل ≈ ٢٠ ضعف الشهري
 * — نفس نسبة مصر تقريباً، عشان اللي بيقارن الخيارين يلاقي نفس المنطق.
 */
const GULF = {
  portfolio:    { monthly: 99,  buy: 1999 },
  shop:         { monthly: 149, buy: 2999 },
  installments: { monthly: 149, buy: 2999 },
  orders:       { monthly: 199, buy: 3999 },
  workshop:     { monthly: 199, buy: 3999 },
  gym:          { monthly: 249, buy: 4999 },
  nutrition:    { monthly: 249, buy: 4999 },
  nursery:      { monthly: 249, buy: 4999 },
  furniture:    { monthly: 249, buy: 4999 },
  hall:         { monthly: 249, buy: 4999 },
  pharmacy:     { monthly: 299, buy: 5999 },
  clinic:       { monthly: 349, buy: 6999 },
};

/** سعر نظام في سوق. مصر بتقرا من `PRICES`، والباقي من `GULF`. */
function priceOf(type, market) {
  if (market === 'eg') return PRICES[type] || null;
  return GULF[type] || null;
}

/**
 * السعر مكتوب بلغة السوق.
 *
 * الأرقام العربية-الهندية (١٧٩) للعربي، والعادية (299) للإنجليزي —
 * صفحة إنجليزية بتطبع ٢٩٩ لسه صفحة عربية بحروف لاتينية.
 */
function priceLabel(type, market, lang) {
  const m = MARKETS[market];
  const p = priceOf(type, market);
  if (!m || !p) return '';
  if (lang === 'en') return `${p.monthly} ${m.currencyEn}`;
  return `${arabicNumber(p.monthly)} ${m.currencyAr}`;
}

/** الأسواق اللي مش مصر — دي اللي محتاجة صفحات إنجليزية. */
const gulfMarkets = () => Object.keys(MARKETS).filter((k) => k !== 'eg');

/** أي سوق سعره اجتهاد مش قياس — الصفحة بتقول ده بنفسها. */
const unsourced = () => Object.keys(MARKETS).filter((k) => !MARKETS[k].sourced);

module.exports = { MARKETS, GULF, priceOf, priceLabel, gulfMarkets, unsourced };
