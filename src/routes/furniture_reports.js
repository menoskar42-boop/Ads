// Reports (phase 7): one period view, printable, with CSV export.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const R = require('../furniture/reports');
const S = require('../furniture/sales');
const PU = require('../furniture/purchasing');

const router = express.Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);

function periodOf(q) {
  const now = new Date();
  return {
    from: date(q.from) || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    to: date(q.to) || now.toISOString().slice(0, 10),
  };
}

/** Everything the page and the exports read, gathered once. */
async function gather(pool, cid, from, to) {
  const [period, cash, stock, customers, suppliers, payroll, expenses] = await Promise.all([
    R.periodSummary(pool, cid, from, to),
    R.cashBalance(pool, cid),
    R.inventory(pool, cid),
    S.customerBalances(pool, cid),
    PU.supplierBalances(pool, cid),
    pool.query(
      `SELECT r.*, w.name AS worker_name FROM furniture_payroll_runs r
         LEFT JOIN furniture_workers w ON w.id = r.worker_id
        WHERE r.company_id=$1 AND r.period_end BETWEEN $2 AND $3
        ORDER BY r.period_end DESC, r.id DESC LIMIT 200`, [cid, from, to]),
    pool.query(
      `SELECT category, SUM(amount) AS total, COUNT(*)::int AS n FROM furniture_expenses
        WHERE company_id=$1 AND spend_date BETWEEN $2 AND $3 GROUP BY category ORDER BY 2 DESC`,
      [cid, from, to]),
  ]);
  return { period, cash, stock, customers, suppliers,
    payroll: payroll.rows, expenses: expenses.rows };
}

router.get('/', async (req, res) => {
  const { from, to } = periodOf(req.query);
  try {
    const data = await gather(pool, req.company.id, from, to);
    res.render('furniture_admin/reports', {
      company: req.company, tab: 'reports', from, to, ...data,
    });
  } catch (e) { console.error('[furniture reports]', e.message); res.status(500).send('error'); }
});

// ── CSV export ───────────────────────────────────────────────────────────────
const EXPORTS = ['customers', 'suppliers', 'payroll', 'expenses', 'inventory', 'summary'];

router.get('/export', async (req, res) => {
  const type = EXPORTS.includes(req.query.type) ? req.query.type : 'summary';
  const { from, to } = periodOf(req.query);
  const t = res.locals.t;
  try {
    const d = await gather(pool, req.company.id, from, to);
    let headers = [], rows = [];

    if (type === 'customers') {
      headers = [t('fn2.sa.customer'), t('fn2.sa.invoiced'), t('iv.paid'), t('iv.due')];
      rows = d.customers.map((c) => [c.name, c.invoiced, c.paid, c.balance]);
    } else if (type === 'suppliers') {
      headers = [t('fn2.po.supplier'), t('fn2.po.received_value'), t('fn2.po.paid'), t('iv.due')];
      rows = d.suppliers.map((s) => [s.name, s.received, s.paid, s.balance]);
    } else if (type === 'payroll') {
      headers = [t('fn2.hr.worker'), t('fn2.hr.from'), t('fn2.hr.to'), t('fn2.hr.base'),
        t('fn2.hr.adj.bonus'), t('fn2.hr.deductions'), t('fn2.hr.net'), t('fn2.hr.paid')];
      rows = d.payroll.map((p) => [p.worker_name, p.period_start, p.period_end, p.base,
        p.bonuses, p.deductions, p.net, p.paid ? '1' : '0']);
    } else if (type === 'expenses') {
      headers = [t('fn2.ex.category'), t('fn2.po.pay_amount'), t('fn2.bom.components')];
      rows = d.expenses.map((e) => [t('fn2.ex.cat.' + e.category) !== 'fn2.ex.cat.' + e.category
        ? t('fn2.ex.cat.' + e.category) : e.category, e.total, e.n]);
    } else if (type === 'inventory') {
      headers = [t('fn2.po.material'), t('fn2.f.unit'), t('fn2.bom.in_stock'), t('fn2.f.min_qty')];
      rows = d.stock.low.map((m) => [m.name, m.unit, m.qty, m.min_qty]);
    } else {
      headers = [t('fn2.rp.line'), t('fn2.po.pay_amount')];
      rows = [
        [t('fn2.rp.invoiced'), d.period.invoiced],
        [t('fn2.rp.collected'), d.period.collected],
        [t('fn2.rp.received'), d.period.received],
        [t('fn2.hr.payroll'), d.period.payroll],
        [t('fn2.flag.expenses'), d.period.expenses],
        [t('fn2.rp.difference'), d.period.difference],
        [t('fn2.rp.cash'), d.cash.balance],
        [t('fn2.rp.stock_value'), d.stock.value],
      ];
    }

    const name = `${type}-${from}-${to}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    // The filename can carry Arabic once a report is named after a business, so
    // it goes out RFC 5987 encoded as well as in the plain form old clients read.
    res.setHeader('Content-Disposition',
      `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.send(R.toCsv(headers, rows));
  } catch (e) { console.error('[furniture export]', e.message); res.redirect('/furniture/reports'); }
});

module.exports = router;
