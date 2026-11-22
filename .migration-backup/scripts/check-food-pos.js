#!/usr/bin/env node
/**
 * The floor and the till.
 *
 * ── Why a table has no status column ────────────────────────────────────────
 *
 * Every floor system stores one, and every floor system ends up with tables
 * stuck on "occupied": a bill closed from the till while the update failed, an
 * order edited instead of the table, an app restarted mid-service. Four people
 * sit down at a table the screen says is taken, the staff stop believing the
 * screen, and after that the screen is decoration.
 *
 * So the state is computed from the orders, every time. There is nothing to get
 * stuck because there is no state — and this file proves it by moving an order
 * through its statuses and watching the table follow.
 *
 * ── Why the till must not have its own prices ───────────────────────────────
 *
 * A second pricing path is a second set of prices, and the one nobody is
 * looking at is always the wrong one. The till calls the same
 * `src/food/options.js` the storefront does, and this checks that it does.
 *
 *   node scripts/check-food-pos.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const T = require('../src/food/tables');
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

const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8'));
const schema = stripComments(fs.readFileSync(path.join(ROOT, 'src/food/schema.js'), 'utf8'));

/* ── The table that cannot get stuck ───────────────────────────────────── */
{
  const table = { id: 4, name: '٤' };
  const order = { id: 9, table_id: 4, status: 'pending', created_at: '2026-08-19T10:00:00Z' };
  check('طاولة عليها طلب = مشغولة', T.stateOf(table, [order]).state === 'busy');
  for (const st of ['accepted', 'preparing', 'ready']) {
    order.status = st;
    if (T.stateOf(table, [order]).state !== 'busy') check('وفضلت مشغولة طول ما الطلب شغّال (' + st + ')', false);
  }
  check('وفضلت مشغولة طول ما الطلب شغّال', true, T.OPEN_STATUSES.join('/'));
  order.status = 'delivered';
  check('وأول ما الطلب يقفل بقت فاضية', T.stateOf(table, [order]).state === 'free');
  order.status = 'cancelled';
  check('والملغي كمان بيسيبها', T.stateOf(table, [order]).state === 'free');
  check('وطلب على طاولة تانية مايشغّلهاش',
    T.stateOf(table, [{ id: 1, table_id: 5, status: 'pending' }]).state === 'free');
  // There is no column to get stuck on.
  check('ومفيش عمود حالة على الطاولة أصلاً',
    /CREATE TABLE IF NOT EXISTS food_tables[\s\S]{0,600}?\);/.test(schema)
    && !/CREATE TABLE IF NOT EXISTS food_tables[\s\S]{0,600}?status/.test(schema));
  check('ومفيش كود بيكتب حالة طاولة',
    !/UPDATE food_tables SET (status|state)/i.test(route));
  const floor = T.floor([{ id: 1 }, { id: 2 }, { id: 3 }], [{ table_id: 2, status: 'preparing' }]);
  check('وملخّص الصالة بيعدّ صح', JSON.stringify(T.summary(floor)) === '{"total":3,"free":2,"busy":1}', JSON.stringify(T.summary(floor)));
  check('وطاولة من غير اسم ليها لافتة تتقري', T.labelOf({ id: 8, name: '  ' }) === '#8');
  check('وعدد الكراسي مايبقاش خيالي', T.seatsOf('1000') === 50 && T.seatsOf('-2') === 0 && T.seatsOf('x') === 0);
}

/* ── One set of prices ─────────────────────────────────────────────────── */
{
  const pos = route.slice(route.indexOf("router.post('/pos/create'"));
  const body = pos.slice(0, pos.indexOf("router.", 40) === -1 ? pos.length : pos.indexOf("router.", 40));
  check('الكاشير بيسعّر بنفس دالة المتجر',
    /foodOptions\.priceLine\(r, groupsByItem\[r\.id\] \|\| \[\], it\.opts\)/.test(body));
  check('ومفيش سعر جاي من الشاشة', !/b\.price|body\.price/.test(body));
  check('والسلة بتتنضّف بنفس القاعدة', /foodOptions\.normalizeCart\(cart\)/.test(body));
  check('والاختيار الغلط بيوقف الطلب كله',
    /if \(bad \|\| !lineItems\.length\)/.test(body) && /ROLLBACK/.test(body));
  check('وكله في معاملة واحدة', /BEGIN/.test(body) && /COMMIT/.test(body));
  check('والطاولة لازم تكون بتاعة المطعم ده',
    /FROM food_tables WHERE id=\$1 AND company_id=\$2 AND is_active=true/.test(body));
  check('وطلب في المطعم من غير طاولة بيترفض',
    /foodOptions\.needsTable\(orderType\) && !tableId/.test(route));
  check('وطلب الكاشير مابيتحسبش عليه توصيل',
    /foodOptions\.feeFor\(orderType, 0\)/.test(body));
  check('والطلب بيتعلّم إنه من الكاشير', /'pos'/.test(body) && /source/.test(schema));
  check('وبيروح للمطبخ على طول', /'preparing'/.test(body));
}

/* ── Who may open what ─────────────────────────────────────────────────── */
{
  check('الكاشير بتاع اللي بياخد الطلبات', perms.needsFor('/pos') === 'orders');
  check('وتقسيم الصالة شغل المنيو', perms.needsFor('/tables') === 'menu');
  // The kitchen tablet is mounted on a wall: it must not reach the till.
  const kitchen = perms.permsFor({ foodStaffId: 5, foodRole: 'kitchen' });
  check('وتابلت المطبخ مايفتحش الكاشير', kitchen.orders === false);
  const nav = fs.readFileSync(path.join(ROOT, 'src/views/food_admin/nav.ejs'), 'utf8');
  check('والقايمة مابتعرضش باب مقفول',
    /__p\.orders[^\n]*\/food\/pos/.test(nav) && /__p\.menu[^\n]*\/food\/tables/.test(nav));
}

/* ── The screens ───────────────────────────────────────────────────────── */
{
  const keys = ['nav', 'title', 'sub', 'none', 'add', 'name', 'seats', 'area', 'outlet', 'total', 'free', 'busy',
    'state.free', 'state.busy', 'saved', 'err.name', 'err.save'].map((k) => 'food.tbl.' + k)
    .concat(['nav', 'title', 'sub', 'empty', 'send', 'sent', 'customer', 'pick_table', 'no_menu', 'no_items',
      'err.empty', 'err.table', 'err.option', 'err.save'].map((k) => 'food.pos.' + k));
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
  const floor = T.floor([{ id: 1, name: '١', seats: 4, area: 'الصالة' }, { id: 2, name: '٢', seats: 2, area: null }],
    [{ id: 7, table_id: 1, status: 'preparing', created_at: new Date() }]);
  const cases = {
    tables: { floor, summary: T.summary(floor), outlets: [{ id: 1, name: 'Main', name_ar: 'الرئيسي' }], saved: true, err: 'name' },
    pos: {
      outlets: [{ id: 1, name: 'Main', name_ar: 'الرئيسي', items: [
        { id: 3, name: 'Burger', name_ar: 'برجر', price: 50, options: [{ id: 1, name: 'الحجم', required: true, min: 1, max: 1, values: [{ id: 10, name: 'كبير', delta: 15 }] }] },
        { id: 4, name: 'Fries', name_ar: 'بطاطس', price: 20, options: [] },
      ] }],
      floor, saved: true, err: 'table', newOrderId: 12,
    },
  };
  for (const lang of ['ar', 'en']) {
    for (const [name, data] of Object.entries(cases)) {
      const file = path.join(ROOT, 'src/views/food_admin', name + '.ejs');
      let html = null, error = null;
      try { html = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign(base(lang), data), { filename: file }); }
      catch (e) { error = e.message.split('\n')[0]; }
      check(`صفحة ${name} بتتعرض (${lang})`, !error, error || 'تمام');
      if (html) {
        const raw = html.match(/\bfood\.(tbl|pos)\.[a-z_.]+/g);
        check(`ومفيش مفتاح طالع (${name} · ${lang})`, !raw, raw ? raw[0] : 'ولا واحد');
      }
    }
  }
  // A restaurant with no tables and no menu yet must not meet a broken screen.
  for (const [name, data] of Object.entries({
    tables: { floor: [], summary: T.summary([]), outlets: [], saved: false, err: null },
    pos: { outlets: [], floor: [], saved: false, err: null, newOrderId: null },
  })) {
    const file = path.join(ROOT, 'src/views/food_admin', name + '.ejs');
    let error = null;
    try { ejs.render(fs.readFileSync(file, 'utf8'), Object.assign(base('ar'), data), { filename: file }); }
    catch (e) { error = e.message.split('\n')[0]; }
    check(`و${name} الفاضية بتتعرض`, !error, error || 'تمام');
  }
}

console.log(fail === 0 ? '\n✅ الطاولة بتتحسب من الطلب، والكاشير بيسعّر بنفس القائمة.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
