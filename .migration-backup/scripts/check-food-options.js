#!/usr/bin/env node
/**
 * "Large, extra cheese, no onion" — and the pickup order that paid for delivery.
 *
 * Two things were missing from every food order in this system, and both cost
 * real money in opposite directions:
 *
 *   · **Order type.** Every order was a delivery. A customer collecting their
 *     own food was charged a delivery fee and made to type an address for a
 *     driver who was never coming.
 *   · **Modifiers.** Size, extras and "without" had nowhere to live but the
 *     comments box — so they never changed the price, and the kitchen read them
 *     only if somebody happened to.
 *
 * The way modifiers go wrong is always the same: the browser sends the price.
 * Then a large pizza costs whatever the page was talked into saying. So the
 * client here sends only WHICH options were chosen, and the server prices them
 * from the menu — including refusing an option id that belongs to a different
 * item, which is the trick that turns a free extra into a discount on an
 * expensive one.
 *
 * Every rule below is exercised against the real pricing function.
 *
 *   node scripts/check-food-options.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const O = require('../src/food/options');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const GROUPS = [
  { id: 1, name: 'الحجم', required: true, min_select: 1, max_select: 1,
    values: [{ id: 10, name: 'وسط', price_delta: 0 }, { id: 11, name: 'كبير', price_delta: 15 }] },
  { id: 2, name: 'إضافات', required: false, min_select: 0, max_select: 2,
    values: [{ id: 20, name: 'جبنة', price_delta: 8 }, { id: 21, name: 'بيكون', price_delta: 12 }, { id: 22, name: 'مشروم', price_delta: 6 }] },
  { id: 3, name: 'بدون', required: false, min_select: 0, max_select: 0,
    values: [{ id: 30, name: 'بدون بصل', price_delta: 0 }] },
];
const ITEM = { id: 7, price: 50 };

/* ── The price comes from the menu, not from the browser ───────────────── */
{
  const ok = O.priceLine(ITEM, GROUPS, [11, 20]);
  check('السعر بيتحسب من قائمة المطعم', ok.ok === true && ok.price === 73, JSON.stringify(ok.price));
  check('والاختيارات بتتسجّل بأسمائها', O.describe(ok.chosen) === 'كبير · جبنة', O.describe(ok.chosen));
  // The whole reason the ids are validated.
  const alien = O.priceLine(ITEM, GROUPS, [999]);
  check('واختيار من صنف تاني بيترفض', alien.ok === false && alien.why === 'unknown_option', alien.why);
  // The client cannot send a price at all: the function does not take one.
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'src/food/options.js'), 'utf8'));
  check('ومفيش سعر جاي من العميل أصلاً', !/req\.body|price_from_client/.test(src));
  const tenant = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8'));
  const order = tenant.slice(tenant.indexOf("router.post('/order/food'"));
  const body = order.slice(0, order.indexOf("router.", 40));
  check('والراوت بيسعّر بالدالة دي مش بحساب تاني',
    /foodOptions\.priceLine\(r, groupsByItem\[r\.id\] \|\| \[\], it\.opts\)/.test(body));
  check('والاختيارات بتتقرا من قاعدة البيانات وقت الطلب',
    /FROM food_item_options o/.test(body) && /food_item_option_values/.test(body));
}

/* ── The group rules, enforced where they cannot be edited ─────────────── */
{
  check('مجموعة إجبارية من غير اختيار بترفض الطلب',
    O.priceLine(ITEM, GROUPS, []).why === 'required');
  check('وأكتر من المسموح بيترفض',
    O.priceLine(ITEM, GROUPS, [10, 20, 21, 22]).why === 'too_many');
  check('و«بدون» من غير حد بتعدّي',
    O.priceLine(ITEM, GROUPS, [10, 30]).ok === true);
  check('وسعر «بدون» مابيزوّدش حاجة',
    O.priceLine(ITEM, GROUPS, [10, 30]).price === 50);
  // A menu with a negative modifier must not make the food free.
  const weird = O.priceLine({ price: 5 }, [{ id: 9, name: 'x', values: [{ id: 90, name: 'y', price_delta: -50 }] }], [90]);
  check('وسعر سالب مابيبقاش وجبة ببلاش', weird.ok === true && weird.price === 0, String(weird.price));
  const noPrice = O.priceLine({ price: null }, [], []);
  check('وصنف من غير سعر بيترفض', noPrice.ok === false && noPrice.why === 'price');
}

/* ── The cart the browser sent ─────────────────────────────────────────── */
{
  const cart = O.normalizeCart([
    { id: '7', q: '2', opts: ['11', '20', '11'] },   // duplicate choice
    { id: 'abc', q: 1 },                              // not an item
    { id: 9, q: -3 },                                 // impossible quantity
    { id: 8, q: 1, opts: 'nope' },                    // not a list
  ]);
  check('الاختيار المكرر بيتحسب مرة', cart[0].opts.join(',') === '11,20', cart[0].opts.join(','));
  check('واللي مش رقم بيتشال', cart.length === 3 && !cart.some((c) => Number.isNaN(c.id)));
  check('وكمية بالسالب بتبقى واحد', cart.find((c) => c.id === 9).q === 1);
  check('وopts مش قايمة بتبقى فاضية', cart.find((c) => c.id === 8).opts.length === 0);
}

/* ── No driver, no fee ─────────────────────────────────────────────────── */
{
  check('الاستلام من المحل مابيتحسبش عليه توصيل', O.feeFor('pickup', 25) === 0);
  check('والأكل في المطعم كمان', O.feeFor('dine_in', 25) === 0);
  check('والتوصيل بيتحسب', O.feeFor('delivery', 25) === 25);
  check('ونوع غريب بيرجع للتوصيل', O.typeOf('teleport') === 'delivery');
  check('والعنوان للتوصيل بس', O.needsAddress('delivery') === true && O.needsAddress('pickup') === false);
  check('والترابيزة للأكل في المطعم بس', O.needsTable('dine_in') === true && O.needsTable('delivery') === false);
  // Opt-in per outlet, with delivery the one that starts on.
  check('التوصيل شغّال افتراضياً', O.offers({}, 'delivery') === true);
  check('والباقي بقرار المطعم', O.offers({}, 'pickup') === false && O.offers({}, 'dine_in') === false);
  check('والمطعم اللي قفل التوصيل بيترفض عليه', O.offers({ allow_delivery: false }, 'delivery') === false);

  const tenant = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8'));
  const order = tenant.slice(tenant.indexOf("router.post('/order/food'"));
  const body = order.slice(0, order.indexOf("router.", 40));
  check('والراوت بيحسب الأجرة بالدالة دي', /foodOptions\.feeFor\(orderType/.test(body));
  check('وبيرفض نوع المطعم مابيعملوش', /foodOptions\.offers\(outletRow, orderType\)/.test(body));
  check('وبيطلب العنوان للتوصيل بس', /foodOptions\.needsAddress\(orderType\) && !address/.test(body));
  check('وبيطلب الترابيزة للأكل في المطعم', /foodOptions\.needsTable\(orderType\) && !tableNo/.test(body));
  // And it must not store an address for an order that has none.
  check('وعنوان مابيتخزّنش على طلب استلام',
    /foodOptions\.needsAddress\(orderType\) \? \(address \|\| null\) : null/.test(body));
}

/* ── The kitchen has to be able to read it ─────────────────────────────── */
{
  const kds = fs.readFileSync(path.join(ROOT, 'src/views/food_admin/kds.ejs'), 'utf8');
  check('شاشة المطبخ بتعرض الإضافات', /i\.options && i\.options\.length/.test(kds));
  check('وبتعرض نوع الطلب ورقم الترابيزة', /order_type/.test(kds) && /table_no/.test(kds));
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8');
  check('والاستعلام بيجيبهم أصلاً',
    /SELECT name_snapshot, quantity, options FROM food_order_items/.test(route)
    && /outlet_id, order_type, table_no/.test(route));
  const orders = fs.readFileSync(path.join(ROOT, 'src/views/food_admin/orders.ejs'), 'utf8');
  check('وصفحة الطلبات كمان', /it\.options && it\.options\.length/.test(orders));
  const tenant = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');
  check('والاختيارات بتتخزّن مع السطر',
    /INSERT INTO food_order_items \(order_id, item_id, name_snapshot, quantity, price, options\)/.test(tenant));
}

/* ── Whose menu is it ──────────────────────────────────────────────────── */
{
  const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8'));
  check('محدش يعدّل اختيارات صنف مش بتاعه',
    (route.match(/await ownsItem\(cid, itemId\)/g) || []).length >= 5,
    (route.match(/await ownsItem\(cid, itemId\)/g) || []).length + ' موضع');
  // The value is inserted FROM the group row, and that row has to be this
  // item's — one statement, so a group id from somebody else's menu inserts
  // nothing rather than inserting a price onto their item.
  check('والاختيار بيتربط بمجموعة الصنف نفسه في نفس الجملة',
    /INSERT INTO food_item_option_values[\s\S]{0,160}FROM food_item_options o WHERE o\.id = \$1 AND o\.item_id = \$5/.test(route));
  check('والمسح كمان بيتقيّد بالصنف',
    /DELETE FROM food_item_option_values[\s\S]{0,160}option_id IN \(SELECT id FROM food_item_options WHERE item_id = \$2\)/.test(route));
  const perms = require('../src/food/perms');
  check('وصفحة الاختيارات جوّه صلاحية المنيو', perms.needsFor('/item/3/options') === 'menu');
}

/* ── On the screen, in both languages ──────────────────────────────────── */
{
  const keys = ['orders.type', 'orders.table', 'orders.opt_required', 'orders.opt_max', 'food.admin.order_types']
    .concat(O.TYPES.map((ty) => 'orders.type.' + ty))
    .concat(['order', 'minorder', 'multibranch', 'address', 'table', 'ordertype', 'option',
      'option_required', 'option_too_many', 'option_too_few', 'option_price'].map((c) => 'orders.err.' + c))
    .concat(['title', 'sub', 'none', 'manage', 'add_group', 'group_name', 'value_name', 'delta',
      'add_value', 'required', 'min', 'max', 'no_limit', 'saved', 'no_values', 'group_hint'].map((k) => 'food.opt.' + k))
    .concat(['name', 'save', 'group'].map((k) => 'food.opt.err.' + k));
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }

  const file = path.join(ROOT, 'src/views/food_admin/options.ejs');
  const groups = [
    { id: 1, name: 'الحجم', required: true, min_select: 1, max_select: 1, values: [{ id: 10, name: 'كبير', price_delta: 15 }] },
    { id: 2, name: 'إضافات', required: false, min_select: 0, max_select: 0, values: [] },
  ];
  for (const lang of ['ar', 'en']) {
    for (const [label, data] of Object.entries({ 'فيها مجموعات': { groups }, 'فاضية': { groups: [] } })) {
      let html = null, error = null;
      try {
        html = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign({
          t: (k) => t(k, lang), lang, dir: lang === 'ar' ? 'rtl' : 'ltr', LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
          company: { id: 1, company_name: 'مطعم', slug: 'food' }, session: {},
          perms: { menu: true, orders: true, kds: true, staff: true, reports: true, coupons: true },
          payReady: true, einvoiceOn: false, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
          item: { id: 7, name: 'برجر', name_ar: 'برجر' }, saved: true, err: 'name',
        }, data), { filename: file });
      } catch (e) { error = e.message.split('\n')[0]; }
      check(`صفحة الاختيارات بتتعرض (${lang} · ${label})`, !error, error || 'تمام');
      if (html) {
        const raw = html.match(/\bfood\.opt\.[a-z_.]+/g);
        check(`ومفيش مفتاح طالع (${lang} · ${label})`, !raw, raw ? raw[0] : 'ولا واحد');
      }
    }
  }

  // The storefront no longer keeps its refusals in the template.
  const store = fs.readFileSync(path.join(ROOT, 'src/views/tenant_orders.ejs'), 'utf8');
  check('ورسائل الرفض في المتجر بقت من القاموس', /t\('orders\.err\.' \+ __err\)/.test(store));
  check('ومن قايمة أكواد معروفة مش من الرابط', /__errCodes\.indexOf\(__err\) >= 0/.test(store));
}

console.log(fail === 0 ? '\n✅ السعر بيتحسب عندنا، والاستلام مش بيدفع توصيل.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
