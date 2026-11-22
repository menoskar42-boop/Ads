#!/usr/bin/env node
/**
 * The bun the kitchen ran out of, and the margin that was not real.
 *
 * Stock was tracked per menu item, which is a number nobody counts — a kitchen
 * counts buns, not burgers. And cost was not tracked at all, so "is this dish
 * making money" had no answer.
 *
 * Two rules decide whether the answers are worth having:
 *
 *   · **Unknown is not zero.** One ingredient without a recorded cost makes the
 *     whole dish's cost unknown. Summing the rest produces a number that leaves
 *     out the meat and looks healthy, which is worse than no number at all.
 *   · **Once, and only once.** Ingredients leave the shelf with the order and
 *     come back if it is cancelled, each claimed through a unique index on
 *     (order_id, kind). A retried request or a double-tapped cancel writes one
 *     row. Without it the shelf drifts a little every busy night.
 *
 * The second rule is tested by running the real consume/restore against a fake
 * database that keeps quantities.
 *
 *   node scripts/check-food-ingredients.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const I = require('../src/food/ingredients');
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

/* ── Unknown is not zero ───────────────────────────────────────────────── */
{
  const byId = { 1: { cost_per_unit: 2 }, 2: { cost_per_unit: null }, 3: { cost_per_unit: 0.5 } };
  check('التكلفة بتتحسب من المكوّنات',
    I.costOf([{ ingredient_id: 1, qty: 2 }, { ingredient_id: 3, qty: 4 }], byId) === 6);
  check('ومكوّن من غير تكلفة بيخلّي الطبق كله «غير معروف»',
    I.costOf([{ ingredient_id: 1, qty: 2 }, { ingredient_id: 2, qty: 1 }], byId) === null);
  check('ومفيش وصفة = مفيش تكلفة، مش صفر', I.costOf([], byId) === null);
  check('ومكوّن اتمسح بيخلّيها غير معروفة كمان',
    I.costOf([{ ingredient_id: 99, qty: 1 }], byId) === null);
  check('والربح بيتحسب من التكلفة المعروفة بس',
    JSON.stringify(I.marginOf(50, 6)) === '{"profit":44,"percent":88}');
  check('وتكلفة غير معروفة = ربح غير معروف', I.marginOf(50, null) === null);
  check('وطبق بيخسر بيبان بالسالب', I.marginOf(10, 14).profit === -4);
  // A cost of exactly zero is a real answer (a garnish nobody prices).
  check('وصفر حقيقي لسه صفر', I.costOf([{ ingredient_id: 4, qty: 3 }], { 4: { cost_per_unit: 0 } }) === 0);
  // And the form must not turn "not priced yet" into zero.
  const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8'));
  check('والفورم مابيحوّلش الفاضي لصفر',
    /b\.cost_per_unit === '' \|\| b\.cost_per_unit == null\) \? null/.test(route));
}

/* ── What one order takes off the shelf ────────────────────────────────── */
{
  const recipes = { 7: [{ ingredient_id: 1, qty: 0.5 }, { ingredient_id: 2, qty: 1 }], 8: [{ ingredient_id: 1, qty: 2 }] };
  const need = I.needFor([{ id: 7, qty: 3 }, { id: 8, qty: 1 }], recipes);
  check('كميات المكوّنات بتتجمّع عبر الأصناف', need.get(1) === 3.5 && need.get(2) === 3, JSON.stringify([...need]));
  check('وصنف من غير وصفة مابياخدش حاجة', I.needFor([{ id: 9, qty: 5 }], recipes).size === 0);
  check('وكمية صفر مابتخصمش', I.needFor([{ id: 7, qty: 0 }], recipes).size === 0);
  check('واللي قرّب يخلص بيتحدّد بحدّه هو',
    I.lowStock([{ stock_qty: 2, min_qty: 5 }, { stock_qty: 9, min_qty: 5 }, { stock_qty: 0, min_qty: 0 }]).length === 1);
}

/* ── Once, and only once ───────────────────────────────────────────────── */
function fakeDb(stock) {
  const db = { stock: Object.assign({}, stock), moves: [], seq: 1 };
  db.query = async (sql, params) => {
    const s = sql.replace(/\s+/g, ' ');
    if (/INSERT INTO food_stock_moves/.test(s)) {
      const [cid, orderId, ] = params;
      const kind = /'consume'/.test(s) ? 'consume' : 'restore';
      // The unique index, honestly emulated: (order_id, kind) may exist once.
      if (db.moves.some((m) => m.order_id === orderId && m.kind === kind)) {
        return { rows: /ON CONFLICT DO NOTHING/.test(s) ? [] : [{ id: 0 }] };
      }
      db.moves.push({ id: db.seq++, company_id: cid, order_id: orderId, kind });
      return { rows: [{ id: db.seq }] };
    }
    if (/UPDATE food_ingredients SET stock_qty = GREATEST\(0, stock_qty - \$3\)/.test(s)) {
      const [id, , amount] = params;
      db.stock[id] = Math.max(0, (db.stock[id] || 0) - amount);
      return { rows: [] };
    }
    if (/UPDATE food_ingredients SET stock_qty = stock_qty \+ \$3/.test(s)) {
      const [id, , amount] = params;
      db.stock[id] = (db.stock[id] || 0) + amount;
      return { rows: [] };
    }
    return { rows: [] };
  };
  return db;
}

(async () => {
{
  const db = fakeDb({ 1: 100, 2: 10 });
  const need = new Map([[1, 3.5], [2, 3]]);
  const first = await I.consume(db, 9, 55, need);
  check('الطلب بينزّل المكوّنات', first.ok === true && db.stock[1] === 96.5 && db.stock[2] === 7, JSON.stringify(db.stock));
  const again = await I.consume(db, 9, 55, need);
  check('ونفس الطلب مابينزّلهاش تاني',
    again.ok === false && again.why === 'already' && db.stock[1] === 96.5, JSON.stringify(db.stock));

  const back = await I.restore(db, 9, 55, need);
  check('والإلغاء بيرجّعها', back.ok === true && db.stock[1] === 100 && db.stock[2] === 10, JSON.stringify(db.stock));
  const backAgain = await I.restore(db, 9, 55, need);
  check('وإلغاء اتضغط مرتين مايرجّعهاش مرتين',
    backAgain.ok === false && db.stock[1] === 100, JSON.stringify(db.stock));
}

{
  // Never below zero: the food left the kitchen whatever the record said.
  const db = fakeDb({ 1: 1 });
  await I.consume(db, 9, 60, new Map([[1, 5]]));
  check('والرصيد مابينزلش تحت الصفر', db.stock[1] === 0, String(db.stock[1]));
}

/* ── Wired into the two places an order is created ─────────────────────── */
{
  const admin = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8'));
  const tenant = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8'));
  check('الكاشير بينزّل المكوّنات', /foodIngredients\.consume\(client, cid, ord\.id, need\)/.test(admin));
  check('والمتجر كمان', /foodIngredients\.consume\(client, company\.id, ord\.id, need\)/.test(tenant));
  check('والإلغاء بيرجّعها', /foodIngredients\.restore\(client, cid, id, need\)/.test(admin));
  check('والرفض كمان', /status === 'cancelled' \|\| status === 'rejected'/.test(admin));
  // Inside the transaction, and not swallowed: a caught error in Postgres
  // still aborts the transaction, so "log and carry on" cannot commit.
  const orderBlock = tenant.slice(tenant.indexOf("router.post('/order/food'"));
  const body = orderBlock.slice(0, orderBlock.indexOf('router.', 40));
  const idx = body.indexOf('foodIngredients.consume');
  check('والخصم جوّه نفس المعاملة قبل الـCOMMIT',
    idx > 0 && body.indexOf("COMMIT", idx) > idx && body.lastIndexOf('BEGIN', idx) > 0);
  check('ومش متلفّف في try بيبلع الخطأ',
    !/try \{[\s\S]{0,200}foodIngredients\.consume[\s\S]{0,200}\} catch/.test(body));
}

/* ── Whose ingredients ─────────────────────────────────────────────────── */
{
  const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8'));
  check('المكوّن لازم يكون بتاع المطعم ده في نفس جملة الكتابة',
    /INSERT INTO food_recipes[\s\S]{0,200}FROM food_ingredients i WHERE i\.id = \$2 AND i\.company_id = \$4/.test(route));
  check('والوصفة لصنف المطعم نفسه', (route.match(/ownsItem\(cid, itemId\)/g) || []).length >= 8,
    (route.match(/ownsItem\(cid, itemId\)/g) || []).length + ' موضع');
  check('والصفحات جوّه صلاحية المنيو',
    perms.needsFor('/ingredients') === 'menu' && perms.needsFor('/item/3/recipe') === 'menu');
  const schema = fs.readFileSync(path.join(ROOT, 'src/food/schema.js'), 'utf8');
  check('وفهرس فريد بيمنع الخصم مرتين',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_food_stock_move_once ON food_stock_moves \(order_id, kind\)/.test(schema));
  check('ومكوّن مرتين في نفس الوصفة ممنوع',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_food_recipe_uniq ON food_recipes \(item_id, ingredient_id\)/.test(schema));
}

/* ── On the screen ─────────────────────────────────────────────────────── */
{
  const keys = ['nav', 'title', 'sub', 'none', 'add', 'name', 'unit', 'stock', 'cost', 'min', 'low',
    'unknown', 'saved', 'cost_hint', 'err.name', 'err.save'].map((k) => 'food.ing.' + k)
    .concat(['title', 'sub', 'lines', 'none', 'qty', 'price', 'cost', 'margin', 'unknown',
      'why_unknown', 'no_ingredients', 'err.qty', 'err.ingredient', 'err.save'].map((k) => 'food.rec.' + k));
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
  const rows = [
    { id: 1, name: 'عيش', unit: 'قطعة', stock_qty: 3, cost_per_unit: 1.5, min_qty: 10 },
    { id: 2, name: 'لحمة', unit: 'g', stock_qty: 5000, cost_per_unit: null, min_qty: 0 },
  ];
  const recipe = [
    { id: 1, ingredient_id: 1, qty: 1, name: 'عيش', unit: 'قطعة', cost_per_unit: 1.5 },
    { id: 2, ingredient_id: 2, qty: 150, name: 'لحمة', unit: 'g', cost_per_unit: null },
  ];
  const cases = {
    ingredients: { rows, low: I.lowStock(rows), saved: true, err: 'name' },
    recipe: {
      item: { id: 7, name: 'Burger', name_ar: 'برجر', price: 50 }, ingredients: rows, recipe,
      cost: null, margin: null, saved: false, err: 'qty',
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
        const raw = html.match(/\bfood\.(ing|rec)\.[a-z_.]+/g);
        check(`ومفيش مفتاح طالع (${name} · ${lang})`, !raw, raw ? raw[0] : 'ولا واحد');
      }
    }
  }
  // The unknown cost must SAY unknown, not print a number.
  const file = path.join(ROOT, 'src/views/food_admin/recipe.ejs');
  const html = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign(base('ar'), cases.recipe), { filename: file });
  check('وصفحة الوصفة بتقول «غير معروف» بدل رقم ناقص',
    html.indexOf(t('food.rec.unknown', 'ar')) >= 0 && html.indexOf(t('food.rec.why_unknown', 'ar')) >= 0);
  const priced = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign(base('ar'), cases.recipe, {
    cost: 6, margin: I.marginOf(50, 6),
  }), { filename: file });
  check('ولما تكون معروفة بتعرض الربح', /44\.00/.test(priced));
}

console.log(fail === 0 ? '\n✅ التكلفة غير المعروفة بتقول كده، والمكوّنات بتنزل مرة واحدة.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('❌ الفحص نفسه وقع:', e.message); process.exit(1); });
