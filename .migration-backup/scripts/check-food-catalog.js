#!/usr/bin/env node
/**
 * القائمة الجاهزة للأطعمة — أرقامها متّسقة، ومابتكتبش فوق شغل الأخصائي.
 *
 * كانت ٢٢ صنف وبتتضاف على قاعدة فاضية بس، فالعيادة اللي كتبت خمس أصناف
 * بإيدها مكانتش تقدر تاخد الباقي أبداً. دلوقتي ~١٨٠ صنف (USDA SR Legacy،
 * لكل ١٠٠ جم) والإضافة بتضيف الناقص بس.
 *
 * ── اللي الفحص ده بيمسكه ─────────────────────────────────────────────────
 *
 * ١) **كل صف سعراته متّسقة مع الماكروز** (٤·٤·٩، بسماح للألياف والأحماض).
 *    رقم مكتوب غلط (٣٦٥ بدل ٣٦) في صنف بيتحط في خطط مرضى أسوأ من صنف ناقص:
 *    الخطة بتطلع برقم واثق وغلط، ومحدّش بيراجع ١٨٠ صف.
 * ٢) **الأرقام جوّه سقوف فورم الأطعمة** (٩٠٠ سعرة · ١٠٠جم ماكرو) —
 *    وإلا الأخصائي يفتح الصنف يعدّله فالفورم يرفض رقم إحنا اللي حاطينه.
 * ٣) **مفيش اسم مكرّر** بأي لغة، والتصنيف من قايمة معروفة.
 * ٤) **الإضافة بتضيف الناقص بس**: اللي موجود بنفس الاسم (أي لغة، نشط أو
 *    مؤرشف) مابيرجعش، والإدخال جوّه معاملة بقفل عشان الضغطتين مايكرّروش.
 * ٥) **العرض بيقول العدد الحقيقي** — مفيش «٢٢» مكتوبة بإيد في النص.
 *
 *   node scripts/check-food-catalog.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const { CATALOG, CATEGORIES, missing } = require('../src/nutrition/food_catalog');

/* ── ١–٣: البيانات نفسها ─────────────────────────────────────────────── */
check('القائمة أكبر من ١٥٠ صنف', CATALOG.length >= 150);
const seen = new Map();
for (const r of CATALOG) {
  const [ar, en, kcal, p, c, f, cat] = r;
  const who = `«${ar}»`;
  if (r.length !== 7 || !ar || !en) { errors.push(`${who}: الصف مش ٧ خانات`); continue; }
  for (const [v, max, lbl] of [[kcal, 900, 'السعرات'], [p, 100, 'البروتين'], [c, 100, 'الكارب'], [f, 100, 'الدهون']]) {
    if (typeof v !== 'number' || !(v >= 0) || v > max) errors.push(`${who}: ${lbl} (${v}) برّه الحد 0–${max}`);
  }
  if (p + c + f > 100) errors.push(`${who}: الماكروز مجموعهم أكتر من ١٠٠جم في ١٠٠جم`);
  const atwater = p * 4 + c * 4 + f * 9;
  if (Math.abs(atwater - kcal) > Math.max(20, 0.12 * kcal)) {
    errors.push(`${who}: السعرات ${kcal} والماكروز بيدّوا ${Math.round(atwater)} — رقم مكتوب غلط؟`);
  }
  if (!CATEGORIES.includes(cat)) errors.push(`${who}: تصنيف مش معروف «${cat}»`);
  for (const n of [ar.trim(), en.trim().toLowerCase()]) {
    if (seen.has(n)) errors.push(`${who}: الاسم «${n}» مكرّر مع «${seen.get(n)}»`);
    seen.set(n, ar);
  }
}

/* ── ٤: الإضافة بتضيف الناقص بس ───────────────────────────────────────── */
{
  const all = missing([], 'ar');
  check('قاعدة فاضية بتاخد القائمة كلها', all.length === CATALOG.length);
  const some = missing(['أرز أبيض مسلوق', '  GRILLED chicken breast ', 'كولا مش في القائمة'], 'ar');
  check('الموجود بالعربي مابيتضافش تاني', !some.some((x) => x.name === 'أرز أبيض مسلوق'));
  check('والموجود بالإنجليزي (بأي حروف ومسافات) مابيتضافش بالعربي',
    !some.some((x) => x.name === 'فراخ صدور مشوية'));
  check('والباقي بيتضاف', some.length === CATALOG.length - 2);
  check('وعيادة إنجليزي بتاخد الأسماء الإنجليزي', missing([], 'en')[0].name === CATALOG[0][1]);
}
{
  const r = code('src/routes/nutrition_foods.js');
  const starter = (r.match(/router\.post\('\/starter'[\s\S]*?\n\}\);/) || [''])[0];
  check('الإضافة مابقتش مقفولة على القاعدة الفاضية', !/not_empty/.test(starter));
  check('والإضافة بتقارن بكل أسماء العيادة (نشط ومؤرشف)',
    /SELECT name FROM nutrition_foods WHERE company_id=\$1'/.test(starter) && !/is_active/.test(starter));
  check('والإضافة بتاخد الناقص من catalog.missing', /catalog\.missing\(/.test(starter));
  check('وفي معاملة بقفل عشان الضغطتين مايكرّروش',
    /BEGIN/.test(starter) && /pg_advisory_xact_lock/.test(starter) && /COMMIT/.test(starter) && /ROLLBACK/.test(starter));
  check('وفشلها مابيقولش «اتحفظ»', /err=save/.test(starter));
  check('ومفيش قايمة أصناف تانية متكتوبة في الراوت', !/const STARTER\s*=/.test(r));
}

/* ── ٥: العدد في الشاشة حقيقي ─────────────────────────────────────────── */
{
  const s = code('src/i18n/strings.js');
  const body = s.match(/'nt\.fd\.starter_body':'[^']*'/g) || [];
  check('نص العرض بالعربي والإنجليزي موجود', body.length === 2);
  check('والعدد في النص بييجي من {n} مش مكتوب بإيد',
    body.every((b) => b.includes('{n}') && !/٢٢|\b22\b/.test(b)));
  const v = code('src/views/nutrition_admin/foods.ejs');
  check('والعرض بيظهر طول ما فيه ناقص (مش على الفاضية بس)', /missingN > 0/.test(v) && !/if \(!tally\.active && !tally\.archived\) \{ %>/.test(v));
}

if (errors.length) {
  console.log('❌ check-food-catalog:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-food-catalog: ${CATALOG.length} صنف متّسقين، والإضافة بتضيف الناقص بس.`);
