/**
 * Tailwind, built once — not compiled in every visitor's browser.
 *
 * كل صفحة في المشروع كانت بتحمّل `cdn.tailwindcss.com`: ملف جافاسكريبت كبير
 * بيقرا الـHTML **في متصفح الزائر** ويولّد الـCSS لحظياً. يعني:
 *   · اعتماد على طرف تالت في الإنتاج — لو الـCDN وقع، كل الصفحات بتفقد شكلها.
 *   · وقت تنفيذ على جهاز الزائر قبل أول رسم — ضد أهداف Core Web Vitals، وضد
 *     صفحات بيتفتحوا على بيانات موبايل في مصر.
 *   · وتنبيه من تايلويند نفسه إن ده «للتجربة مش للإنتاج».
 *
 * ── الألوان لكل قطاع ────────────────────────────────────────────────────
 *
 * كل نظام له لون مختلف (العيادة سماوي، الموبيليا خشبي، القاعة وردي…) وكانت
 * الألوان دي بتتحقن في `tailwind.config` جوّه كل صفحة. ملف CSS واحد مبني مرة
 * واحدة ماينفعش يعمل كده — نفس اسم الكلاس (`bg-brand-600`) مايقدرش يبقى
 * بلونين.
 *
 * الحل: الكلاسات بتشير لمتغيّرات CSS، وكل قسم بيعرّف متغيّراته في `:root`.
 * فالكلاس واحد، واللون بيتغيّر — من غير ما نبني ملف لكل قطاع.
 */
const rgb = (name, fallback) => ({ opacityValue }) => (opacityValue === undefined
  ? `rgb(var(${name}, ${fallback}))`
  : `rgb(var(${name}, ${fallback}) / ${opacityValue})`);

const scale = (prefix, fallbacks) => Object.fromEntries(
  Object.entries(fallbacks).map(([step, value]) => [step, rgb(`--${prefix}-${step}`, value)])
);

module.exports = {
  darkMode: 'class',
  content: [
    './src/views/**/*.ejs',
    './public/js/**/*.js',
    './src/lib/**/*.js',
    './src/routes/**/*.js',
  ],
  theme: {
    extend: {
      fontFamily: { sans: ['Cairo', 'system-ui', 'sans-serif'] },
      colors: {
        // الافتراضي = ألوان لوحة المتجر، وهي أكتر واحدة مستخدمة.
        brand: scale('brand', {
          50: '239 246 255', 100: '219 234 254', 200: '191 219 254', 300: '147 197 253',
          400: '96 165 250', 500: '59 130 246', 600: '37 99 235', 700: '29 78 216',
          800: '30 64 175', 900: '30 58 138',
        }),
        ink: scale('ink', { 700: '19 78 74', 800: '15 61 58', 900: '11 46 44' }),
        sand: scale('sand', { 50: '250 248 244', 100: '244 240 232', 200: '233 226 213', 300: '216 205 184' }),
      },
    },
  },
  plugins: [],
};
