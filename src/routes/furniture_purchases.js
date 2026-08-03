// Purchase orders (phase 2): raise, receive, pay, cancel.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const { STATUSES, orderTotals, receive, supplierBalances } = require('../furniture/purchasing');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

// ── List + supplier balances ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const cid = req.company.id;
  const status = STATUSES.includes(req.query.status) ? req.query.status : null;
  try {
    const params = [cid];
    let where = 'po.company_id=$1';
    if (status) where += ' AND po.status=$' + params.push(status);
    const [orders, suppliers, materials, balances] = await Promise.all([
      pool.query(
        `SELECT po.*, s.name AS supplier_name,
                COALESCE(SUM(i.qty * i.unit_cost), 0)          AS ordered_value,
                COALESCE(SUM(i.qty_received * i.unit_cost), 0) AS received_value
           FROM furniture_purchase_orders po
           LEFT JOIN furniture_suppliers s ON s.id = po.supplier_id
           LEFT JOIN furniture_purchase_order_items i ON i.po_id = po.id
          WHERE ${where}
          GROUP BY po.id, s.name
          ORDER BY (po.status IN ('delivered','cancelled')) ASC, po.order_date DESC, po.id DESC
          LIMIT 200`, params),
      pool.query('SELECT id, name FROM furniture_suppliers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query('SELECT id, name, unit FROM furniture_materials WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      supplierBalances(pool, cid),
    ]);
    res.render('furniture_admin/purchases', {
      company: req.company, tab: 'purchases',
      orders: orders.rows, suppliers: suppliers.rows, materials: materials.rows,
      balances, status, statuses: STATUSES,
      err: req.query.err || null, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture purchases]', e.message); res.status(500).send('error'); }
});

// ── Raise an order ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  // Parallel arrays from the repeating line inputs.
  const mids = [].concat(b.material_id || []);
  const qtys = [].concat(b.qty || []);
  const costs = [].concat(b.unit_cost || []);
  const lines = mids
    .map((m, i) => ({ material_id: parseInt(m, 10) || null, qty: num(qtys[i]), unit_cost: num(costs[i]) }))
    .filter((l) => l.material_id && l.qty > 0);
  // An order with no line is not an order — it would sit in the list forever
  // as "pending" with nothing to receive.
  if (!lines.length) return res.redirect('/furniture/purchases?err=no_lines');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
    const po = (await client.query(
      `INSERT INTO furniture_purchase_orders
         (company_id, supplier_id, order_date, expected_delivery, status, total, note)
       VALUES ($1,$2,COALESCE($3, CURRENT_DATE),$4,'pending',$5,$6) RETURNING id`,
      [cid, parseInt(b.supplier_id, 10) || null, date(b.order_date), date(b.expected_delivery),
        total, String(b.note || '').trim().slice(0, 300) || null]
    )).rows[0];

    for (const l of lines) {
      const unit = (await client.query('SELECT unit FROM furniture_materials WHERE id=$1 AND company_id=$2', [l.material_id, cid])).rows[0];
      await client.query(
        `INSERT INTO furniture_purchase_order_items
           (company_id, po_id, material_id, qty, qty_received, unit, unit_cost, total_cost)
         VALUES ($1,$2,$3,$4,0,$5,$6,$7)`,
        [cid, po.id, l.material_id, l.qty, unit ? unit.unit : null, l.unit_cost, l.qty * l.unit_cost]
      );
    }
    await client.query('COMMIT');
    res.redirect('/furniture/purchases/' + po.id + '?saved=1');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[furniture po create]', e.message);
    res.redirect('/furniture/purchases?err=save');
  } finally { client.release(); }
});

// ── One order: lines, receiving, payments ────────────────────────────────────
router.get('/:id', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.redirect('/furniture/purchases');
  try {
    const po = (await pool.query(
      `SELECT po.*, s.name AS supplier_name FROM furniture_purchase_orders po
         LEFT JOIN furniture_suppliers s ON s.id = po.supplier_id
        WHERE po.id=$1 AND po.company_id=$2`, [id, cid]
    )).rows[0];
    if (!po) return res.redirect('/furniture/purchases');
    const items = (await pool.query(
      `SELECT i.*, m.name AS material_name FROM furniture_purchase_order_items i
         LEFT JOIN furniture_materials m ON m.id = i.material_id
        WHERE i.po_id=$1 AND i.company_id=$2 ORDER BY i.id`, [id, cid]
    )).rows;
    const payments = po.supplier_id ? (await pool.query(
      'SELECT * FROM furniture_supplier_payments WHERE company_id=$1 AND supplier_id=$2 ORDER BY pay_date DESC LIMIT 50',
      [cid, po.supplier_id]
    )).rows : [];

    res.render('furniture_admin/purchase_detail', {
      company: req.company, tab: 'purchases',
      po, items, payments, totals: orderTotals(items),
      err: req.query.err || null, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture po]', e.message); res.status(500).send('error'); }
});

// ── Receive ──────────────────────────────────────────────────────────────────
router.post('/:id/receive', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const deltas = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    if (k.startsWith('recv_')) deltas[k.slice(5)] = v;
  }
  try {
    const out = await receive(pool, req.company.id, id, deltas);
    res.redirect('/furniture/purchases/' + id + (out.lines ? '?saved=1' : '?err=nothing'));
  } catch (e) {
    console.error('[furniture receive]', e.message);
    res.redirect('/furniture/purchases/' + id + '?err=receive');
  }
});

// ── Cancel ───────────────────────────────────────────────────────────────────
router.post('/:id/cancel', async (req, res) => {
  const cid = req.company.id;
  const id = parseInt(req.params.id, 10);
  try {
    // Cancelling an order that already brought stock in would leave the material
    // holding quantity from a delivery the books say never happened.
    const got = (await pool.query(
      'SELECT COALESCE(SUM(qty_received),0)::float r FROM furniture_purchase_order_items WHERE po_id=$1 AND company_id=$2',
      [id, cid]
    )).rows[0];
    if (Number(got.r) > 0) return res.redirect('/furniture/purchases/' + id + '?err=has_received');
    await pool.query(
      "UPDATE furniture_purchase_orders SET status='cancelled' WHERE id=$1 AND company_id=$2", [id, cid]
    );
  } catch (e) { console.error('[furniture cancel]', e.message); }
  res.redirect('/furniture/purchases/' + id);
});

// ── Supplier payment ─────────────────────────────────────────────────────────
router.post('/pay', async (req, res) => {
  const b = req.body || {};
  const amount = num(b.amount);
  const supplierId = parseInt(b.supplier_id, 10) || null;
  if (supplierId && amount > 0) {
    try {
      await pool.query(
        `INSERT INTO furniture_supplier_payments (company_id, supplier_id, amount, pay_date, note)
         VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5)`,
        [req.company.id, supplierId, amount, date(b.pay_date), String(b.note || '').trim().slice(0, 300) || null]
      );
    } catch (e) { console.error('[furniture supplier pay]', e.message); }
  }
  res.redirect(b.back === 'order' && b.po_id ? '/furniture/purchases/' + parseInt(b.po_id, 10) + '?saved=1'
    : '/furniture/purchases?saved=1');
});

module.exports = router;
