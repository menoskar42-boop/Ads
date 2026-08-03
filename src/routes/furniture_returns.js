// Returns (phase 8): credit notes against a sale, with optional cash refund.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const RT = require('../furniture/returns');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

// ── List + new return ────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const [returns, sales, customers, products] = await Promise.all([
      RT.listReturns(pool, cid),
      // Only invoices that actually stand can be returned against. A cancelled
      // one delivered nothing, so it is not offered in the picker at all.
      pool.query(
        `SELECT s.id, s.sale_date, s.total, c.name AS customer_name
           FROM furniture_sales s LEFT JOIN furniture_customers c ON c.id = s.customer_id
          WHERE s.company_id=$1 AND s.status <> 'cancelled'
          ORDER BY s.sale_date DESC, s.id DESC LIMIT 200`, [cid]),
      pool.query('SELECT id, name FROM furniture_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      // For a piece sold before this system existed: there is no invoice to
      // check against, so the line is entered by hand and priced by hand.
      pool.query('SELECT id, name, selling_price FROM furniture_products WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    ]);
    res.render('furniture_admin/returns', {
      company: req.company, tab: 'returns',
      returns, sales: sales.rows, customers: customers.rows, products: products.rows,
      err: req.query.err || null, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture returns]', e.message); res.status(500).send('error'); }
});

// ── What is still returnable on one invoice (drives the line picker) ─────────
router.get('/lines/:saleId(\\d+)', async (req, res) => {
  const cid = req.company.id;
  const client = await pool.connect();
  try {
    const allowed = await RT.returnableQty(client, cid, parseInt(req.params.saleId, 10));
    const names = await client.query(
      'SELECT id, name FROM furniture_products WHERE company_id=$1 AND id = ANY($2::int[])',
      [cid, [...allowed.keys()].filter(Boolean)]);
    const byId = new Map(names.rows.map((p) => [p.id, p.name]));
    res.json([...allowed.entries()]
      // A line already fully taken back has nothing left to offer.
      .filter(([, v]) => v.qty > 0)
      .map(([id, v]) => ({ product_id: id, name: byId.get(id) || '—', qty: v.qty, unit_price: v.unit_price })));
  } catch (e) {
    console.error('[furniture return lines]', e.message);
    res.json([]);
  } finally { client.release(); }
});

// ── Record a return ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const b = req.body || {};
  const pids = [].concat(b.product_id || []);
  const qtys = [].concat(b.qty || []);
  const prices = [].concat(b.unit_price || []);
  const lines = pids.map((p, i) => ({
    product_id: p, qty: num(qtys[i]), unit_price: num(prices[i]),
  }));
  try {
    const r = await RT.createReturn(pool, req.company.id, {
      saleId: parseInt(b.sale_id, 10) || null,
      customerId: parseInt(b.customer_id, 10) || null,
      returnDate: date(b.return_date),
      reason: b.reason, note: b.note,
      refundNow: num(b.refund_now),
      lines,
    });
    res.redirect('/furniture/returns/' + r.id + '?saved=1');
  } catch (e) {
    console.error('[furniture return create]', e.message);
    // The reason travels to the page: "over_return" and "not_on_invoice" are
    // things the showroom can fix, not internal failures to swallow.
    const known = ['no_lines', 'over_return', 'not_on_invoice', 'invoice_cancelled', 'invoice_not_found'];
    res.redirect('/furniture/returns?err=' + (known.includes(e.message) ? e.message : 'save'));
  }
});

// ── One return ───────────────────────────────────────────────────────────────
router.get('/:id(\\d+)', async (req, res) => {
  try {
    const data = await RT.getReturn(pool, req.company.id, parseInt(req.params.id, 10));
    if (!data) return res.redirect('/furniture/returns');
    res.render('furniture_admin/return_detail', {
      company: req.company, tab: 'returns', ...data,
      err: req.query.err || null, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture return]', e.message); res.status(500).send('error'); }
});

// ── Pay the credit out later ─────────────────────────────────────────────────
router.post('/:id(\\d+)/refund', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  try {
    await RT.addRefund(pool, req.company.id, id, num((req.body || {}).amount));
    res.redirect('/furniture/returns/' + id + '?saved=1');
  } catch (e) {
    console.error('[furniture refund]', e.message);
    res.redirect('/furniture/returns/' + id + '?err=refund');
  }
});

module.exports = router;
