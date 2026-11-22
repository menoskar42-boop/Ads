#!/usr/bin/env node
/**
 * A discount that raises the bill.
 *
 * `POST /clinic/invoices` read `discount_amount` off the body and computed
 * `Math.max(0, subtotal - discount)`. Send `discount_amount=-50` and the
 * subtraction turns into an addition: the patient's invoice is fifty pounds
 * bigger, the field on the screen still says "discount", and the arithmetic
 * is not wrong — the SIGN was never checked. A manual line priced at −200 did
 * the same thing one layer lower, where no discount cap could see it.
 *
 * So this check is not "is that one route fixed". It tests the ranges
 * themselves in `src/lib/money.js` — the real module, by running it — because
 * the same shape is waiting in every coupon, fee and payment field:
 *
 *   a discount is bounded by the thing it discounts,
 *   a percentage is 0…100,
 *   a price cannot be negative.
 *
 *   node scripts/check-money-input.js
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

/* ── The ranges, by running them ───────────────────────────────────────── */
check('خصم سالب بيبقى صفر (مش زيادة في الفاتورة)', money.discount(-50, 500) === 0,
  money.discount(-50, 500));
check('وخصم أكبر من الفاتورة بيقف عند الفاتورة', money.discount(9999, 500) === 500,
  money.discount(9999, 500));
check('والخصم العادي بيعدّي زي ما هو', money.discount(50, 500) === 50);
check('وخصم على إجمالي بايظ مابيطلعش سالب', money.discount(50, -10) === 0);
check('نسبة فوق ١٠٠ بتقف عند ١٠٠', money.percent(150) === 100, money.percent(150));
check('ونسبة سالبة بتبقى صفر', money.percent(-20) === 0);
check('سعر سالب بيبقى صفر', money.positive(-200) === 0);
check('والكلام مش رقم بيرجع الافتراضي', money.amount('يلا', 7) === 7 && money.amount('', 3) === 3);
check('والكسور بتتقرّب لقرشين', money.amount(10.005) === 10.01 && money.r2(0.1 + 0.2) === 0.3,
  money.amount(10.005));
check('والعدد الصحيح مايقبلش سالب ولا كسر', money.count(-3, 0) === 0 && money.count('2.7', 0) === 2);

/* ── The invoice route actually uses them ──────────────────────────────── */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8');
  const body = (src.match(/router\.post\('\/invoices',[\s\S]*?\n\}\);/) || [''])[0];
  check('فاتورة العيادة بتعدّي الخصم على الحدّ', /money\.discount\(\s*b\.discount_amount/.test(body));
  check('والسطر اليدوي مايقبلش سعر سالب', /money\.positive\(\s*b\.manual_price/.test(body));
  // The old line is the failure mode, not a style preference: as long as a raw
  // `num(b.discount_amount…)` exists, the cap can be bypassed by editing above it.
  check('ومفيش قراءة خام للخصم فاضلة', !/num\(\s*b\.discount_amount/.test(body));
  // The cap must come AFTER the subtotal — a discount capped against nothing
  // is not capped.
  const iSub = body.indexOf('const subtotal'), iDisc = body.indexOf('money.discount');
  check('والحدّ بيتحسب بعد الإجمالي مش قبله', iSub > -1 && iDisc > iSub, `subtotal@${iSub} discount@${iDisc}`);
}

/* ── The arithmetic the report described, end to end ───────────────────── */
{
  // subtotal 500, "discount" −50: the old code produced 550.
  const subtotal = 500;
  const oldTotal = Math.max(0, subtotal - (-50));
  const newTotal = money.r2(subtotal - money.discount(-50, subtotal));
  check('الحساب نفسه: ٥٠٠ بخصم −٥٠ بقى ٥٠٠ مش ٥٥٠',
    oldTotal === 550 && newTotal === 500, `قبل ${oldTotal} · بعد ${newTotal}`);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني «خصم» ممكن لسه يزوّد فاتورة مريض.`
  : '\nالخصم محدود بالفاتورة، والنسبة ٠–١٠٠، والسعر مايبقاش سالب.');
process.exit(fail ? 1 : 0);
