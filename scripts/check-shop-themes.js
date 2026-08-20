#!/usr/bin/env node
/**
 * تسع خانات لون فاضية قدام واحد بيبيع هدوم.
 *
 * التخصيص كان موجود بالفعل — لون أساسي، لون تمييز، ألوان كروت الهيرو. بس
 * محدش بيملاها، فأغلب المتاجر فضلت على نفس الأزرق الافتراضي.
 *
 * ── القرار اللي الفحص ده بيحرسه ─────────────────────────────────────────
 *
 * **الثيم بيتطبّق على خانات التاجر نفسها، مش بيقعد فوقها كطبقة.**
 *
 * الطبقة كانت هتخلّق سؤال «مين بيكسب: الثيم ولا اللون اللي التاجر كتبه؟»،
 * وإجابته بتبقى مخفية في الكود وبتفاجئه. لما الثيم بيكتب في خاناته: مافيش
 * أسبقية أصلاً، هو شايف كل لون، ويقدر يعدّل أي واحد بعدين، وتعديله بيفضل.
 *
 * والفحص ده بيمسك خمسة:
 *
 * ١) **مفيش نسخة تانية من الألوان في المخطط** — نسختين = سؤال «مين بيكسب».
 * ٢) **الثيم مابيلمسش غير الألوان والخط.** الاسم والشعار والمنتجات
 *    والمميزات مالهاش دعوة بالشكل.
 * ٣) **الشاشة بتقول إيه اللي هيتغيّر قبل ما يتغيّر** — مش بعد ما يكتشف إن
 *    لون كان مظبوط اتبدّل.
 * ٤) **المعاينة مرسومة من نفس القيم** اللي هتتكتب. أي فرق بين المعاينة
 *    والنتيجة كدب صغير بيتكرّر كل مرة.
 * ٥) **الخط بيتحمّل لما يتختار بس.** تحميل ستة خطوط على كل زيارة عشان واحد
 *    منهم شغّال بيبطّأ صفحة كل متجر.
 *
 *   node scripts/check-shop-themes.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const T = require('../src/shop/themes');

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

/* ── ١. المكتبة نفسها ─────────────────────────────────────────────────── */
{
  check('فيه مكتبة مش ثيم واحد', T.THEMES.length >= 5, T.THEMES.length + ' ثيم');
  check('وكل ثيم له مفتاح فريد',
    new Set(T.KEYS).size === T.KEYS.length);
  check('والافتراضي هو نفس اللي كان شغّال (مافيش متجر شكله بيتغيّر لوحده)',
    T.byKey('default').theme_color === '#5B3FED'
    && T.byKey('default').color_accent === '#FF5B4A'
    && T.byKey('default').font === 'outfit');
  check('وكل ثيم بيحدّد كل الخانات (مافيش لون بيفضل من الثيم اللي قبله)',
    T.THEMES.every((t) => T.WRITES.every((f) => (f === 'shop_font' ? !!t.font : /^#[0-9A-Fa-f]{6}$/.test(t[f])))));
  check('وكل ثيم بيقول هو لأنهي نشاط',
    T.THEMES.every((t) => t.name && t.for));
}

/* ── ٢. الثيم مابيلمسش غير الشكل ──────────────────────────────────────── */
{
  const forbidden = ['company_name', 'logo_url', 'description', 'slug', 'currency', 'is_active'];
  check('اللي بيتكتب ألوان وخط بس',
    T.WRITES.every((f) => !forbidden.includes(f)));
  const vals = T.valuesFor('food');
  check('وقيم التطبيق نفس الليستة بالظبط',
    Object.keys(vals).sort().join(',') === T.WRITES.slice().sort().join(','));
  check('والمفتاح المجهول بيترفض مابيرجعش للافتراضي',
    T.valuesFor('nope') === null && T.valuesFor('') === null && T.valuesFor(null) === null);
}

/* ── ٣. الفرق بيتقال قبل ما يتطبّق ────────────────────────────────────── */
{
  const d = T.diffFor('food', { theme_color: '#000000' });
  check('الفرق بيتحسب على المتجر ده هو',
    d && d.changed.length === T.WRITES.length, d && String(d.changed.length));
  const same = T.diffFor('food', T.valuesFor('food'));
  check('واللي ألوانه هي هي مالوش فرق',
    same.changed.length === 0);
  check('والفرق بيقول من إيه لإيه',
    d.changed[0].from === '#000000' && d.changed[0].to === '#C1440E');
  check('وحرف اللون الكبير مش فرق (‎#FFF ≠ ‎#fff غلط)',
    T.diffFor('default', { theme_color: '#5b3fed' }).changed.every((c) => c.field !== 'theme_color'));
}

/* ── ٤. الخطوط ────────────────────────────────────────────────────────── */
{
  check('كل ثيم خطّه من القايمة', T.THEMES.every((t) => !!T.FONTS[t.font]));
  check('والخط المجهول بيرجع للافتراضي (الصفحة ماتفضلش بلا خط)',
    T.fontOf({ shop_font: 'zzz' }).key === 'outfit' && T.fontOf(null).key === 'outfit');
  check('وخطوط العناوين بتدعم العربي (ما عدا الافتراضي اللي كان موجود)',
    T.FONT_KEYS.filter((k) => k !== 'outfit').every((k) => T.FONTS[k].arabic === true));

  const page = raw('src/views/tenant_shop.ejs');
  check('والصفحة بتحمّل الخط المختار بس',
    /family=<%= __font\.google %>/.test(page)
    && !T.FONT_KEYS.filter((k) => k !== 'outfit' && k !== 'cairo')
      .some((k) => new RegExp('family=' + T.FONTS[k].css.replace(/'/g, '')).test(page)));
  check('وبتحطّه في متغيّر الـCSS',
    /--display: <%= __font\.css %>;/.test(page));
  check('والقالب مابيعملش `require` (الـEJS مالوش واحد)',
    !/require\(/.test(page));
  check('والمساعد متسجّل في الـlocals',
    /res\.locals\.shopFont = \(company\) => shopThemes\.fontOf\(company\)/.test(code('src/middleware/urls.js')));

  const css = raw('public/css/shop.css');
  check('وملف الاستايل بيقرا المتغيّر مش مكتوب فيه اسم خط',
    /--display: 'Outfit';/.test(css) && !/font-family: 'Outfit', sans-serif/.test(css)
    && /font-family: var\(--display, 'Outfit'\), sans-serif/.test(css));
}

/* ── ٥. الوصل ─────────────────────────────────────────────────────────── */
{
  const c = code('src/routes/company.js');
  check('التطبيق بيكتب في خانات التاجر نفسها',
    /UPDATE companies SET theme_color=\$1, color_accent=\$2, hero_card1_color=\$3, hero_card2_color=\$4,\s*hero_text_color=\$5, hero_btn_bg=\$6, hero_btn_text=\$7, shop_font=\$8, shop_theme=\$9/.test(c));
  check('والمفتاح المجهول بيترفض بدل ما يتطبّق افتراضي',
    /if \(!vals\) return res\.redirect\('\/company\/themes\?err=pick'\)/.test(c));
  check('والصفحة بتحسب الفرق لكل ثيم على المتجر ده',
    /diffs\[k\] = shopThemes\.diffFor\(k, company\)/.test(c));
  check('وكود الخطأ من قايمة مش من الرابط',
    /\['pick', 'save'\]\.includes\(req\.query\.err\)/.test(c));

  const server = raw('server.js');
  check('والمخطط فيه الذاكرة والخط بس — مفيش نسخة تانية من الألوان',
    /ADD COLUMN IF NOT EXISTS shop_theme TEXT/.test(server)
    && /ADD COLUMN IF NOT EXISTS shop_font TEXT/.test(server)
    && !/ADD COLUMN IF NOT EXISTS theme_[a-z_]*_override/.test(server));

  const view = raw('src/views/company/themes.ejs');
  check('والشاشة بتقول كام إعداد هيتغيّر قبل الضغط',
    /d\.changed\.length/.test(view));
  check('وبتقول إن التعديل اليدوي بعدها بيفضل',
    /تقدر تعدّل أي لون فيه/.test(view));
  check('وبتقول إن الثيم مابيلمسش الاسم والشعار والمنتجات',
    /ومابيلمسش الاسم ولا الشعار ولا المنتجات/.test(view));
  check('والمعاينة مرسومة من نفس قيم الثيم مش صورة',
    /background: linear-gradient\(135deg, <%= t\.theme_color %>, <%= t\.hero_card1_color %>\)/.test(view)
    && !/<img[^>]*theme/.test(view));

  const perms = code('src/shop/perms.js');
  check('وشكل الصفحة شغل المالك زي الهوية', /\['\/themes', 'owner'\]/.test(perms));
}

console.log(fail === 0
  ? '\n✅ الثيم بيكتب في خانات التاجر — مافيش طبقة بتكسبه من ورا ظهره.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
