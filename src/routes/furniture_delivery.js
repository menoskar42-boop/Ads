// Delivery + installation (phase 8): the board, and the four buttons on it.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const D = require('../furniture/delivery');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const VIEWS = ['open', 'today', 'late', 'done'];

router.get('/', async (req, res) => {
  const cid = req.company.id;
  const view = VIEWS.includes(req.query.view) ? req.query.view : 'open';
  try {
    const [jobs, tally, sales, customers] = await Promise.all([
      D.board(pool, cid, view),
      D.counts(pool, cid),
      // Open invoices first: those are the ones with something still to hand over.
      pool.query(
        `SELECT s.id, s.sale_date, s.total, c.name AS customer_name
           FROM furniture_sales s LEFT JOIN furniture_customers c ON c.id = s.customer_id
          WHERE s.company_id=$1 AND s.status <> 'cancelled'
          ORDER BY (s.status <> 'open') ASC, s.sale_date DESC, s.id DESC LIMIT 200`, [cid]),
      pool.query('SELECT id, name FROM furniture_customers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
    ]);
    res.render('furniture_admin/delivery', {
      company: req.company, tab: 'delivery',
      jobs, tally, view, today: D.today(),
      sales: sales.rows, customers: customers.rows,
      err: req.query.err || null, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture delivery]', e.message); res.status(500).send('error'); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  try {
    await D.schedule(pool, req.company.id, {
      saleId: b.sale_id, customerId: b.customer_id, kind: b.kind,
      scheduledDate: date(b.scheduled_date), slot: b.slot, crew: b.crew,
      address: b.address, phone: b.phone, note: b.note,
    });
    res.redirect('/furniture/delivery?saved=1');
  } catch (e) {
    console.error('[furniture delivery create]', e.message);
    const known = ['no_customer', 'invoice_not_found'];
    res.redirect('/furniture/delivery?err=' + (known.includes(e.message) ? e.message : 'save'));
  }
});

router.post('/:id(\\d+)/status', async (req, res) => {
  const b = req.body || {};
  try {
    await D.setStatus(pool, req.company.id, parseInt(req.params.id, 10), b.status, b.note);
  } catch (e) { console.error('[furniture delivery status]', e.message); }
  res.redirect('/furniture/delivery?view=' + (VIEWS.includes(b.view) ? b.view : 'open'));
});

router.post('/:id(\\d+)/move', async (req, res) => {
  const b = req.body || {};
  try {
    await D.reschedule(pool, req.company.id, parseInt(req.params.id, 10), date(b.scheduled_date), b.slot);
  } catch (e) {
    console.error('[furniture delivery move]', e.message);
    return res.redirect('/furniture/delivery?err=bad_date');
  }
  res.redirect('/furniture/delivery?saved=1');
});

module.exports = router;
