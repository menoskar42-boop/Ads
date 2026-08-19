// Sales (phase 3): invoices with a deposit, further payments, and statements.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { ref } = require('../lib/tenant_scope');
const S = require('../furniture/sales');
const V = require('../furniture/variants');
const B = require('../furniture/branches');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

// Codes the server knows. The page never prints the address bar's own words.
const SALE_ERRORS = ['no_lines', 'save', 'deposit', 'pay', 'has_paid', 'bad_line'];

async function taxPercentOf(cid) {
  const r = await pool.query('SELECT tax_percent FROM furniture_settings WHERE company_id=$1', [cid]);
  return r.rows[0] ? Number(r.rows[0].tax_percent) : 0;
}

// ── List + new invoice + customer balances ───────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  const status = ['open', 'paid', 'cancelled'].includes(req.query.status) ? req.query.status : null;
  try {
    const params = [cid];
    let where = 's.company_id=$1';
    if (status) where += ' AND s.status=$' + params.push(status);
    where += B.sqlFor(req.branch, params, 's.branch_id');
    const [sales, customers, products, balances, taxPercent, variants] = await Promise.all([
      pool.query(
        `SELECT s.*, c.name AS customer_name FROM furniture_sales s
           LEFT JOIN furniture_customers c ON c.id = s.customer_id
          WHERE ${where}
          ORDER BY (s.status <> 'open') ASC, s.sale_date DESC, s.id DESC LIMIT 200`, params),
      pool.query('SELECT id, name FROM furniture_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query('SELECT id, name, selling_price FROM furniture_products WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      S.customerBalances(pool, cid),
      taxPercentOf(cid),
      pool.query(
        `SELECT id, product_id, name, price_delta FROM furniture_product_variants
          WHERE company_id=$1 AND is_active ORDER BY id`, [cid]),
    ]);
    // The options each piece has, already priced. The browser picks the list
    // to show; it never computes what is in it — a price added up in a page can
    // be edited in that page, and this one goes on an invoice.
    const variantMap = {};
    for (const p of products.rows) {
      const mine = variants.rows.filter((v) => Number(v.product_id) === Number(p.id));
      if (mine.length) variantMap[p.id] = V.optionsFor(p, mine);
    }
    res.render('furniture_admin/sales', {
      company: req.company, tab: 'sales',
      sales: sales.rows, customers: customers.rows, products: products.rows,
      balances, taxPercent, status, variantMap,
      err: SALE_ERRORS.includes(req.query.err) ? req.query.err : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture sales]', e.message); res.status(500).send('error'); }
});

// ── Raise an invoice, optionally with a deposit ──────────────────────────────
router.post('/', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const pids = [].concat(b.product_id || []);
  const qtys = [].concat(b.qty || []);
  const prices = [].concat(b.unit_price || []);
  const vids = [].concat(b.variant_id || []);
  const lines = pids
    .map((p, i) => ({
      product_id: parseInt(p, 10) || null, qty: num(qtys[i]) || 1,
      unit_price: num(prices[i]), variant_raw: vids[i],
    }))
    .filter((l) => l.product_id && l.unit_price > 0);
  if (!lines.length) return res.redirect('/furniture/sales?err=no_lines');

  // Which option was chosen on each line. Resolved against THIS showroom's
  // options for THAT piece, and a line naming an option the piece does not
  // have is refused — never quietly written as the plain version, which is how
  // a wardrobe lands on an invoice at a price nobody agreed to.
  try {
    const variants = (await pool.query(
      `SELECT id, product_id, name, price_delta FROM furniture_product_variants
        WHERE company_id=$1 AND product_id = ANY($2::int[])`,
      [cid, [...new Set(lines.map((l) => l.product_id))]])).rows;
    for (const l of lines) {
      const r = V.resolveVariant(variants, l.variant_raw, l.product_id);
      if (!r.ok) return res.redirect('/furniture/sales?err=bad_line');
      l.variant_id = r.variant ? r.variant.id : null;
      // The option's name is COPIED onto the line. Deleting the option next
      // year must not rewrite what this invoice says was sold.
      l.variant_name = r.variant ? r.variant.name : null;
    }
  } catch (e) {
    console.error('[furniture sale variants]', e.message);
    return res.redirect('/furniture/sales?err=save');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = S.invoiceTotals(lines, await taxPercentOf(cid));
    const sale = (await client.query(
      // customer_id is a number from the form. Scoped in the statement so an
      // invoice cannot be raised against another showroom's customer.
      `INSERT INTO furniture_sales
         (company_id, customer_id, sale_date, subtotal, tax, total, paid, status, note, branch_id)
       VALUES ($1,${ref('furniture_customers', '$2', '$1')},COALESCE($3, CURRENT_DATE),$4,$5,$6,0,'open',$7,$8) RETURNING id`,
      [cid, parseInt(b.customer_id, 10) || null, date(b.sale_date),
        t.subtotal, t.tax, t.total, String(b.note || '').trim().slice(0, 300) || null,
        // Stamped from the active filter when the form does not say: raising an
        // invoice while looking at one branch means it belongs to that branch.
        B.idToStamp(req.branch, b.branch_id, req.branches || [])]
    )).rows[0];

    for (const l of lines) {
      // product_id is a number off the form like customer_id is, and was the
      // one that never got narrowed: an invoice could carry another showroom's
      // piece, and the invoice screen then joined and printed its name. The
      // check happens in the statement that writes the row, and a line that
      // does not resolve fails the whole invoice rather than saving without it.
      const done = await client.query(
        `INSERT INTO furniture_sale_items
           (company_id, sale_id, product_id, variant_id, variant_name, qty, unit_price, total)
         SELECT $1,$2,p.id,${ref('furniture_product_variants', '$4', '$1')},$5,$6,$7,$8
           FROM furniture_products p WHERE p.id=$3 AND p.company_id=$1
         RETURNING id`,
        [cid, sale.id, l.product_id, l.variant_id, l.variant_name,
          l.qty, l.unit_price, S.round2(l.qty * l.unit_price)]
      );
      if (!done.rows.length) { const e = new Error('line product not found'); e.furnitureCode = 'bad_line'; throw e; }
    }
    // In the same transaction as the invoice: a guarantee that exists without
    // the sale that granted it, or a sale whose guarantee silently failed to
    // record, are both worse than the write failing outright.
    await require('../furniture/warranty')
      .createForSale(client, cid, sale.id, parseInt(b.customer_id, 10) || null, lines);

    // The deposit goes through the same path as any other payment — one way for
    // money to enter, not two — but on THIS transaction. Written afterwards on
    // its own connection, a deposit that failed left the invoice saved, the
    // money unrecorded, and the showroom looking at a success message: the
    // customer is then chased for a sum they already handed over.
    const deposit = num(b.deposit);
    if (deposit > 0) {
      try {
        await S.recordPayment(client, cid, {
          saleId: sale.id, customerId: parseInt(b.customer_id, 10) || null,
          amount: deposit, payDate: date(b.sale_date), method: b.deposit_method,
        });
      } catch (e) {
        // Tagged so the screen can name which half went wrong. Both halves are
        // rolled back either way — "the invoice saved but the deposit did not"
        // is exactly the state this route is not allowed to leave behind.
        e.furnitureCode = 'deposit';
        throw e;
      }
    }

    await client.query('COMMIT');
    req.flog('sale.create', 'sale', sale.id, `#${sale.id} · ${S.round2(t.total)}`);
    res.redirect('/furniture/sales/' + sale.id + '?saved=1');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[furniture sale create]', e.message);
    res.redirect('/furniture/sales?err=' + (SALE_ERRORS.includes(e.furnitureCode) ? e.furnitureCode : 'save'));
  } finally { client.release(); }
});

// ── One invoice ──────────────────────────────────────────────────────────────
router.get('/:id(\\d+)', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  try {
    const sale = (await pool.query(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone
         FROM furniture_sales s LEFT JOIN furniture_customers c ON c.id = s.customer_id
        WHERE s.id=$1 AND s.company_id=$2`, [id, cid]
    )).rows[0];
    if (!sale) return res.redirect('/furniture/sales');
    const [items, payments, deliveries, warranties] = await Promise.all([
      pool.query(
        `SELECT i.*, p.name AS product_name FROM furniture_sale_items i
           LEFT JOIN furniture_products p ON p.id = i.product_id
          WHERE i.sale_id=$1 AND i.company_id=$2 ORDER BY i.id`, [id, cid]),
      pool.query(
        'SELECT * FROM furniture_customer_payments WHERE sale_id=$1 AND company_id=$2 ORDER BY pay_date DESC, id DESC',
        [id, cid]),
      // Only when the section is on. Reading it regardless would put a delivery
      // block on the invoice of a showroom that deliberately turned it off.
      req.flags && req.flags.has('delivery')
        ? require('../furniture/delivery').forSale(pool, cid, id) : [],
      req.flags && req.flags.has('warranty')
        ? require('../furniture/warranty').forSale(pool, cid, id) : [],
    ]);
    res.render('furniture_admin/sale_detail', {
      company: req.company, tab: 'sales',
      sale, items: items.rows, payments: payments.rows, deliveries, warranties,
      due: S.dueOf(sale),
      err: SALE_ERRORS.includes(req.query.err) ? req.query.err : null,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture sale]', e.message); res.status(500).send('error'); }
});

// ── Take a payment ───────────────────────────────────────────────────────────
router.post('/pay', async (req, res) => {
  const b = req.body || {};
  const saleId = parseInt(b.sale_id, 10) || null;
  try {
    await S.addPayment(pool, req.company.id, {
      saleId, customerId: parseInt(b.customer_id, 10) || null,
      amount: num(b.amount), payDate: date(b.pay_date), method: b.method,
      note: String(b.note || '').trim().slice(0, 300) || null,
    });
  } catch (e) {
    console.error('[furniture pay]', e.message);
    return res.redirect(saleId ? '/furniture/sales/' + saleId + '?err=pay' : '/furniture/sales?err=pay');
  }
  req.flog('payment.add', 'payment', saleId, saleId ? `#${saleId} · ${num(b.amount)}` : `${num(b.amount)}`);
  res.redirect(saleId ? '/furniture/sales/' + saleId + '?saved=1' : '/furniture/sales?saved=1');
});

// ── Cancel ───────────────────────────────────────────────────────────────────
router.post('/:id(\\d+)/cancel', async (req, res) => {
  const cid = req.company.id, id = parseInt(req.params.id, 10);
  try {
    // Money already taken makes this a refund, not a cancellation — and a
    // refund is a decision with a paper trail, not a status flip.
    const p = (await pool.query(
      'SELECT COALESCE(SUM(amount),0)::float t FROM furniture_customer_payments WHERE sale_id=$1 AND company_id=$2',
      [id, cid]
    )).rows[0];
    if (Number(p.t) > 0) return res.redirect('/furniture/sales/' + id + '?err=has_paid');
    await pool.query("UPDATE furniture_sales SET status='cancelled' WHERE id=$1 AND company_id=$2", [id, cid]);
    req.flog('sale.cancel', 'sale', id, '#' + id);
  } catch (e) { console.error('[furniture sale cancel]', e.message); }
  res.redirect('/furniture/sales/' + id);
});

// ── Customer statement ───────────────────────────────────────────────────────
router.get('/statement/:customerId(\\d+)', async (req, res) => {
  try {
    const data = await S.statement(pool, req.company.id, parseInt(req.params.customerId, 10));
    if (!data.customer) return res.redirect('/furniture/sales');
    res.render('furniture_admin/statement', { company: req.company, tab: 'sales', ...data });
  } catch (e) { console.error('[furniture statement]', e.message); res.status(500).send('error'); }
});

module.exports = router;
