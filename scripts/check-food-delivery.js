#!/usr/bin/env node
/**
 * The delivery fee that was the same everywhere, and the rider who could read
 * every customer's address.
 *
 * ── One fee for the whole city ──────────────────────────────────────────────
 *
 * Delivery cost one number per branch, so two streets away and a village half
 * an hour out paid the same. Zones fix that — and the way zones go wrong is
 * exactly how the shop's checkout went wrong before it was fixed: a customer
 * who selects no area, or an area this branch does not deliver to, gets free
 * delivery anywhere. So the three cases are separate branches and the middle
 * one refuses.
 *
 * ── The rider's phone ───────────────────────────────────────────────────────
 *
 * The `delivery` role has always been allowed on the orders screen, because a
 * rider needs the address and phone of the order they are carrying. Which
 * quietly gave them every OTHER order too: every customer's name, phone and
 * home address, on a device that leaves the building. A rider sees the orders
 * assigned to them — enforced where the rows are READ, because a filter in a
 * template is a filter the next screen does not have.
 *
 *   node scripts/check-food-delivery.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const D = require('../src/food/delivery');
const perms = require('../src/food/perms');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const ZONES = [
  { id: 1, name: 'وسط البلد', fee: 15, min_order: 0, free_over: 200 },
  { id: 2, name: 'بره', fee: 40, min_order: 150, free_over: null },
];

/* ── The three cases, and the one that used to be free ─────────────────── */
{
  check('فرع من غير مناطق بيفضل بأجرته الواحدة', JSON.stringify(D.quote([], null, 20, 100)) === '{"ok":true,"fee":20,"zone":null}');
  check('ومنطقة متعرّفة بتاخد أجرتها', D.quote(ZONES, 1, 20, 100).fee === 15);
  // The bug this shape exists to stop.
  check('ومن غير اختيار منطقة الطلب بيترفض مش ببلاش',
    D.quote(ZONES, null, 20, 100).ok === false && D.quote(ZONES, null, 20, 100).why === 'zone');
  check('ومنطقة مش بتاعة الفرع بترفض كمان', D.quote(ZONES, 99, 20, 100).why === 'zone');
  check('وتحت الحد الأدنى للمنطقة بيترفض', D.quote(ZONES, 2, 20, 100).why === 'zone_min');
  check('وفوق الحد بيعدّي', D.quote(ZONES, 2, 20, 200).ok === true && D.quote(ZONES, 2, 20, 200).fee === 40);
  check('و«مجاني فوق» بيلغي الأجرة', D.quote(ZONES, 1, 20, 250).fee === 0);
  check('وأجرة بالسالب مابتبقاش خصم', D.feeForZone({ fee: -5 }, 100) === 0);

  const tenant = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8'));
  const order = tenant.slice(tenant.indexOf("router.post('/order/food'"));
  const body = order.slice(0, order.indexOf('router.', 40));
  check('والراوت بيسعّر التوصيل بالدالة دي', /foodDelivery\.quote\(zoneRows, req\.body\.zone_id, flatFee, subtotal\)/.test(body));
  // The window is wide because stripping comments leaves their length behind
  // as spaces — a narrow window fails on a well-commented branch.
  check('ورفض المنطقة بيوقف الطلب', /if \(!q\.ok\)[\s\S]{0,400}ROLLBACK/.test(body));
  check('والمنطقة بتتخزّن باسمها وقتها', /zone_id, zone_name/.test(body) && /zone \? zone\.name : null/.test(body));
  check('والاستلام مابيدفعش أجرة منطقة',
    /foodOptions\.typeOf\(orderType\) === 'delivery'/.test(body));
}

/* ── The rider sees theirs ─────────────────────────────────────────────── */
{
  const orders = [{ id: 1, driver_id: 5 }, { id: 2, driver_id: 6 }, { id: 3, driver_id: null }];
  check('السائق بيشوف طلباته هو بس', D.visibleTo(orders, { role: 'delivery' }, 5).map((o) => o.id).join() === '1');
  check('وباقي الفريق بيشوف الكل', D.visibleTo(orders, { role: 'cashier' }, 5).length === 3);
  check('وسائق مش معروف مايشوفش حاجة', D.visibleTo(orders, { role: 'delivery' }, null).length === 0);
  check('و`isRider` بتعرف الدور', D.isRider({ role: 'delivery' }) === true && D.isRider({ role: 'manager' }) === false);

  // Enforced at the read, not in the view.
  const admin = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8'));
  check('والتصفية في الاستعلام نفسه',
    /const rider = foodDelivery\.isRider\(req\.perms\)/.test(admin)
    && /AND driver_id = \$2/.test(admin));
  check('والسائق مابياخدش قايمة السائقين أصلاً', /const drivers = rider \? \[\]/.test(admin));
  // The rider still needs the address of their own order — that is the point.
  check('والسائق لسه بيشوف عنوان طلبه',
    perms.permsFor({ foodStaffId: 3, foodRole: 'delivery' }).orders === true);
}

/* ── Handing an order over ─────────────────────────────────────────────── */
{
  check('طلب مش توصيل مايتسلّمش لسائق', D.canAssign({ order_type: 'pickup', status: 'pending' }).why === 'not_delivery');
  check('وطلب اتسلّم خلاص مايتسلّمش', D.canAssign({ order_type: 'delivery', status: 'delivered' }).why === 'closed');
  check('وطلب شغّال ينفع', D.canAssign({ order_type: 'delivery', status: 'preparing' }).ok === true);
  check('والطلب اللي في الشارع ينفع يتغيّر سائقه', D.canAssign({ order_type: 'delivery', status: 'out_for_delivery' }).ok === true);

  const admin = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8'));
  const assign = admin.slice(admin.indexOf("router.post('/orders/:id/driver'"));
  const body = assign.slice(0, assign.indexOf('router.', 40) === -1 ? assign.length : assign.indexOf('router.', 40));
  check('والسائق لازم يكون من فريق المطعم في نفس جملة الكتابة',
    /FROM food_staff s[\s\S]{0,200}s\.company_id=\$2 AND s\.perm_role = 'delivery' AND s\.is_active = true/.test(body));
  check('وتسليم فشل بيقول ليه', /error=' \+ verdict\.why/.test(body) && /error=driver/.test(body));
  check('وينفع تشيل السائق', /driver_id=NULL, assigned_at=NULL/.test(body));
}

/* ── The screens ───────────────────────────────────────────────────────── */
{
  const keys = ['nav', 'title', 'sub', 'none', 'add', 'hint', 'name', 'fee', 'min', 'free_over', 'eta', 'outlet',
    'saved', 'err.name', 'err.save'].map((k) => 'food.zone.' + k)
    .concat(['none', 'assign', 'err.driver', 'err.not_delivery', 'err.closed', 'err.missing', 'err.save'].map((k) => 'food.drv.' + k))
    .concat(['orders.zone', 'orders.zone_pick', 'orders.err.zone', 'orders.err.zone_min']);
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }

  const base = (lang) => ({
    t: (k) => t(k, lang), lang, dir: lang === 'ar' ? 'rtl' : 'ltr', LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
    company: { id: 1, company_name: 'مطعم', slug: 'food' }, session: {},
    perms: { menu: true, orders: true, kitchen: true, finance: true, marketing: true, staff: true, isStaff: false },
    payReady: true, einvoiceOn: false, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
  });
  for (const lang of ['ar', 'en']) {
    for (const [name, data] of Object.entries({
      zones: { zones: ZONES, outlets: [{ id: 1, name: 'Main', name_ar: 'الرئيسي', delivery_fee: 20 }], saved: true, err: 'name' },
    })) {
      const file = path.join(ROOT, 'src/views/food_admin', name + '.ejs');
      let html = null, error = null;
      try { html = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign(base(lang), data), { filename: file }); }
      catch (e) { error = e.message.split('\n')[0]; }
      check(`صفحة ${name} بتتعرض (${lang})`, !error, error || 'تمام');
      if (html) {
        const raw = html.match(/\bfood\.zone\.[a-z_.]+/g);
        check(`ومفيش مفتاح طالع (${name} · ${lang})`, !raw, raw ? raw[0] : 'ولا واحد');
      }
    }
  }
  // The orders screen, as the shift sees it and as the rider sees it.
  const file = path.join(ROOT, 'src/views/food_admin/orders.ejs');
  const orders = [{
    id: 5, status: 'preparing', customer_name: 'عميل', phone: '0100', total: 120, delivery_fee: 15,
    delivery_address: 'شارع', zone_name: 'وسط البلد', order_type: 'delivery', driver_id: 3,
    items: [{ name_snapshot: 'برجر', quantity: 1, options: [] }], created_at: new Date(),
  }];
  const render = (extra) => ejs.render(fs.readFileSync(file, 'utf8'), Object.assign(base('ar'), {
    orders, flow: ['pending', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'rejected', 'cancelled'],
    drivers: [{ id: 3, name: 'سائق' }], rider: false, err: 'driver',
  }, extra), { filename: file });
  check('شاشة الطلبات فيها تسليم لسائق', /food\/orders\/5\/driver/.test(render({})));
  check('والسائق نفسه مايشوفش الاختيار ده', !/food\/orders\/5\/driver/.test(render({ rider: true, drivers: [] })));
  check('والمنطقة بتبان جنب العنوان', /وسط البلد/.test(render({})));
}

console.log(fail === 0 ? '\n✅ الأجرة بتتبع المنطقة، والسائق بيشوف طلباته هو.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
