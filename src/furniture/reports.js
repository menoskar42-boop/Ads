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

/* ── Branch scoping ──────────────────────────────────────────────────────
 *
 * `req.branch` was prepared on every furniture request and then not passed to
 * any of this, so a showroom filtered to one branch still read the company's
 * combined numbers. "We took 90,000 this month" tells the owner nothing when
 * the other branch took 85,000 of it — which is the exact sentence the branches
 * module opens with.
 *
 * Two things decide how a table gets scoped, and neither is a new column:
 *
 *  · Rows that CARRY branch_id (sales, expenses, deliveries, workers) filter on
 *    it directly.
 *  · Rows that BELONG to one of those derive it — a customer payment through
 *    its invoice, a return through its invoice, a canteen tab through its
 *    worker. Copying branch_id onto them would create a second answer that can
 *    disagree with the first.
 *
 * And some things stay company-wide on purpose, per the same module: ONE timber
 * store, ONE supplier list, one purchasing ledger. Those are not scoped here,
 * and the dashboard says so on the card rather than letting the owner assume.
 */
const B = require('./branches');

/** ` AND <col> = $n` (or IS NULL), pushing onto params. '' when unfiltered. */
const scope = (branch, params, col) => B.sqlFor(branch, params, col);

/** Same, for a table that reaches its branch through another row. */
function via(branch, params, table, fk, parent = 'furniture_sales') {
  if (branch == null) return '';
  const cond = branch === 'none'
    ? 'p.branch_id IS NULL'
    : `p.branch_id = $${params.push(branch)}`;
  return ` AND EXISTS (SELECT 1 FROM ${parent} p WHERE p.id = ${table}.${fk} AND ${cond})`;
}


/**
 * Money in and out over a period.
 * Cancelled invoices and cancelled orders are excluded throughout: they are
 * decisions not to trade, and counting them would inflate both sides.
 */
async function periodSummary(pool, cid, from, to, branch = null) {
  /* Each query builds its own params array: the branch placeholder lands at a
     different number depending on how many the query already had, and sharing
     one array across ten parallel queries would put it in the wrong slot. */
  const P = () => [cid, from, to];
  const [invoiced, collected, received, payroll, expenses, canteenCash, returned, refunded,
    fees, feesPaid] = await Promise.all([
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(total),0) v FROM furniture_sales
                WHERE company_id=$1 AND status <> 'cancelled' AND sale_date BETWEEN $2 AND $3${scope(branch, p, 'branch_id')}`, p); })(),
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_customer_payments
                WHERE company_id=$1 AND pay_date BETWEEN $2 AND $3${via(branch, p, 'furniture_customer_payments', 'sale_id')}`, p); })(),
    // The value that actually ARRIVED, matching how supplier debt is measured.
    one(pool, `SELECT COALESCE(SUM(i.qty_received * i.unit_cost),0) v
                 FROM furniture_purchase_orders po
                 JOIN furniture_purchase_order_items i ON i.po_id = po.id
                WHERE po.company_id=$1 AND po.status <> 'cancelled' AND po.order_date BETWEEN $2 AND $3`, [cid, from, to]),
    one(pool, `SELECT COALESCE(SUM(net),0) v FROM furniture_payroll_runs
                WHERE company_id=$1 AND period_end BETWEEN $2 AND $3`, [cid, from, to]),
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_expenses
                WHERE company_id=$1 AND spend_date BETWEEN $2 AND $3${scope(branch, p, 'branch_id')}`, p); })(),
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_canteen_purchases
                WHERE company_id=$1 AND paid_cash = true AND buy_date BETWEEN $2 AND $3${via(branch, p, 'furniture_canteen_purchases', 'worker_id', 'furniture_workers')}`, p); })(),
    // Credit given back on returned pieces, and the cash actually handed over.
    // The credit reduces what was really sold whether or not the money has
    // moved yet; the refund is a separate, later fact about the drawer.
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(total),0) v FROM furniture_returns
                WHERE company_id=$1 AND return_date BETWEEN $2 AND $3${via(branch, p, 'furniture_returns', 'sale_id')}`, p); })(),
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(refunded),0) v FROM furniture_returns
                WHERE company_id=$1 AND return_date BETWEEN $2 AND $3${via(branch, p, 'furniture_returns', 'sale_id')}`, p); })(),
    // Delivery is charged for, so it is revenue the invoices never mention.
    // Dated by the trip, not the sale: a piece sold in July and delivered in
    // September earned its fare in September.
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(fee),0) v FROM furniture_deliveries
                WHERE company_id=$1 AND scheduled_date BETWEEN $2 AND $3${scope(branch, p, 'branch_id')}`, p); })(),
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(fee_paid),0) v FROM furniture_deliveries
                WHERE company_id=$1 AND scheduled_date BETWEEN $2 AND $3${scope(branch, p, 'branch_id')}`, p); })(),
  ]);
  const outgoings = round2(received + payroll + expenses);
  const netInvoiced = round2(invoiced - returned + fees);
  return {
    invoiced: round2(invoiced), collected: round2(collected),
    received: round2(received), payroll: round2(payroll), expenses: round2(expenses),
    canteenCash: round2(canteenCash),
    returned: round2(returned), refunded: round2(refunded),
    fees: round2(fees), feesPaid: round2(feesPaid), netInvoiced,
    outgoings,
    // Named `difference`, never `profit`. See the file header.
    difference: round2(netInvoiced - outgoings),
  };
}

/**
 * Cash position, all time.
 * The rule the project settled on: customer payments + canteen cash, minus
 * supplier payments, expenses and payroll actually PAID. Payroll approved but
 * not yet handed over has not left the drawer, so it is not subtracted.
 */
async function cashBalance(pool, cid, branch = null) {
  const P = () => [cid];
  const [inCust, inCanteen, inFees, outSupp, outExp, outPay, outRefund] = await Promise.all([
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_customer_payments WHERE company_id=$1${via(branch, p, 'furniture_customer_payments', 'sale_id')}`, p); })(),
    // Trip fees are collected outside the invoice ledger, so they are their own
    // inlet here. Only fee_paid — a fee charged but not yet handed over has not
    // reached the drawer any more than an unpaid invoice has.
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(fee_paid),0) v FROM furniture_deliveries WHERE company_id=$1${scope(branch, p, 'branch_id')}`, p); })(),
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_canteen_purchases WHERE company_id=$1 AND paid_cash = true${via(branch, p, 'furniture_canteen_purchases', 'worker_id', 'furniture_workers')}`, p); })(),
    one(pool, 'SELECT COALESCE(SUM(amount),0) v FROM furniture_supplier_payments WHERE company_id=$1', [cid]),
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(amount),0) v FROM furniture_expenses WHERE company_id=$1${scope(branch, p, 'branch_id')}`, p); })(),
    one(pool, 'SELECT COALESCE(SUM(net),0) v FROM furniture_payroll_runs WHERE company_id=$1 AND paid = true', [cid]),
    // Only `refunded` — a credit note that has not been paid out has not taken
    // anything out of the drawer, and counting it would show cash that is there.
    (() => { const p = P(); return one(pool, `SELECT COALESCE(SUM(refunded),0) v FROM furniture_returns WHERE company_id=$1${via(branch, p, 'furniture_returns', 'sale_id')}`, p); })(),
  ]);
  const out = round2(outSupp + outExp + outPay + outRefund);
  const money_in = round2(inCust + inCanteen + inFees);
  return { in: money_in, out, balance: round2(money_in - out) };
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
async function dashboard(pool, cid, branch = null) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const [period, cash, stock, owedByCustomers, owedToSuppliers, openOrders, lateDeliveries] = await Promise.all([
    periodSummary(pool, cid, from, to, branch),
    cashBalance(pool, cid, branch),
    // Stock, supplier debt and open purchase orders are company-wide BY DESIGN
    // — one timber store, one supplier list. See src/furniture/branches.js. The
    // dashboard labels these cards so the owner is not left to assume.
    inventory(pool, cid),
    (() => { const p = [cid]; return one(pool, `SELECT COALESCE(SUM(total - paid),0) v FROM furniture_sales
                WHERE company_id=$1 AND status='open'${scope(branch, p, 'branch_id')}`, p); })(),
    one(pool, `SELECT COALESCE(recv,0) - COALESCE(paid,0) v FROM (
                 SELECT (SELECT COALESCE(SUM(i.qty_received * i.unit_cost),0)
                           FROM furniture_purchase_orders po
                           JOIN furniture_purchase_order_items i ON i.po_id = po.id
                          WHERE po.company_id=$1 AND po.status <> 'cancelled') AS recv,
                        (SELECT COALESCE(SUM(amount),0) FROM furniture_supplier_payments
                          WHERE company_id=$1) AS paid) s`, [cid]),
    one(pool, `SELECT COUNT(*) v FROM furniture_purchase_orders
                WHERE company_id=$1 AND status IN ('pending','partial')`, [cid]),
    // Overdue deliveries, not open ones: a job booked for next week is not a
    // problem, and a card that counts it teaches the owner to ignore the card.
    (() => { const p = [cid]; return one(pool, `SELECT COUNT(*) v FROM furniture_deliveries
                WHERE company_id=$1 AND status <> 'done' AND scheduled_date < CURRENT_DATE${scope(branch, p, 'branch_id')}`, p); })(),
  ]);
  return { from, to, period, cash, stock, owedByCustomers: round2(owedByCustomers),
    owedToSuppliers: round2(owedToSuppliers), openOrders, lateDeliveries,
    // What the numbers above cover, so the screen can say it out loud.
    branch, companyWide: ['stock', 'owedToSuppliers', 'openOrders'] };
}

module.exports = { round2, periodSummary, cashBalance, inventory, dashboard };
