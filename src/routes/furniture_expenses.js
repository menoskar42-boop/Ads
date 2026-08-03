// Expenses (phase 6): what the workshop and showroom spend outside purchasing.
'use strict';

const express = require('express');
const { Pool } = require('pg');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Stored by key so a line reads correctly in either language. A category typed
// by hand before this existed still displays: the view falls back to the raw
// stored string when the key is unknown.
const CATEGORIES = [
  { key: 'rent',        label: 'إيجار' },
  { key: 'utilities',   label: 'كهرباء ومياه' },
  { key: 'transport',   label: 'نقل ومواصلات' },
  { key: 'tools',       label: 'عدد وأدوات' },
  { key: 'maintenance', label: 'صيانة' },
  { key: 'marketing',   label: 'دعاية' },
  { key: 'fees',        label: 'رسوم وضرائب' },
  { key: 'other',       label: 'أخرى' },
];
const KEYS = CATEGORIES.map((c) => c.key);

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

router.get('/', async (req, res) => {
  const cid = req.company.id;
  // Default to the current month — the window a workshop actually reviews.
  const now = new Date();
  const from = date(req.query.from) || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = date(req.query.to) || now.toISOString().slice(0, 10);
  try {
    // One params array, one branch fragment, used by both queries — writing
    // the condition twice is how the list and the totals start disagreeing.
    const params = [cid, from, to];
    const scope = require('../furniture/branches').sqlFor(req.branch, params);
    const [rows, byCat] = await Promise.all([
      pool.query(
        `SELECT * FROM furniture_expenses WHERE company_id=$1 AND spend_date BETWEEN $2 AND $3${scope}
          ORDER BY spend_date DESC, id DESC LIMIT 300`, params),
      pool.query(
        `SELECT category, SUM(amount) AS total, COUNT(*)::int AS n
           FROM furniture_expenses WHERE company_id=$1 AND spend_date BETWEEN $2 AND $3${scope}
          GROUP BY category ORDER BY 2 DESC`, params),
    ]);
    const total = byCat.rows.reduce((s, r) => s + Number(r.total), 0);
    res.render('furniture_admin/expenses', {
      company: req.company, tab: 'expenses',
      rows: rows.rows, byCat: byCat.rows, total, from, to,
      categories: CATEGORIES, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture expenses]', e.message); res.status(500).send('error'); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const amount = num(b.amount);
  if (amount > 0) {
    try {
      await pool.query(
        `INSERT INTO furniture_expenses (company_id, category, amount, spend_date, note, branch_id)
         VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6)`,
        [req.company.id, KEYS.includes(b.category) ? b.category : 'other',
          amount, date(b.spend_date), String(b.note || '').trim().slice(0, 300) || null,
          require('../furniture/branches').idToStamp(req.branch, b.branch_id, req.branches || [])]
      );
      req.flog('expense.add', 'expense', null,
        `${KEYS.includes(b.category) ? b.category : 'other'} · ${amount}`);
    } catch (e) { console.error('[furniture expense add]', e.message); }
  }
  res.redirect('/furniture/expenses?saved=1');
});

router.post('/:id(\\d+)/delete', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    // Read before deleting: once the row is gone the log entry is the only
    // place the amount still exists, so it has to carry it.
    const gone = (await pool.query(
      'SELECT category, amount FROM furniture_expenses WHERE id=$1 AND company_id=$2',
      [id, req.company.id])).rows[0];
    await pool.query('DELETE FROM furniture_expenses WHERE id=$1 AND company_id=$2', [id, req.company.id]);
    if (gone) req.flog('expense.delete', 'expense', id, `${gone.category || 'other'} · ${gone.amount}`);
  } catch (e) { console.error('[furniture expense del]', e.message); }
  res.redirect('/furniture/expenses');
});

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
