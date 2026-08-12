#!/usr/bin/env node
/**
 * The bug that took stock off the shelf twice.
 *
 * A pharmacy order could go delivered → preparing → delivered. The second pass
 * through the fulfil branch deducted the medicine again and counted the sale
 * again in the day's takings. An external review found it, it was fixed in the
 * pharmacy — and the same shape was still live in the restaurant orders and the
 * clinic queue. So the rule now lives in one module and this checks all three
 * use it.
 *
 * What is asserted:
 *   · a terminal status cannot be left, but re-selecting it is fine (a double
 *     click must not produce an error);
 *   · you cannot move backwards through the flow;
 *   · you can always cancel something that has not finished;
 *   · every status change reads the current row FOR UPDATE first — two staff
 *     on two screens is the normal case in a restaurant, not the rare one.
 *
 *   node scripts/check-order-flow.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const flow = require('../src/lib/order_flow');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

const FOOD = ['pending', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'];
const VISIT = ['waiting', 'in_room', 'done', 'cancelled'];

/* ── The rule ──────────────────────────────────────────────────────────── */
check('طلب اتسلّم مايرجعش «بيتجهّز» — ده اللي خصم المخزون مرتين',
  flow.canMove(FOOD, 'delivered', 'preparing').ok === false
  && flow.canMove(FOOD, 'delivered', 'preparing').reason === 'final');
check('ولا يرجع أي حالة تانية بعد ما اتسلّم',
  FOOD.filter((s) => s !== 'delivered').every((s) => !flow.canMove(FOOD, 'delivered', s).ok));
check('الملغي والمرفوض نهائيين برضه',
  !flow.canMove(FOOD, 'cancelled', 'preparing').ok && !flow.canMove(FOOD, 'rejected', 'accepted').ok);

// A double-click must not become an error message.
check('إعادة اختيار نفس الحالة مش خطأ (دبل كليك)',
  flow.canMove(FOOD, 'delivered', 'delivered').ok && flow.canMove(FOOD, 'pending', 'pending').ok);

check('مايرجعش لورا في السلسلة',
  flow.canMove(FOOD, 'out_for_delivery', 'preparing').ok === false
  && flow.canMove(FOOD, 'out_for_delivery', 'preparing').reason === 'backwards');
// Forward jumps are allowed deliberately: a walk-in really is pending →
// delivered, and blocking it makes staff work around the system.
check('بس القفز لقدّام مسموح (طلب سفري بيتسلّم على طول)',
  flow.canMove(FOOD, 'pending', 'delivered').ok);
check('والإلغاء متاح من أي حالة لسه شغّالة',
  FOOD.filter((s) => !flow.isTerminal(s)).every((s) => flow.canMove(FOOD, s, 'cancelled').ok));
check('وحالة مش في السلسلة بتترفض', !flow.canMove(FOOD, 'pending', 'teleported').ok);

/* ── The clinic queue, same rule ───────────────────────────────────────── */
check('العيادة: كشف خلص مايرجعش «جوّه الغرفة»',
  !flow.canMove(VISIT, 'done', 'in_room').ok);
check('العيادة: waiting → in_room → done ماشية عادي',
  flow.canMove(VISIT, 'waiting', 'in_room').ok && flow.canMove(VISIT, 'in_room', 'done').ok);

/* ── All three systems use it ──────────────────────────────────────────── */
const food = fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8');
const clinic = fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8');
const pharmacy = fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8');

check('المطاعم بتستخدم القاعدة المشتركة', /flow\.canMove\(FOOD_FLOW/.test(food));
check('العيادة بتستخدمها', /flow\.canMove\(VISIT_FLOW/.test(clinic));
// The pharmacy has its own inline guard, older than the module and load-bearing
// (it sits inside the stock transaction). It is not rewritten here — it is
// checked, so it cannot quietly regress.
check('الصيدلية لسه فيها حارس الحالة النهائية',
  /terminalDone && next !== prev/.test(pharmacy) && /error=final/.test(pharmacy));

/* ── And they lock the row before deciding ─────────────────────────────── */
check('المطاعم بتقفل الصف قبل ما تقرر',
  /SELECT status FROM food_orders WHERE id=\$1 AND company_id=\$2 FOR UPDATE/.test(food));
check('العيادة بتقفل الصف قبل ما تقرر',
  /SELECT status FROM clinic_visits WHERE id=\$1 AND company_id=\$2 FOR UPDATE/.test(clinic));
check('والصيدلية بتقفله كمان', /FROM pharmacy_orders WHERE id = \$1 AND company_id = \$2 FOR UPDATE/.test(pharmacy));

check('والرفض بيرجع للمستخدم بسبب، مش بيعدّي بالسكوت',
  /error=' \+ move\.reason/.test(food) && /error=' \+ move\.reason/.test(clinic));

/* ── ج٦: check-then-write races ────────────────────────────────────────── */
// A coupon validated and THEN incremented lets two customers read used_count 9
// against a limit of 10 and both get the discount. "Last 10 orders" quietly
// becomes "however many arrive in the same second".
{
  const tenant = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  check('كوبون المطاعم بيتحجز بشرط الحد في نفس الجملة',
    /UPDATE food_coupons SET used_count = used_count \+ 1[\s\S]{0,220}used_count < usage_limit/.test(tenant));
  check('واللي خسر السباق الطلب بيعدّي بسعر كامل مش بيفشل عليه',
    /if \(!claim\.rowCount\) cp = \{ ok: false/.test(tenant));
  check('ومفيش زيادة غير مشروطة فاضلة',
    !/UPDATE food_coupons SET used_count = used_count \+ 1 WHERE id = \$1'\)/.test(tenant));

  // The shop's coupon was already correct — SELECT … FOR UPDATE with the limit
  // in the WHERE. Asserted so it stays that way.
  const shop = fs.readFileSync(path.join(ROOT, 'src/routes/shop.js'), 'utf8');
  check('كوبون المتجر لسه بيتقفل بـFOR UPDATE',
    /FROM coupons WHERE company_id=\$1 AND code=\$2[\s\S]{0,200}FOR UPDATE/.test(shop));

  // One active nutrition plan, enforced by the database and not by statement order.
  const nutSchema = fs.readFileSync(path.join(ROOT, 'src/nutrition/schema.js'), 'utf8');
  check('خطة نشطة واحدة بس — قيد فريد في قاعدة البيانات',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_one_active_plan[\s\S]{0,120}WHERE is_active/.test(nutSchema));
  const plans = fs.readFileSync(path.join(ROOT, 'src/routes/nutrition_plans.js'), 'utf8');
  check('والتعطيل والإضافة في transaction واحدة',
    /BEGIN[\s\S]{0,600}UPDATE nutrition_plans SET is_active=false[\s\S]{0,600}INSERT INTO nutrition_plans[\s\S]{0,400}COMMIT/.test(plans));
}

/* ── The overpaid invoice ──────────────────────────────────────────────── */
{
  const clinic2 = fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8');
  check('الدفعة محدودة بالمتبقّي', /const applied = Math\.min\(amount, due\)/.test(clinic2));
  check('والزيادة بتتقال للكاشير كباقي', /change=' \+ change/.test(clinic2));
  check('وفاتورة متسدّدة مابتقبلش دفعة تانية', /error=settled/.test(clinic2));
}

console.log(fail
  ? `\n${fail} مشكلة — دي الحالة اللي بتخصم المخزون وتحسب البيعة مرتين.`
  : '\nالحالات النهائية مابترجعش، في التلات أنظمة، والصف بيتقفل قبل القرار.');
process.exit(fail ? 1 : 0);
