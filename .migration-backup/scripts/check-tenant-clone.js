#!/usr/bin/env node
/**
 * سانّدبوكس الديمو (البند ١٠٨): نسخة كاملة من الشركة التجريبية لكل زائر.
 *
 * ── ليه الفحص ده مكتوب قبل ما الكود يلمس قاعدة بيانات ───────────────────
 *
 * النسخ بيلمس **٢٠٣ جدول** فيهم `company_id`. الكود اللي بيكتب في ٢٠٣ جدول
 * ومحدش شغّله ولا مرة أخطر من إنه ماينكتبش أصلاً: غلطة واحدة في إعادة ربط
 * المفاتيح معناها صف بيتكتب في مستأجر **حقيقي** — يعني زائر بيلعب في
 * الديمو بيعدّل بيانات تاجر بيشتغل.
 *
 * عشان كده الجزء الخطر اتكتب **دالة صافية** (`src/lib/tenant_clone.js`)،
 * والفحص ده بيشغّلها على مخطط حقيقي الشكل ويثبت الأربع خصائص الخطرة.
 *
 * ── الأربعة ──────────────────────────────────────────────────────────────
 *
 * ١) **كل صف متنسوخ بياخد الشركة الجديدة.** حتى لو الصف الأصلي جاي وجوّاه
 *    `company_id` تاني — بيتكتب فوقه. دي القاعدة اللي لو اتكسرت، الزائر
 *    بيكتب في بيانات تاجر حقيقي.
 *
 * ٢) **المفتاح الأجنبي اللي مالوش مقابل بيرفض السطر كله** — مش بيتساب على
 *    قيمته القديمة. القيمة القديمة بتشاور على صف **المصدر**، فالنسخة تفضل
 *    متعلّقة في المستأجر الأصلي وتقراه.
 *
 * ٣) **الترتيب من المخطط**، والأب قبل الابن، **والدايرة بتترفض** مش بتتخمّن.
 *
 * ٤) **الجدول اللي مالوش `company_id` مابيتنسخش خالص** — جدول مشترك لو
 *    اتنسخ، الزائر بيكتب في حاجة مشتركة بين كل التجّار.
 *
 *   node scripts/check-tenant-clone.js
 */
'use strict';
const C = require('../src/lib/tenant_clone');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

// مخطط بشكل المخطط الحقيقي: شركة (مشتركة) · عملاء · طلبات · بنود · إعدادات.
const SCHEMA = {
  companies: { pk: 'id', hasCompanyId: false, columns: ['id', 'name', 'slug'], fks: [], uniques: [['slug']] },
  customers: { pk: 'id', hasCompanyId: true, columns: ['id', 'company_id', 'email', 'name', 'created_at'],
    fks: [{ column: 'company_id', refTable: 'companies' }], uniques: [['email']] },
  orders: { pk: 'id', hasCompanyId: true, columns: ['id', 'company_id', 'customer_id', 'code', 'total', 'created_at'],
    fks: [{ column: 'company_id', refTable: 'companies' }, { column: 'customer_id', refTable: 'customers' }],
    uniques: [['code']] },
  order_items: { pk: 'id', hasCompanyId: true, columns: ['id', 'company_id', 'order_id', 'product_id', 'qty'],
    fks: [{ column: 'order_id', refTable: 'orders' }, { column: 'product_id', refTable: 'products' },
      { column: 'company_id', refTable: 'companies' }], uniques: [] },
  products: { pk: 'id', hasCompanyId: true, columns: ['id', 'company_id', 'name', 'sku'],
    fks: [{ column: 'company_id', refTable: 'companies' }], uniques: [['sku']] },
  plans: { pk: 'id', hasCompanyId: false, columns: ['id', 'title'], fks: [], uniques: [] },
};

const plan = C.planFrom(SCHEMA);

/* ── ١. الشركة الجديدة دايماً ─────────────────────────────────────────── */
{
  const step = plan.steps.find((s) => s.table === 'customers');
  const out = C.rowFor({ id: 5, company_id: 1, email: 'a@b.com', name: 'x' }, step, {}, 99, 'tok');
  check('كل صف متنسوخ بياخد الشركة الجديدة', out.ok && out.values.company_id === 99,
    out.ok ? String(out.values.company_id) : out.why);
  // حتى لو الصف جاي وجوّاه شركة تانية خالص — بيتكتب فوقها.
  const evil = C.rowFor({ id: 5, company_id: 4242, email: 'a@b.com' }, step, {}, 99, 'tok');
  check('وشركة تانية في الصف بتتكتب فوقها', evil.ok && evil.values.company_id === 99);
  check('والمفتاح الأساسي مابيتنسخش (بيتولّد)',
    !step.columns.includes('id'));
  check('والأوقات مابتتنسخش', !step.columns.includes('created_at'));
  check('وجملة القراية مقيّدة بالشركة المصدر',
    /WHERE company_id = \$1$/.test(step.sql), step.sql);
}

/* ── ٢. المفتاح المش متخريط بيرفض السطر ───────────────────────────────── */
{
  const step = plan.steps.find((s) => s.table === 'orders');
  const maps = { customers: new Map([[7, 700]]) };
  const good = C.rowFor({ company_id: 1, customer_id: 7, code: 'A1' }, step, maps, 99, 'tok');
  check('المفتاح المتخريط بيتبدّل بالجديد', good.ok && good.values.customer_id === 700);

  const bad = C.rowFor({ company_id: 1, customer_id: 8, code: 'A1' }, step, maps, 99, 'tok');
  check('**واللي مالوش مقابل بيترفض السطر كله**', bad.ok === false && bad.why === 'unmapped_fk');
  check('والرفض بيقول أنهي عمود وأنهي جدول',
    bad.column === 'customer_id' && bad.refTable === 'customers');
  check('ومابيرجعش الصف بالقيمة القديمة أبداً', bad.values === undefined);

  const empty = C.rowFor({ company_id: 1, customer_id: null, code: 'A1' }, step, maps, 99, 'tok');
  check('والفاضي يفضل فاضي (مش رفض)', empty.ok && empty.values.customer_id === null);

  // المفتاح اللي بيشاور على جدول **بره النسخة** (زي `companies`) مايتخريطش.
  check('والمفتاح اللي بيشاور بره النسخة مش في إعادة الربط',
    step.remap.every((r) => r.from !== 'companies'));
}

/* ── ٣. الترتيب والدايرة ──────────────────────────────────────────────── */
{
  const at = (t) => plan.order.indexOf(t);
  check('الأب قبل الابن', at('customers') < at('orders') && at('orders') < at('order_items'));
  check('والمنتجات قبل بنود الطلب', at('products') < at('order_items'));
  check('والترتيب محسوب من المخطط مش ليستة مكتوبة',
    plan.order.length === Object.keys(SCHEMA).length);

  const cyclic = {
    a: { pk: 'id', hasCompanyId: true, columns: ['id', 'company_id', 'b_id'], fks: [{ column: 'b_id', refTable: 'b' }], uniques: [] },
    b: { pk: 'id', hasCompanyId: true, columns: ['id', 'company_id', 'a_id'], fks: [{ column: 'a_id', refTable: 'a' }], uniques: [] },
  };
  const c = C.planFrom(cyclic);
  check('**والدايرة بتترفض مش بتتخمّن**', c.cycle.length === 2 && c.steps.length === 0,
    c.cycle.join(', '));
}

/* ── ٤. اللي مالوش شركة مابيتنسخش ─────────────────────────────────────── */
{
  check('الجدول المشترك مابيتنسخش',
    plan.skipped.includes('companies') && plan.skipped.includes('plans'));
  check('ومفيش خطوة نسخ لأي جدول من غير `company_id`',
    plan.steps.every((s) => SCHEMA[s.table].hasCompanyId === true));
  check('و`planTable` بترجع null صراحةً للجدول ده',
    C.planTable(SCHEMA, 'plans') === null && C.planTable(SCHEMA, 'companies') === null);
  check('والجدول المش موجود بيرجع null مش بيرمي',
    C.planTable(SCHEMA, 'nope') === null);
}

/* ── ٥. تصادم القيم الفريدة ───────────────────────────────────────────── */
{
  check('الإيميل بيفضل إيميل صالح',
    C.uniqueValue('a@b.com', 'tok', 'email') === 'a+demotok@b.com');
  check('والنص العادي بياخد علامة النسخة',
    C.uniqueValue('SKU-1', 'tok', 'text') === 'SKU-1-dtok');
  check('والفاضي يفضل فاضي', C.uniqueValue('', 'tok', 'email') === '');
  check('ونسختين ليهم علامتين مختلفتين',
    C.uniqueValue('a@b.com', 'one', 'email') !== C.uniqueValue('a@b.com', 'two', 'email'));

  const step = plan.steps.find((s) => s.table === 'products');
  const out = C.rowFor({ company_id: 1, name: 'x', sku: 'S1' }, step, {}, 99, 'tok');
  check('والقيمة الفريدة بتتعلّم وقت بناء الصف', out.ok && out.values.sku === 'S1-dtok');
  check('و`company_id` مش متعامل كقيمة فريدة',
    plan.steps.every((s) => s.uniques.every((u) => u.column !== 'company_id')));
}

console.log(fail === 0
  ? '\n✅ الخطة بتدّي كل صف الشركة الجديدة، وبترفض المفتاح المعلّق، وبترفض الدايرة.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
