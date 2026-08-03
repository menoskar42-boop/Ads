// Attendance and payroll (phase 5).
'use strict';

const express = require('express');
const { Pool } = require('pg');
const P = require('../furniture/payroll');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
const today = () => new Date().toISOString().slice(0, 10);

// ── Attendance for one day ───────────────────────────────────────────────────
router.get('/attendance', async (req, res) => {
  const cid = req.company.id;
  const day = date(req.query.day) || today();
  try {
    const [workers, marks] = await Promise.all([
      pool.query('SELECT id, name, job_title, pay_type FROM furniture_workers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query('SELECT * FROM furniture_attendance WHERE company_id=$1 AND work_date=$2', [cid, day]),
    ]);
    const by = {};
    marks.rows.forEach((m) => { by[m.worker_id] = m; });
    res.render('furniture_admin/attendance', {
      company: req.company, tab: 'hr',
      workers: workers.rows, marks: by, day, statuses: P.STATUSES,
      saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture attendance]', e.message); res.status(500).send('error'); }
});

router.post('/attendance', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const day = date(b.day) || today();
  try {
    for (const [k, v] of Object.entries(b)) {
      if (!k.startsWith('st_')) continue;
      const workerId = parseInt(k.slice(3), 10);
      if (!Number.isInteger(workerId)) continue;
      const status = P.STATUSES.includes(String(v)) ? String(v) : null;
      // Blank means "not marked". Storing it as present would credit a day
      // nobody confirmed the worker was there.
      if (!status) continue;
      const hours = Math.min(24, Math.max(0, Number(b['ph_' + workerId]) || 0));
      await pool.query(
        `INSERT INTO furniture_attendance (company_id, worker_id, work_date, status, permission_hours)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (company_id, worker_id, work_date)
         DO UPDATE SET status=EXCLUDED.status, permission_hours=EXCLUDED.permission_hours`,
        [cid, workerId, day, status, hours]
      );
    }
  } catch (e) { console.error('[furniture attendance save]', e.message); }
  res.redirect('/furniture/hr/attendance?day=' + day + '&saved=1');
});

// ── Adjustments: bonus, penalty, advance ─────────────────────────────────────
router.post('/adjustments', async (req, res) => {
  const b = req.body || {};
  const workerId = parseInt(b.worker_id, 10) || null;
  const type = ['bonus', 'penalty', 'advance'].includes(b.adj_type) ? b.adj_type : null;
  const amount = num(b.amount);
  if (workerId && type && amount > 0) {
    try {
      await pool.query(
        `INSERT INTO furniture_payroll_adjustments (company_id, worker_id, adj_type, amount, adj_date, note)
         VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6)`,
        [req.company.id, workerId, type, amount, date(b.adj_date), String(b.note || '').trim().slice(0, 300) || null]
      );
    } catch (e) { console.error('[furniture adjustment]', e.message); }
  }
  res.redirect('/furniture/hr/payroll' + (b.start ? '?start=' + b.start + '&end=' + (b.end || '') : ''));
});

// ── Payroll: preview a period, then run it ───────────────────────────────────
router.get('/payroll', async (req, res) => {
  const cid = req.company.id;
  const end = date(req.query.end) || today();
  // A week back by default — the period a workshop actually runs on.
  const start = date(req.query.start)
    || new Date(Date.parse(end) - 6 * 86400000).toISOString().slice(0, 10);
  try {
    const [rows, workers, history] = await Promise.all([
      P.preview(pool, cid, start, end),
      pool.query('SELECT id, name FROM furniture_workers WHERE company_id=$1 AND is_active ORDER BY name', [cid]),
      pool.query(
        `SELECT r.*, w.name AS worker_name FROM furniture_payroll_runs r
           LEFT JOIN furniture_workers w ON w.id = r.worker_id
          WHERE r.company_id=$1 ORDER BY r.period_end DESC, r.id DESC LIMIT 50`, [cid]),
    ]);
    res.render('furniture_admin/payroll', {
      company: req.company, tab: 'hr',
      rows, workers: workers.rows, history: history.rows, start, end,
      weekDays: P.WEEK_DAYS, dayHours: P.DAY_HOURS,
      err: req.query.err || null, saved: req.query.saved === '1',
    });
  } catch (e) { console.error('[furniture payroll]', e.message); res.status(500).send('error'); }
});

router.post('/payroll', async (req, res) => {
  const cid = req.company.id;
  const b = req.body || {};
  const start = date(b.start), end = date(b.end);
  if (!start || !end) return res.redirect('/furniture/hr/payroll?err=period');
  try {
    // Recompute from the database rather than trusting the posted figures, then
    // apply only the edits the owner actually made. A form can be tampered
    // with; the sweep list especially must never come from the client.
    const fresh = await P.preview(pool, cid, start, end);
    const picked = new Set([].concat(b.include || []).map(String));
    const rows = fresh
      .filter((r) => picked.has(String(r.worker_id)))
      .map((r) => {
        const base = b['base_' + r.worker_id] != null ? num(b['base_' + r.worker_id]) : r.base;
        const bonuses = b['bonus_' + r.worker_id] != null ? num(b['bonus_' + r.worker_id]) : r.bonuses;
        const deductions = P.round2(r.penalties + r.advances + r.canteen);
        return { ...r, base, bonuses, deductions, net: P.round2(base + bonuses - deductions) };
      });
    if (!rows.length) return res.redirect('/furniture/hr/payroll?err=nobody&start=' + start + '&end=' + end);
    await P.runPayroll(pool, cid, { start, end, rows, markPaid: b.mark_paid === '1' });
  } catch (e) {
    console.error('[furniture payroll run]', e.message);
    return res.redirect('/furniture/hr/payroll?err=run&start=' + start + '&end=' + end);
  }
  res.redirect('/furniture/hr/payroll?saved=1&start=' + start + '&end=' + end);
});

router.post('/payroll/:id(\\d+)/paid', async (req, res) => {
  try {
    await pool.query('UPDATE furniture_payroll_runs SET paid=true WHERE id=$1 AND company_id=$2',
      [parseInt(req.params.id, 10), req.company.id]);
  } catch (e) { console.error('[furniture payroll paid]', e.message); }
  res.redirect('/furniture/hr/payroll');
});

module.exports = router;
