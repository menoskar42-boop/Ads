#!/usr/bin/env node
/**
 * "مقاسه كام؟" و"فيه منه زان؟" — السؤالين اللي بيتسألوا قبل السعر.
 *
 * الاتنين كانوا بيتكتبوا في خانة الملاحظات، يعني محدش يقدر يحط سعر على
 * الإجابة. الموجود دلوقتي: مقاسات وخامة على القطعة نفسها، وخيارات لكل قطعة
 * كل خيار بفرق سعره — ونفس القطعة مش بتتعمل مرتين في الكتالوج.
 *
 * ── الغلطتين اللي الفحص ده موجود عشانهم ──────────────────────────────────
 *
 * ١) **المقاس الفاضي مش صفر.** `Number('')` بيساوي صفر، والصفر رقم منتهي،
 *    فالعرض اللي محدش كتبه كان هيتخزّن «٠ سم» ويطلع في الكتالوج كأنه مقاس
 *    حقيقي. اللي مااتكتبش بيفضل NULL، واللي اتكتب غلط بيترفض — مابيتقرّبش
 *    لصفر.
 *
 * ٢) **الخيار المجهول بيترفض، مابيتباعش بالسعر الأساسي.** لو النموذج بعت
 *    خيار مش بتاع القطعة دي — تبويب قديم، خيار اتشال، رقم من محل تاني —
 *    السطر بيترفض. الرجوع للسعر الأساسي هنا معناه دولاب على فاتورة بسعر
 *    محدش اتفق عليه، ومفيش حاجة على الشاشة تبان غلط.
 *
 * وكمان: `product_id` بتاع سطر الفاتورة كان بياخد رقم من النموذج من غير ما
 * يتقيّد بالشركة، فكان ممكن تتكتب قطعة محل تاني على فاتورتنا — والشاشة بعد
 * كده بتعمل JOIN وتطبع اسمها.
 *
 *   node scripts/check-furniture-variants.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const V = require('../src/furniture/variants');
const { ENTITIES } = require('../src/furniture/master');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
// التعليقات بتتشال قبل أي بحث: ملف بيشرح الغلطة اللي بيمنعها ماينفعش يقع في
// فحص نفسه لأنه ذكر اسمها.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const code = (rel) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── ١. المقاس الفاضي مش صفر ─────────────────────────────────────────────── */
{
  const blank = V.readSpecs({ width_cm: '', depth_cm: '   ', height_cm: null, material: '', finish: '' });
  check('المقاس اللي مااتكتبش بيتخزّن NULL',
    blank.values.width_cm === null && blank.values.depth_cm === null && blank.values.height_cm === null);
  check('والفاضي مش «غلط» — بيتحفظ عادي', blank.bad.length === 0);
  check('والخامة الفاضية NULL مش نص فاضي', blank.values.material === null);

  const typed = V.readSpecs({ width_cm: '180', depth_cm: '٩٠', height_cm: '75.5' });
  check('والرقم بيتقرا حتى لو متكتوب بأرقام عربية',
    typed.values.width_cm === 180 && typed.values.depth_cm === 90 && typed.values.height_cm === 75.5);

  const bad = V.readSpecs({ width_cm: 'كبير', depth_cm: '0', height_cm: '-40' });
  check('واللي مش رقم بيترفض مش بيتقرّب لصفر', bad.bad.includes('width_cm') && bad.values.width_cm === null);
  check('والصفر والسالب بيترفضوا كمان', bad.bad.includes('depth_cm') && bad.bad.includes('height_cm'));

  // اللي بيرسم الكتالوج: القياس اللي مش متسجّل مابيظهرش خالص.
  check('والقطعة اللي مالهاش مقاس مابيتكتبلهاش سطر مقاس',
    V.specLines({ name: 'x' }).length === 0);
  check('والتلاتة كاملين بيتكتبوا سطر واحد',
    JSON.stringify(V.specLines({ width_cm: 180, depth_cm: 90, height_cm: 75 })) === JSON.stringify([{ key: 'dims', value: '180 × 90 × 75' }]));
  {
    // الناقص مابيتلمّش مع اللي جنبه: «١٨٠ × ٧٥» من غير العمق بتتقرا عمق.
    const two = V.specLines({ width_cm: 180, height_cm: 75 });
    check('والناقص بيتكتب كل واحد باسمه',
      two.length === 2 && two[0].key === 'width_cm' && two[1].key === 'height_cm');
  }
  check('والصفر مايعدّيش كمقاس', V.hasDim(0) === false && V.hasDim(null) === false && V.hasDim(180) === true);
}

/* ── ٢. الخيار المجهول بيترفض ────────────────────────────────────────────── */
{
  const vs = [{ id: 3, product_id: 7, name: 'زان', price_delta: 500 },
    { id: 4, product_id: 9, name: 'أرو', price_delta: 200 }];
  check('من غير خيار = القطعة الأساسية', V.resolveVariant(vs, '', 7).ok === true
    && V.resolveVariant(vs, '', 7).variant === null);
  check('وخيار القطعة دي بيتقبل', V.resolveVariant(vs, '3', 7).variant.id === 3);
  check('وخيار مش موجود بيترفض — مش بيرجع للأساسي',
    V.resolveVariant(vs, '99', 7).ok === false);
  check('وخيار قطعة تانية بيترفض حتى لو في نفس المحل',
    V.resolveVariant(vs, '4', 7).ok === false);
  check('والكلام اللي مش رقم بيترفض', V.resolveVariant(vs, 'abc', 7).ok === false);
}

/* ── ٣. السعر بيتحسب عندنا ───────────────────────────────────────────────── */
{
  check('سعر الخيار = الأساسي + الفرق', V.priceOf(1000, { price_delta: 500 }) === 1500);
  check('والفرق بالسالب بيرخّص فعلاً', V.priceOf(1000, { price_delta: -250 }) === 750);
  check('ومابينزلش تحت الصفر', V.priceOf(1000, { price_delta: -5000 }) === 0);
  const opts = V.optionsFor({ selling_price: 1000 }, [
    { id: 3, name: 'زان', price_delta: 500, is_active: true },
    { id: 5, name: 'قديم', price_delta: 100, is_active: false },
  ]);
  check('والقايمة أولها الأساسي', opts[0].id === '' && opts[0].price === 1000);
  check('والخيار المتشال مابيتعرضش', opts.length === 2 && opts[1].id === 3 && opts[1].price === 1500);
  // الفرق اللي جاي من المتصفح مالوش لازمة: الحساب من العمود المتخزّن.
  const forged = V.optionsFor({ selling_price: 1000 }, [{ id: 3, name: 'زان', price_delta: 500, price: 1 }]);
  check('والسعر المبعوت من الصفحة مابيتصدّقش', forged[1].price === 1500);
}

/* ── ٤. القدرة معلَنة على الكيان، مش استثناء جوّه اللوب ──────────────────── */
{
  check('المنتجات بتعلن إن ليها مقاسات وخيارات',
    ENTITIES.products.specs === true && ENTITIES.products.variants === true);
  const others = Object.keys(ENTITIES).filter((k) => k !== 'products');
  check('وباقي الكيانات مابتعلنش', others.every((k) => !ENTITIES[k].specs && !ENTITIES[k].variants));

  const route = code('src/routes/furniture_master.js');
  check('وراوت المقاسات بيقرا من القارئ اللي بيرجّع NULL مش من coerce',
    /req\.spec\.specs/.test(route) && /V\.readSpecs\(req\.body\)/.test(route));
  check('والمقاس الغلط بيوقف الحفظ',
    /specs\.bad\.length\)\s*return res\.redirect\([^)]*err=spec/.test(route));
  check('وصفحات الخيارات بترفض أي كيان مايعلنش',
    (route.match(/if \(!req\.spec\.variants\) return res\.redirect/g) || []).length >= 3);
}

/* ── ٥. الكتابة متقيّدة بالشركة في نفس الجملة ────────────────────────────── */
{
  const route = code('src/routes/furniture_master.js');
  check('إضافة خيار بتتأكد إن القطعة بتاعتنا في نفس الـINSERT',
    /INSERT INTO furniture_product_variants[\s\S]{0,300}?SELECT \$1, p\.id[\s\S]{0,200}?WHERE p\.id=\$2 AND p\.company_id=\$1/.test(route));
  check('واللي مايرجعش صف مابيتقالش عنه «اتحفظ»',
    /if \(!done\.rows\.length\) return res\.redirect\(to \+ '\?err=save'\)/.test(route));
  check('ومسح الخيار مقيّد بالقطعة وبالشركة',
    /FROM furniture_product_variants\s+WHERE id=\$1 AND product_id=\$2 AND company_id=\$3/.test(route));
  check('والخيار اللي اتباع بيتأرشف مش بيتمسح',
    /variant_id=\$2/.test(route) && /SET is_active=false/.test(route));

  const sales = code('src/routes/furniture_sales.js');
  check('وسطر الفاتورة بيتأكد إن المنتج بتاعنا في نفس الجملة',
    /INSERT INTO furniture_sale_items[\s\S]{0,400}?FROM furniture_products p WHERE p\.id=\$3 AND p\.company_id=\$1/.test(sales));
  check('والسطر اللي مايتكتبش بيوقّف الفاتورة كلها',
    /if \(!done\.rows\.length\) \{[^}]*throw/.test(sales));
  check('والخيار بيتحل قبل الكتابة وبيرفض المجهول',
    /V\.resolveVariant\(variants, l\.variant_raw, l\.product_id\)/.test(sales)
    && /if \(!r\.ok\) return res\.redirect\('\/furniture\/sales\?err=bad_line'\)/.test(sales));
  check('واسم الخيار بيتنسخ على السطر',
    /variant_name/.test(sales) && /l\.variant_name = r\.variant \? r\.variant\.name : null/.test(sales));
}

/* ── ٦. المخطط: NULL مش صفر ──────────────────────────────────────────────── */
{
  const schema = raw('src/furniture/schema.js');
  const dims = schema.match(/ADD COLUMN IF NOT EXISTS (width_cm|depth_cm|height_cm)\s+NUMERIC\([^)]*\);/g) || [];
  check('أعمدة المقاس بتتضاف من غير DEFAULT 0', dims.length === 3, dims.length + ' عمود');
  check('وجدول الخيارات موجود',
    /CREATE TABLE IF NOT EXISTS furniture_product_variants/.test(schema));
  check('وسطر الفاتورة عنده عمود للخيار واسمه',
    /furniture_sale_items\s+ADD COLUMN IF NOT EXISTS variant_id/.test(schema)
    && /furniture_sale_items\s+ADD COLUMN IF NOT EXISTS variant_name/.test(schema));
  check('ومسح الخيار مابيمسحش سطر الفاتورة',
    /variant_id\s+INTEGER REFERENCES furniture_product_variants\(id\) ON DELETE SET NULL/.test(schema));
}

/* ── ٧. الشاشات ─────────────────────────────────────────────────────────── */
{
  const master = raw('src/views/furniture_admin/master.ejs');
  check('شاشة البيانات فيها خانات المقاس ورا الإعلان', /spec\.specs/.test(master) && /width_cm/.test(master));
  check('وفيها لينك للخيارات ورا الإعلان', /spec\.variants/.test(master) && /variants/.test(master));

  const page = raw('src/views/tenant_furniture.ejs');
  check('وصفحة المعرض بتعرض المقاسات المتسجّلة بس', /p\.specs && p\.specs\.length/.test(page));
  check('وبتعرض الخيارات بأسعارها', /p\.options/.test(page));

  const sales = raw('src/views/furniture_admin/sales.ejs');
  check('وشاشة الفاتورة فيها خانة الخيار', /name="variant_id"/.test(sales));
  check('والأسعار جاية من السيرفر مش متحسوبة في الصفحة',
    /FN_VARIANTS = <%- jsonLd\(variantMap\)/.test(sales) && !/price_delta/.test(sales));

  const detail = raw('src/views/furniture_admin/sale_detail.ejs');
  check('وصفحة الفاتورة بتقول الخيار اللي اتباع', /it\.variant_name/.test(detail));
}

/* ── ٨. الكلام باللغتين ─────────────────────────────────────────────────── */
{
  const keys = ['fn2.v.options', 'fn2.v.plain', 'fn2.v.err.spec', 'fn2.v.err.delta', 'fn2.v.no_specs',
    'fn2.f.width_cm', 'fn2.f.material', 'fn2.f.finish'];
  const missing = keys.filter((k) => !strings.ar[k] || !strings.en[k]);
  check('كل مفاتيح الشاشة موجودة بالعربي والإنجليزي', missing.length === 0, missing.join(', ') || 'تمام');
}

console.log(fail === 0
  ? '\n✅ المقاس اللي محدش كتبه مش صفر، والخيار اللي مش بتاع القطعة مابيتباعش بسعرها.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
