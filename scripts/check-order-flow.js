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

/* ── One order, one branch ─────────────────────────────────────────────── */
// A cart mixing two outlets was filed under `lineItems[0].outlet`: the first
// branch's kitchen got a ticket for food it does not make, the second never saw
// the order, and the customer paid both branches' delivery fees.
{
  const tenant2 = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  check('سلة من فرعين بتترفض بدل ما تتنسب لفرع واحد',
    /outletIds\.length > 1/.test(tenant2) && /err=multibranch/.test(tenant2));
  // The comment explains the old shape; the code must not still contain it.
  const code2 = tenant2.replace(/^\s*\/\/.*$/gm, '');
  check('ومفيش نسبة للفرع الأول من غير فحص', !/lineItems\[0\]\.outlet/.test(code2));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/tenant_orders.ejs'), 'utf8');
  check('والعميل بيتقاله السبب مش بس الصفحة بتترمي',
    /multibranch/.test(view) && /minorder/.test(view));
}

/* ── Appointment conflicts ─────────────────────────────────────────────── */
{
  const B = require('../src/clinic/booking');
  const now = new Date('2026-08-12T10:00:00Z');
  check('موعد في الماضي بيترفض', B.slotProblem(new Date('2026-08-12T09:00:00Z'), now) === 'past');
  check('بس «دلوقتي» بالظبط بيعدّي (سكرتيرة بتحجز حالاً)',
    B.slotProblem(new Date('2026-08-12T09:58:00Z'), now) === null);
  check('وسنة كاملة قدّام بتترفض كغلطة كتابة',
    B.slotProblem(new Date('2028-01-01T09:00:00Z'), now) === 'far');
  check('ومن غير ميعاد مفيش مشكلة', B.slotProblem(null, now) === null);

  const q = B.insertIfFree({ companyId: 1, doctorId: 2, name: 'a', phone: 'b', slotAt: now, reason: null });
  check('فحص التعارض جوّه الـINSERT نفسه مش SELECT قبله',
    /INSERT INTO clinic_appointments[\s\S]*NOT EXISTS/.test(q.text));
  check('والتعارض بيتقاس بمدة الكشف مش بالثانية بالظبط',
    /abs\(extract\(epoch/.test(q.text) && /\$8 \* 60/.test(q.text));
  check('والملغي مابيحجزش الميعاد', /status <> 'cancelled'/.test(q.text));

  const tenant3 = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  const clinic3 = fs.readFileSync(path.join(ROOT, 'src/routes/clinic_admin.js'), 'utf8');
  check('الحجز العام بيستخدمه', /booking\.insertIfFree/.test(tenant3) && /err' \+ bad|error=' \+ bad/.test(tenant3));
  check('وحجز اللوحة كمان', /booking\.insertIfFree/.test(clinic3));
  check('واللي الميعاد بتاعه اتحجز بيتقاله',
    /error=taken/.test(tenant3) && /error=taken/.test(clinic3));
}

/* ── المرحلة ٤: شاشة المطبخ وأول شاشة بعد الدخول ───────────────────────── */
{
  const kdsView = fs.readFileSync(path.join(ROOT, 'src/views/food_admin/kds.ejs'), 'utf8');
  const nav = fs.readFileSync(path.join(ROOT, 'src/views/food_admin/nav.ejs'), 'utf8');

  check('أول شاشة بعد الدخول بقت الطلبات مش إدارة المنيو',
    /router\.get\('\/', \(req, res\) => res\.redirect\('\/food\/orders'\)\)/.test(food));
  check('والمنيو لسه موجود على /food/menu', /router\.get\('\/menu'/.test(food));
  check('والقايمة بتحطّ الطلبات قبل المنيو',
    nav.indexOf('/food/orders') < nav.indexOf('/food/menu'));

  check('شاشة المطبخ موجودة', /router\.get\('\/kds'/.test(food));
  check('وبتجيب اللي لسه بيتعمل بس', /status IN \('pending','accepted','preparing'\)/.test(food));
  // The whole point of a kitchen screen: no prices, and one action.
  check('مفيش أسعار على شاشة المطبخ', !/price|السعر|ج\.م/.test(kdsView));
  check('وفيها زرار واحد بس', (kdsView.match(/<button/g) || []).length === 1);
  check('والانتظار بالدقايق بيغيّر لون التذكرة',
    /mins >= 20 \? 'hot'/.test(kdsView) && /mins >= 10 \? 'warm'/.test(kdsView));
  check('وبتحدّث نفسها من غير ما حد يضغط', /location\.reload\(\)/.test(kdsView));
  check('وبتبطّل تحديث لو الشاشة مش ظاهرة',
    /document\.visibilityState === 'visible'/.test(kdsView));
  // Even the kitchen's button goes through the shared state rule.
  check('وزرار «جاهز» بيمشي على نفس قاعدة الحالات',
    /flow\.canMove\(FOOD_FLOW, cur\.status, 'out_for_delivery'\)/.test(food));
  check('وبيقفل الصف قبلها', /SELECT status FROM food_orders WHERE id=\$1 AND company_id=\$2 FOR UPDATE/.test(food));
}

console.log(fail
  ? `\n${fail} مشكلة — دي الحالة اللي بتخصم المخزون وتحسب البيعة مرتين.`
  : '\nالحالات النهائية مابترجعش، في التلات أنظمة، والصف بيتقفل قبل القرار.');
process.exit(fail ? 1 : 0);
