#!/usr/bin/env node
/**
 * أوامر الشراء — the order, and the delivery that must never be counted twice.
 *
 * Before this, stock arrived by somebody typing a number into the inventory
 * form after the boxes were already on the counter. So there was no record of
 * what was ordered, from whom, at what price, or what is still owed — and a
 * supplier who short-delivers is invisible when the only evidence is the shelf.
 *
 * Two rules carry the whole feature, and both are the same rule:
 *
 *   · **What arrived is a fact; the order's state is read from it.** `draft`,
 *     `sent` and `cancelled` are stored because a person decided them.
 *     `partial` and `received` are derived, every time, from the lines. A
 *     stored "received" flag is how an order whose line was corrected keeps
 *     insisting it is complete.
 *
 *   · **A receipt is a claim, not an increment.** The form carries the count it
 *     was drawn with and the UPDATE only matches while that is still the count
 *     in the table. Receiving is the single most double-submitted write in this
 *     panel: end of a long form, on a phone, in a shop.
 *
 * The second rule is tested by running the real handler's statement against a
 * fake table, twice, the way a double-tap would.
 *
 *   node scripts/check-purchase-orders.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const P = require('../src/pharmacy/purchase');
const { t, strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const route = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/pharmacy_admin.js'), 'utf8'));
const schema = stripComments(fs.readFileSync(path.join(ROOT, 'src/pharmacy/schema.js'), 'utf8'));
const logic = stripComments(fs.readFileSync(path.join(ROOT, 'src/pharmacy/purchase.js'), 'utf8'));

/* ── The state is read, not remembered ─────────────────────────────────── */
{
  check('«وصل كله» بيتحسب من الأسطر',
    P.stateOf({ status: 'sent' }, [{ qty_ordered: 5, qty_received: 5 }]) === 'received');
  check('و«وصل جزء» كمان',
    P.stateOf({ status: 'sent' }, [{ qty_ordered: 5, qty_received: 2 }]) === 'partial');
  check('وسطر اتصلّح بيرجّع الأمر ناقص',
    P.stateOf({ status: 'sent' }, [{ qty_ordered: 9, qty_received: 5 }]) === 'partial');
  check('والملغي يفضل ملغي حتى لو وصل منه حاجة',
    P.stateOf({ status: 'cancelled' }, [{ qty_ordered: 5, qty_received: 5 }]) === 'cancelled');
  check('ومفيش عمود بيخزّن «اتستلم»',
    !/received\s+BOOLEAN|status[\s\S]{0,60}'received'/.test(schema)
    && /status\s+TEXT NOT NULL DEFAULT 'draft'/.test(schema));
  // The route must not be able to write it either.
  const statusRoute = route.slice(route.indexOf("router.post('/purchases/:id/status'"));
  check('والراوت مابيقبلش يكتب حالة محسوبة',
    /\['sent', 'cancelled', 'draft'\]\.includes\(want\)/.test(statusRoute.slice(0, 600)));
  check('وحد زيادة عن المطلوب بيتسجّل مش بيتخبّى',
    P.lineState({ qty_ordered: 5, qty_received: 7 }) === 'over' && P.outstanding({ qty_ordered: 5, qty_received: 7 }) === 0);
}

/* ── The delivery that must be recorded once ───────────────────────────── */
{
  // The handler's own statement, run against a table that behaves like Postgres.
  const m = route.match(/UPDATE pharmacy_po_items SET qty_received = qty_received \+ \$3\s*\n\s*WHERE ([^\n]+)\n\s*RETURNING/);
  check('جملة الاستلام بتقرا وتكتب في نفس الوقت', !!m, m ? m[1].trim() : 'مش لاقيها');
  const where = m ? m[1] : '';
  check('والشرط فيه القيمة اللي الفورم اتعرض بيها',
    /qty_received = \$4/.test(where), where);

  // Two presses of the same button, carrying the same `expected`.
  const row = { id: 1, po_id: 7, qty_ordered: 10, qty_received: 0 };
  const apply = (qty, expected) => {
    if (/qty_received = \$4/.test(where) && row.qty_received !== expected) return false;
    row.qty_received += qty;
    return true;
  };
  const first = apply(4, 0);
  const second = apply(4, 0);
  check('ضغطتين على نفس الزرار = استلام واحد',
    first === true && second === false && row.qty_received === 4, row.qty_received + ' وحدة');
  // …and a real second delivery still goes through.
  check('وتسليمة تانية حقيقية بتعدّي عادي', apply(6, 4) === true && row.qty_received === 10);
}

/* ── The stock and the order move together ─────────────────────────────── */
{
  const receive = route.slice(route.indexOf("router.post('/purchases/:id/receive'"));
  const body = receive.slice(0, receive.indexOf("router.", 40) === -1 ? receive.length : receive.indexOf("router.", 40));
  check('الاستلام كله جوّه معاملة واحدة',
    /BEGIN/.test(body) && /COMMIT/.test(body) && (body.match(/ROLLBACK/g) || []).length >= 3);
  check('والمخزون بيدخل كتشغيلة بنفس الـclient',
    /batches\.receive\(client, cid, item\.medicine_id/.test(body));
  check('والتسليمة نفسها بتتكتب',
    /INSERT INTO pharmacy_po_receipts/.test(body));
  check('وأمر ملغي مايتستلمش عليه',
    P.canReceive({ status: 'cancelled' }, []).ok === false && /canReceive/.test(body));
  check('وكل ده جوّه صلاحية المخزون',
    /router\.post\('\/purchases\/:id\/receive', gate\('inventory'\)/.test(route));
  check('وكمية صفر أو بالسالب مابتتقبلش',
    /if \(!itemId \|\| qty <= 0\)/.test(body));
}

/* ── The suggestion is worth acting on ─────────────────────────────────── */
{
  check('الاقتراح عمره ما يبقى صفر', P.suggestQty({ min_qty: 5, available: 20 }) >= 1);
  check('وبيزوّد اللي تحت الحد', P.suggestQty({ min_qty: 10, available: 2 }) === 18);
  check('وبيسيب اللي مالوش حد أدنى',
    P.suggestions([{ min_qty: 0, available: 0 }, { min_qty: 4, available: 4 }]).length === 1);
  check('وبيسيب اللي فوق حدّه', P.suggestions([{ min_qty: 4, available: 9 }]).length === 0);
  check('والأسعار بتتخزّن زي ما اتطلبت',
    /name_at_order/.test(schema) && /INSERT INTO pharmacy_po_items[\s\S]{0,200}name_at_order, qty_ordered, cost/.test(route));
  check('وسطرين لنفس الصنف في نفس الأمر ممنوعين',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_pharm_po_item_uniq ON pharmacy_po_items \(po_id, medicine_id\)/.test(schema));
}

/* ── The screens, in both languages ────────────────────────────────────── */
{
  const keys = ['draft', 'sent', 'partial', 'received', 'cancelled'].map((k) => 'ph.po.state.' + k)
    .concat(['none', 'partial', 'complete', 'over'].map((k) => 'ph.po.line.' + k))
    .concat(['empty', 'save', 'qty', 'line', 'state', 'cancelled', 'already'].map((k) => 'ph.po.err.' + k))
    .concat(['ph.po.cannot.cancelled', 'ph.po.nav', 'ph.po.title', 'ph.po.new']);
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل حالة ليها نص (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }

  const items = [
    { id: 1, name: 'بنادول', name_at_order: 'بنادول', qty_ordered: 10, qty_received: 4, cost: 12, lineState: 'partial', outstanding: 6 },
    { id: 2, name: 'كومتركس', name_at_order: null, qty_ordered: 5, qty_received: 5, cost: null, lineState: 'complete', outstanding: 0 },
  ];
  const po = { id: 3, supplier: 'المورّد', created_at: new Date(), status: 'sent' };
  const views = {
    purchases: { rows: [{ id: 3, supplier: 'x', created_at: new Date(), qty_ordered: 15, qty_received: 9, lines: 2, state: 'partial' }], saved: true, err: 'already' },
    purchase_new: { suggestions: P.suggestions([{ medicine_id: 1, name: 'بنادول', min_qty: 10, available: 2, cost: 12 }]) },
    purchase_detail: {
      po, items, receipts: [{ id: 1, qty: 4, batch_no: 'B1', expiry: new Date(), received_by: 'المالك', created_at: new Date() }],
      state: 'partial', totals: P.totals(items), canEdit: P.canEdit(po, items), canReceive: P.canReceive(po, items),
      saved: false, err: null,
    },
  };
  for (const lang of ['ar', 'en']) {
    for (const [name, data] of Object.entries(views)) {
      const file = path.join(ROOT, 'src/views/pharmacy_admin', name + '.ejs');
      let error = null, html = null;
      try {
        html = ejs.render(fs.readFileSync(file, 'utf8'), Object.assign({
          t: (k) => t(k, lang), lang, dir: lang === 'ar' ? 'rtl' : 'ltr', LOC: lang === 'en' ? 'en-GB' : 'ar-EG',
          company: { id: 1, company_name: 'صيدلية', slug: 'pharmacy' }, session: {},
          perms: { inventory: true, pos: true, orders: true, settings: true, staff: true, canFinance: true },
          payReady: true, einvoiceOn: false, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
        }, data), { filename: file });
      } catch (e) { error = e.message.split('\n')[0]; }
      check(`صفحة ${name} بتتعرض (${lang})`, !error, error || 'تمام');
      if (html) {
        const raw = html.match(/\bph\.po\.[a-z_.]+/g);
        check(`ومفيش مفتاح طالع للشاشة (${name} · ${lang})`, !raw, raw ? raw[0] : 'ولا واحد');
      }
    }
  }

  // A cashier has no business ordering stock, and the menu should not offer it.
  const nav = fs.readFileSync(path.join(ROOT, 'src/views/pharmacy_admin/nav.ejs'), 'utf8');
  check('ولينك أوامر الشراء بيظهر لصاحب صلاحية المخزون بس',
    /P\.inventory[^\n]*\/pharmacy\/purchases/.test(nav));
}

/* ── The money stays with the people allowed to see it ─────────────────── */
{
  const view = path.join(ROOT, 'src/views/pharmacy_admin/purchase_detail.ejs');
  const items = [{ id: 1, name: 'x', qty_ordered: 4, qty_received: 0, cost: 99.5, lineState: 'none', outstanding: 4 }];
  const po = { id: 1, supplier: null, created_at: new Date(), status: 'draft' };
  const render = (canFinance) => ejs.render(fs.readFileSync(view, 'utf8'), {
    t: (k) => t(k, 'ar'), lang: 'ar', dir: 'rtl', LOC: 'ar-EG',
    company: { id: 1, company_name: 'ص', slug: 's' }, session: {},
    perms: { inventory: true, pos: true, orders: true, settings: true, staff: true, canFinance },
    payReady: true, einvoiceOn: false, payLink: '/accounting/payments', einvoiceLink: '/einvoice',
    po, items, receipts: [], state: 'draft', totals: P.totals(items),
    canEdit: P.canEdit(po, items), canReceive: P.canReceive(po, items), saved: false, err: null,
  }, { filename: view });
  check('سعر الشراء بيبان للّي معاه صلاحية الفلوس', /99\.5/.test(render(true)));
  check('ومابيبانش للّي مالوش', !/99\.5/.test(render(false)));
}

console.log(fail === 0 ? '\n✅ أمر الشراء بيقول اللي حصل، والاستلام بيتسجّل مرة.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
