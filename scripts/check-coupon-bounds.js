#!/usr/bin/env node
/**
 * A coupon that gives away more than the basket.
 *
 * `food_coupons.discount_percent` was saved exactly as typed. Put 150 in the
 * field and the ordering page computed `subtotal × 150 / 100` — one and a half
 * times the food — then `total = max(0, subtotal + delivery − discount)`, so
 * the customer paid **zero** and the restaurant ate the delivery fee too. No
 * error anywhere: every line of that arithmetic is correct, and 150 was never
 * checked against what a percentage is.
 *
 * The fix is at both ends on purpose, and the second end is not belt-and-braces:
 *
 *   · saving clamps to 0–100, so no NEW row can hold a number like that;
 *   · applying clamps to the subtotal, because rows saved BEFORE the fix are
 *     still sitting in the table, and a coupon can never exceed the basket.
 *
 * Written after the same bug turned up in three tables (`food_coupons`,
 * `coupons`, the clinic's `discount_amount`), so the check sweeps the three
 * rather than pinning the one the report named.
 *
 *   node scripts/check-coupon-bounds.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const money = require('../src/lib/money');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── The arithmetic the report described ───────────────────────────────── */
{
  const subtotal = 200, delivery = 25;
  const oldDisc = subtotal * 150 / 100;                       // 300
  const oldTotal = Math.max(0, subtotal + delivery - oldDisc);
  const newDisc = money.discount(subtotal * money.percent(150) / 100, subtotal);
  const newTotal = Math.max(0, subtotal + delivery - newDisc);
  check('كوبون ١٥٠٪ على سلة ٢٠٠ + توصيل ٢٥: كان صفر، بقى ٢٥',
    oldTotal === 0 && newTotal === 25, `قبل ${oldTotal} · بعد ${newTotal}`);
  check('والخصم نفسه مابيعديش السلة', newDisc === subtotal, newDisc);
}

/* ── Saving: the merchant's form ───────────────────────────────────────── */
{
  const fa = read('src/routes/food_admin.js');
  const ins = (fa.match(/INSERT INTO food_coupons[\s\S]*?\]\s*\);/) || [''])[0];
  check('كوبون المطعم بيتحفظ بنسبة محدودة', /money\.percent\(\s*b\.discount_percent/.test(ins));
  check('ومفيش قراءة خام للنسبة فاضلة', !/toInt\(\s*b\.discount_percent/.test(ins));
  check('والحد الأدنى وسقف الخصم مايبقوش سالبين',
    /money\.positive\(\s*b\.min_order/.test(ins) && /money\.positive\(\s*b\.max_discount/.test(ins));

  const co = read('src/routes/company.js');
  const ins2 = (co.match(/INSERT INTO coupons[\s\S]*?\]\s*\);/) || [''])[0];
  check('وكوبون المتجر: النسبة ٠–١٠٠ والقيمة الثابتة مش سالبة',
    /money\.percent\(b\.discount_value/.test(ins2) && /money\.positive\(b\.discount_value/.test(ins2));
}

/* ── Applying: what the customer's order actually does ─────────────────── */
{
  const tn = read('src/routes/tenant.js');
  const fn = (tn.match(/async function validateFoodCoupon[\s\S]*?\n\}/) || [''])[0];
  check('وصفحة الطلب بتحدّ الخصم بالسلة كمان (للصفوف القديمة)',
    /money\.discount\(discount, subtotal\)/.test(fn));
  check('والنسبة بتتقرا محدودة وقت التطبيق',
    /money\.percent\(c\.discount_percent/.test(fn));

  const shop = read('src/routes/shop.js');
  check('ومتجر أوسكار بيحدّ الخصم بالإجمالي وقت الدفع',
    /Math\.max\(0, Math\.min\(total, discountAmount\)\)/.test(shop));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني كوبون ممكن يخلّي الفاتورة صفر والتاجر يدفع التوصيل.`
  : '\nالكوبون محدود بالسلة عند الحفظ وعند التطبيق.');
process.exit(fail ? 1 : 0);
