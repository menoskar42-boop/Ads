// Reports (phase 7): one period view, printable, exported as one workbook.
'use strict';

const express = require('express');
const { Pool } = require('pg');
const R = require('../furniture/reports');
const S = require('../furniture/sales');
const PU = require('../furniture/purchasing');
const XL = require('../lib/xlsx_write');

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

// ── Excel export ─────────────────────────────────────────────────────────────
//
// One workbook with every section as its own sheet, rather than six separate
// downloads. That is the actual gain over CSV: the workshop opens one file and
// has the whole period in front of it, with numbers Excel can still add up.
router.get('/export', async (req, res) => {
  const { from, to } = periodOf(req.query);
  const t = res.locals.t;
  const cat = (k) => { const key = 'fn2.ex.cat.' + k; const v = t(key); return v !== key ? v : k; };
  try {
    const d = await gather(pool, req.company.id, from, to);

    const sheets = [
      { name: t('fn2.rp.line'), widths: [30, 16], rows: [
        [t('fn2.rp.line'), t('fn2.po.pay_amount')],
        [t('fn2.rp.invoiced'), d.period.invoiced],
        [t('fn2.rt.credit'), d.period.returned],
        [t('fn2.rp.net_invoiced'), d.period.netInvoiced],
        [t('fn2.rp.collected'), d.period.collected],
        [t('fn2.rt.refunded'), d.period.refunded],
        [t('fn2.rp.received'), d.period.received],
        [t('fn2.hr.payroll'), d.period.payroll],
        [t('fn2.flag.expenses'), d.period.expenses],
        [t('fn2.rp.difference'), d.period.difference],
        [t('fn2.rp.cash'), d.cash.balance],
        [t('fn2.rp.stock_value'), d.stock.value],
        // The caveat travels with the number. A spreadsheet gets forwarded and
        // re-read long after the page that explained it is closed.
        [t('fn2.rp.difference_hint'), null],
      ] },
      { name: t('fn2.sa.balances'), widths: [30, 16, 16, 16], rows: [
        [t('fn2.sa.customer'), t('fn2.sa.invoiced'), t('iv.paid'), t('iv.due')],
        ...d.customers.map((c) => [c.name, Number(c.invoiced), Number(c.paid), Number(c.balance)]),
      ] },
      { name: t('fn2.po.balances'), widths: [30, 16, 16, 16], rows: [
        [t('fn2.po.supplier'), t('fn2.po.received_value'), t('fn2.po.paid'), t('iv.due')],
        ...d.suppliers.map((x) => [x.name, Number(x.received), Number(x.paid), Number(x.balance)]),
      ] },
      { name: t('fn2.hr.payroll'), widths: [24, 14, 14, 14, 12, 14, 14, 10], rows: [
        [t('fn2.hr.worker'), t('fn2.hr.from'), t('fn2.hr.to'), t('fn2.hr.base'),
          t('fn2.hr.adj.bonus'), t('fn2.hr.deductions'), t('fn2.hr.net'), t('fn2.hr.paid')],
        ...d.payroll.map((p) => [p.worker_name, String(p.period_start).slice(0, 10),
          String(p.period_end).slice(0, 10), Number(p.base), Number(p.bonuses),
          Number(p.deductions), Number(p.net), p.paid ? 1 : 0]),
      ] },
      { name: t('fn2.flag.expenses'), widths: [26, 16, 10], rows: [
        [t('fn2.ex.category'), t('fn2.po.pay_amount'), t('fn2.bom.components')],
        ...d.expenses.map((e) => [cat(e.category), Number(e.total), e.n]),
      ] },
      { name: t('fn2.rp.low_stock'), widths: [30, 12, 14, 14], rows: [
        [t('fn2.po.material'), t('fn2.f.unit'), t('fn2.bom.in_stock'), t('fn2.f.min_qty')],
        ...d.stock.low.map((m) => [m.name, m.unit, Number(m.qty), Number(m.min_qty)]),
      ] },
    ];

    const buf = XL.workbook(sheets, { rtl: res.locals.lang !== 'en' });
    const name = `${(req.company.slug || 'furniture')}-${from}-${to}.xlsx`;
    res.setHeader('Content-Type', XL.MIME);
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Content-Disposition',
      `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.end(buf);
  } catch (e) { console.error('[furniture export]', e.message); res.redirect('/furniture/reports'); }
});

module.exports = router;
