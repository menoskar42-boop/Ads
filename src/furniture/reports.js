// Reporting: the numbers, and honest names for them.
//
// The hard part here is not the SQL, it is refusing to call things by names
// they have not earned. Materials bought in July may be used in September, and
// a payroll run covers days that produced pieces sold months later. So the
// period figure is a DIFFERENCE between what came in and what went out in that
// window — not accounting profit — and it is labelled that way everywhere.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const one = async (pool, sql, params) => Number((await pool.query(sql, params)).rows[0].v) || 0;

/**
 * Money in and out over a period.
 * Cancelled invoices and cancelled orders are excluded throughout: they are
 * decisions not to trade, and counting them would inflate both sides.
 */
async function periodSummary(pool, cid, from, to) {
  const [invoiced, collected, received, payroll, expenses, canteenCash] = await Promise.all([
    one(pool, `SELECT COALESCE(SUM(total),0) v FROM furniture_sales
                WHERE company_id=$1 AND status <> 'cancelled' AND sale_date BETWEEN $2 AND $3`, [cid, from, to]),
    one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_customer_payments
                WHERE company_id=$1 AND pay_date BETWEEN $2 AND $3`, [cid, from, to]),
    // The value that actually ARRIVED, matching how supplier debt is measured.
    one(pool, `SELECT COALESCE(SUM(i.qty_received * i.unit_cost),0) v
                 FROM furniture_purchase_orders po
                 JOIN furniture_purchase_order_items i ON i.po_id = po.id
                WHERE po.company_id=$1 AND po.status <> 'cancelled' AND po.order_date BETWEEN $2 AND $3`, [cid, from, to]),
    one(pool, `SELECT COALESCE(SUM(net),0) v FROM furniture_payroll_runs
                WHERE company_id=$1 AND period_end BETWEEN $2 AND $3`, [cid, from, to]),
    one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_expenses
                WHERE company_id=$1 AND spend_date BETWEEN $2 AND $3`, [cid, from, to]),
    one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_canteen_purchases
                WHERE company_id=$1 AND paid_cash = true AND buy_date BETWEEN $2 AND $3`, [cid, from, to]),
  ]);
  const outgoings = round2(received + payroll + expenses);
  return {
    invoiced: round2(invoiced), collected: round2(collected),
    received: round2(received), payroll: round2(payroll), expenses: round2(expenses),
    canteenCash: round2(canteenCash),
    outgoings,
    // Named `difference`, never `profit`. See the file header.
    difference: round2(invoiced - outgoings),
  };
}

/**
 * Cash position, all time.
 * The rule the project settled on: customer payments + canteen cash, minus
 * supplier payments, expenses and payroll actually PAID. Payroll approved but
 * not yet handed over has not left the drawer, so it is not subtracted.
 */
async function cashBalance(pool, cid) {
  const [inCust, inCanteen, outSupp, outExp, outPay] = await Promise.all([
    one(pool, 'SELECT COALESCE(SUM(amount),0) v FROM furniture_customer_payments WHERE company_id=$1', [cid]),
    one(pool, 'SELECT COALESCE(SUM(amount),0) v FROM furniture_canteen_purchases WHERE company_id=$1 AND paid_cash = true', [cid]),
    one(pool, 'SELECT COALESCE(SUM(amount),0) v FROM furniture_supplier_payments WHERE company_id=$1', [cid]),
    one(pool, 'SELECT COALESCE(SUM(amount),0) v FROM furniture_expenses WHERE company_id=$1', [cid]),
    one(pool, 'SELECT COALESCE(SUM(net),0) v FROM furniture_payroll_runs WHERE company_id=$1 AND paid = true', [cid]),
  ]);
  return {
    in: round2(inCust + inCanteen), out: round2(outSupp + outExp + outPay),
    balance: round2(inCust + inCanteen - outSupp - outExp - outPay),
  };
}

/** Stock valued at its moving average, plus what has fallen below its minimum. */
async function inventory(pool, cid) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(qty * avg_cost),0) AS value,
            COUNT(*) FILTER (WHERE min_qty > 0 AND qty <= min_qty)::int AS low
       FROM furniture_materials WHERE company_id=$1 AND is_active`, [cid]);
  const low = await pool.query(
    `SELECT name, unit, qty, min_qty FROM furniture_materials
      WHERE company_id=$1 AND is_active AND min_qty > 0 AND qty <= min_qty
      ORDER BY (qty - min_qty) LIMIT 50`, [cid]);
  return { value: round2(r.rows[0].value), lowCount: r.rows[0].low, low: low.rows };
}

/** Headline figures for the dashboard. */
async function dashboard(pool, cid) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const [period, cash, stock, owedByCustomers, owedToSuppliers, openOrders] = await Promise.all([
    periodSummary(pool, cid, from, to),
    cashBalance(pool, cid),
    inventory(pool, cid),
    one(pool, `SELECT COALESCE(SUM(total - paid),0) v FROM furniture_sales
                WHERE company_id=$1 AND status='open'`, [cid]),
    one(pool, `SELECT COALESCE(recv,0) - COALESCE(paid,0) v FROM (
                 SELECT (SELECT COALESCE(SUM(i.qty_received * i.unit_cost),0)
                           FROM furniture_purchase_orders po
                           JOIN furniture_purchase_order_items i ON i.po_id = po.id
                          WHERE po.company_id=$1 AND po.status <> 'cancelled') AS recv,
                        (SELECT COALESCE(SUM(amount),0) FROM furniture_supplier_payments
                          WHERE company_id=$1) AS paid) s`, [cid]),
    one(pool, `SELECT COUNT(*) v FROM furniture_purchase_orders
                WHERE company_id=$1 AND status IN ('pending','partial')`, [cid]),
  ]);
  return { from, to, period, cash, stock, owedByCustomers: round2(owedByCustomers),
    owedToSuppliers: round2(owedToSuppliers), openOrders };
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Serialise rows to CSV.
 *
 * The leading BOM is not decoration: without it Excel on Windows reads a UTF-8
 * file as the system codepage and every Arabic name in the export turns to
 * mojibake. A report the workshop cannot read is not an export.
 */
function toCsv(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [headers.map(esc).join(',')];
  for (const r of rows) lines.push(r.map(esc).join(','));
  return '﻿' + lines.join('\r\n');
}

module.exports = { round2, periodSummary, cashBalance, inventory, dashboard, toCsv };
