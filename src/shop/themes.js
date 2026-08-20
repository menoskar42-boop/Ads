// مكتبة ثيمات المتجر — وليه هي «تطبيق» مش «طبقة».
//
// التخصيص كان موجود: التاجر يقدر يغيّر اللون الأساسي ولون التمييز وألوان
// كروت الهيرو. بس ده تسع خانات لون فاضية قدام واحد بيبيع هدوم — والنتيجة
// إن أغلب المتاجر بتفضل على الأزرق الافتراضي.
//
// ── القرار اللي الملف ده قايم عليه ───────────────────────────────────────
//
// **الثيم بيتطبّق على إعدادات التاجر نفسها، مش بيقعد فوقها كطبقة.**
//
// الطبقة كانت هتخلّق سؤال «مين بيكسب: الثيم ولا اللون اللي التاجر كتبه؟»،
// والإجابة دي بتبقى مخفية في الكود وبتفاجئه. لما الثيم **بيكتب القيم في
// خاناته**، مافيش أسبقية أصلاً: هو شايف كل لون، ويقدر يعدّل أي واحد فيهم
// بعدين، والتعديل بتاعه بيفضل — لحد ما يطبّق ثيم تاني بإيده.
//
// وعشان كده كمان: **الشاشة بتقول إيه اللي هيتكتب قبل ما يتكتب**، والثيم
// **مابيلمسش** حاجة مش لون (الاسم · الشعار · المنتجات · المميزات).
'use strict';

/**
 * الخطوط. الخط بيتحمّل من جوجل **لما يتختار بس** — تحميل ستة خطوط على كل
 * زيارة عشان واحد منهم هو اللي شغّال بيبطّأ صفحة كل متجر.
 *
 * وكلهم بيدعموا العربي (ما عدا الافتراضي اللي كان شغّال أصلاً) — خط لاتيني
 * على عنوان عربي معناه إن المتصفّح بيرجع لخط تاني والتصميم بيتغيّر من ورا
 * التاجر.
 */
const FONTS = {
  outfit: { css: "'Outfit'", google: 'Outfit:wght@300;400;600;800;900', arabic: false },
  cairo: { css: "'Cairo'", google: 'Cairo:wght@400;600;700;900', arabic: true },
  tajawal: { css: "'Tajawal'", google: 'Tajawal:wght@400;500;700;900', arabic: true },
  almarai: { css: "'Almarai'", google: 'Almarai:wght@400;700;800', arabic: true },
  changa: { css: "'Changa'", google: 'Changa:wght@400;600;700;800', arabic: true },
  amiri: { css: "'Amiri'", google: 'Amiri:wght@400;700', arabic: true },
};
const FONT_KEYS = Object.keys(FONTS);

/**
 * الثيمات. كل واحد بيحدّد نفس الخانات اللي التاجر بيملاها بإيده — عشان
 * «التطبيق» يبقى كتابة عادية في خاناته، مش نظام تاني جنبها.
 */
const THEMES = [
  {
    key: 'default',
    name: 'الافتراضي',
    for: 'أي نشاط',
    font: 'outfit',
    theme_color: '#5B3FED',
    color_accent: '#FF5B4A',
    hero_card1_color: '#00D9A3',
    hero_card2_color: '#FFB800',
    hero_text_color: '#FFFFFF',
    hero_btn_bg: '#FFFFFF',
    hero_btn_text: '#0F0F1E',
  },
  {
    key: 'fashion',
    name: 'ملابس وأزياء',
    for: 'بوتيك · ملابس · أحذية',
    font: 'amiri',
    theme_color: '#1C1C1E',
    color_accent: '#C9A227',
    hero_card1_color: '#8E7CC3',
    hero_card2_color: '#D9A5A0',
    hero_text_color: '#FFFFFF',
    hero_btn_bg: '#C9A227',
    hero_btn_text: '#1C1C1E',
  },
  {
    key: 'food',
    name: 'مطاعم وحلويات',
    for: 'مطعم · كافيه · حلواني',
    font: 'changa',
    theme_color: '#C1440E',
    color_accent: '#F2A03D',
    hero_card1_color: '#2E7D32',
    hero_card2_color: '#8D3B1E',
    hero_text_color: '#FFF8F0',
    hero_btn_bg: '#F2A03D',
    hero_btn_text: '#3A1A08',
  },
  {
    key: 'pharmacy',
    name: 'صيدلية ورعاية',
    for: 'صيدلية · مستلزمات طبية',
    font: 'tajawal',
    theme_color: '#0E7C7B',
    color_accent: '#2BB673',
    hero_card1_color: '#1B6CA8',
    hero_card2_color: '#5AA9A3',
    hero_text_color: '#FFFFFF',
    hero_btn_bg: '#FFFFFF',
    hero_btn_text: '#0E7C7B',
  },
  {
    key: 'electronics',
    name: 'إلكترونيات',
    for: 'موبايلات · أجهزة · إكسسوارات',
    font: 'almarai',
    theme_color: '#0B3D91',
    color_accent: '#00B4D8',
    hero_card1_color: '#1D3557',
    hero_card2_color: '#457B9D',
    hero_text_color: '#F1FAFF',
    hero_btn_bg: '#00B4D8',
    hero_btn_text: '#02243F',
  },
  {
    key: 'furniture',
    name: 'موبيليا وديكور',
    for: 'أثاث · مفروشات · ديكور',
    font: 'cairo',
    theme_color: '#6B4423',
    color_accent: '#B08968',
    hero_card1_color: '#7F5539',
    hero_card2_color: '#A68A64',
    hero_text_color: '#FFF6EC',
    hero_btn_bg: '#FFF6EC',
    hero_btn_text: '#4A2E17',
  },
  {
    key: 'services',
    name: 'خدمات ومكاتب',
    for: 'خدمات · استشارات · صيانة',
    font: 'tajawal',
    theme_color: '#20304A',
    color_accent: '#3D8BFD',
    hero_card1_color: '#2E4A6B',
    hero_card2_color: '#5C7999',
    hero_text_color: '#FFFFFF',
    hero_btn_bg: '#3D8BFD',
    hero_btn_text: '#FFFFFF',
  },
];
const KEYS = THEMES.map((t) => t.key);

// الخانات اللي الثيم بيكتبها — **ودي كل اللي بيلمسه**. أي حاجة تانية في صف
// المتجر (الاسم · الشعار · المميزات · الأسعار) خارج الليستة دي عمداً.
const WRITES = ['theme_color', 'color_accent', 'hero_card1_color', 'hero_card2_color',
  'hero_text_color', 'hero_btn_bg', 'hero_btn_text', 'shop_font'];

const byKey = (key) => THEMES.find((t) => t.key === key) || null;

/**
 * القيم اللي هتتكتب لو التاجر طبّق الثيم ده.
 * بترجع `null` لو المفتاح مش من عندنا — مفتاح مجهول بيترفض، مابيتحوّلش
 * للافتراضي وكأن التاجر اختاره.
 */
function valuesFor(key) {
  const t = byKey(key);
  if (!t) return null;
  return {
    theme_color: t.theme_color,
    color_accent: t.color_accent,
    hero_card1_color: t.hero_card1_color,
    hero_card2_color: t.hero_card2_color,
    hero_text_color: t.hero_text_color,
    hero_btn_bg: t.hero_btn_bg,
    hero_btn_text: t.hero_btn_text,
    shop_font: t.font,
  };
}

/**
 * اللي هيتغيّر فعلاً لو الثيم اتطبّق على المتجر ده — عشان الشاشة تقوله قبل
 * ما يضغط، بدل ما يكتشف بعدين إن لون كان مظبوط اتغيّر.
 */
function diffFor(key, company) {
  const vals = valuesFor(key);
  if (!vals) return null;
  const c = company || {};
  const changed = [];
  for (const f of Object.keys(vals)) {
    const now = c[f] == null ? null : String(c[f]).toLowerCase();
    const next = String(vals[f]).toLowerCase();
    if (now !== next) changed.push({ field: f, from: c[f] || null, to: vals[f] });
  }
  return { values: vals, changed };
}

/** الخط المستعمل فعلاً — والمجهول بيرجع للافتراضي بدل ما الصفحة تفضل بلا خط. */
function fontOf(company) {
  const key = company && company.shop_font;
  return FONTS[key] ? { key, ...FONTS[key] } : { key: 'outfit', ...FONTS.outfit };
}

module.exports = { THEMES, KEYS, FONTS, FONT_KEYS, WRITES, byKey, valuesFor, diffFor, fontOf };
