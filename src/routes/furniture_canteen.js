// Canteen (phase 6): what workers take, in cash or on account.
//
// The deduction half already exists in payroll.js — this is only the recording
// side. The one thing this page must make obvious is which purchases are still
// waiting to come off a payslip, because that is money the workshop is owed and
// the worker has not yet felt.
'use strict';

const express = require('express');
const { Pool } = require('pg');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

router.get('/', async (req, res) => {
  const cid = req.company.id;
  try {
    const [workers, rows, pending] = await Promise.all([
      pool.query('SELECT id, name FROM furniture_workers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query(
        `SELECT c.*, w.name AS worker_name FROM furniture_canteen_purchases c
           LEFT JOIN furniture_workers w ON w.id = c.worker_id
          WHERE c.company_id=$1 ORDER BY c.buy_date DESC, c.id DESC LIMIT 200`, [cid]),
      // Only on-account rows not yet swept into a payroll run. Cash is settled
      // at the counter and is not a debt; a swept row has already been deducted.
      pool.query(
        `SELECT w.id, w.name, COALESCE(SUM(c.amount),0) AS owed
           FROM furniture_workers w
           JOIN furniture_canteen_purchases c ON c.worker_id = w.id
          WHERE w.company_id=$1 AND c.company_id=$1
            AND c.paid_cash = false AND c.payroll_id IS NULL
          GROUP BY w.id, w.name HAVING SUM(c.amount) > 0 ORDER BY 3 DESC`, [cid]),
    ]);
    res.render('furniture_admin/canteen', {
      company: req.company, tab: 'canteen',
      workers: workers.rows, rows: rows.rows, pending: pending.rows,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture canteen]', e.message); res.status(500).send('error'); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const workerId = parseInt(b.worker_id, 10) || null;
  const amount = num(b.amount);
  if (workerId && amount > 0) {
    try {
      await pool.query(
        `INSERT INTO furniture_canteen_purchases (company_id, worker_id, item, amount, paid_cash, buy_date)
         VALUES ($1,$2,$3,$4,$5,COALESCE($6, CURRENT_DATE))`,
        [req.company.id, workerId, String(b.item || '').trim().slice(0, 120) || null,
          amount, b.paid_cash === '1', date(b.buy_date)]
      );
    } catch (e) { console.error('[furniture canteen add]', e.message); }
  }
  res.redirect('/furniture/canteen?saved=1');
});

router.post('/:id(\\d+)/delete', async (req, res) => {
  try {
    // A purchase already deducted from a payslip cannot be deleted: the payslip
    // is signed and paid, and removing the row would leave a deduction with
    // nothing behind it.
    await pool.query(
      'DELETE FROM furniture_canteen_purchases WHERE id=$1 AND company_id=$2 AND payroll_id IS NULL',
      [parseInt(req.params.id, 10), req.company.id]
    );
  } catch (e) { console.error('[furniture canteen del]', e.message); }
  res.redirect('/furniture/canteen');
});

module.exports = router;
