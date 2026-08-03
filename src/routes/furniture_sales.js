// Sales (phase 3): invoices with a deposit, further payments, and statements.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const S = require('../furniture/sales');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

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
    const [sales, customers, products, balances, taxPercent] = await Promise.all([
      pool.query(
        `SELECT s.*, c.name AS customer_name FROM furniture_sales s
           LEFT JOIN furniture_customers c ON c.id = s.customer_id
          WHERE ${where}
          ORDER BY (s.status <> 'open') ASC, s.sale_date DESC, s.id DESC LIMIT 200`, params),
      pool.query('SELECT id, name FROM furniture_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query('SELECT id, name, selling_price FROM furniture_products WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      S.customerBalances(pool, cid),
      taxPercentOf(cid),
    ]);
    res.render('furniture_admin/sales', {
      company: req.company, tab: 'sales',
      sales: sales.rows, customers: customers.rows, products: products.rows,
      balances, taxPercent, status,
      err: req.query.err || null, saved: req.query.saved === '1',
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
  const lines = pids
    .map((p, i) => ({ product_id: parseInt(p, 10) || null, qty: num(qtys[i]) || 1, unit_price: num(prices[i]) }))
    .filter((l) => l.product_id && l.unit_price > 0);
  if (!lines.length) return res.redirect('/furniture/sales?err=no_lines');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = S.invoiceTotals(lines, await taxPercentOf(cid));
    const sale = (await client.query(
      `INSERT INTO furniture_sales
         (company_id, customer_id, sale_date, subtotal, tax, total, paid, status, note)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,$5,$6,0,'open',$7) RETURNING id`,
      [cid, parseInt(b.customer_id, 10) || null, date(b.sale_date),
        t.subtotal, t.tax, t.total, String(b.note || '').trim().slice(0, 300) || null]
    )).rows[0];

    for (const l of lines) {
      await client.query(
        `INSERT INTO furniture_sale_items (company_id, sale_id, product_id, qty, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [cid, sale.id, l.product_id, l.qty, l.unit_price, S.round2(l.qty * l.unit_price)]
      );
    }
    await client.query('COMMIT');

    // The deposit is a payment like any other, taken after the invoice exists so
    // it goes through the same path — one way for money to enter, not two.
    const deposit = num(b.deposit);
    if (deposit > 0) {
      try {
        await S.addPayment(pool, cid, {
          saleId: sale.id, customerId: parseInt(b.customer_id, 10) || null,
          amount: deposit, payDate: date(b.sale_date), method: b.deposit_method,
        });
      } catch (e) { console.error('[furniture deposit]', e.message); }
    }
    res.redirect('/furniture/sales/' + sale.id + '?saved=1');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[furniture sale create]', e.message);
    res.redirect('/furniture/sales?err=save');
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
    const [items, payments, deliveries] = await Promise.all([
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
    ]);
    res.render('furniture_admin/sale_detail', {
      company: req.company, tab: 'sales',
      sale, items: items.rows, payments: payments.rows, deliveries, due: S.dueOf(sale),
      err: req.query.err || null, saved: req.query.saved === '1',
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
