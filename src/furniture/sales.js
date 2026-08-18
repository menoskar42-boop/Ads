// Sales invoices, payments and customer statements.
//
// Furniture is bought with a deposit and settled over weeks, so the money side
// is the point: an invoice is rarely paid once. Payments are therefore rows in
// their own table and `furniture_sales.paid` is only ever a cached SUM of them,
// recomputed inside the same transaction. It is never incremented in place —
// that is how a cached total drifts from the ledger it is meant to summarise,
// and then nobody can tell which of the two is lying.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Invoice arithmetic. Tax comes from the showroom's settings, so a workshop
 * that charges none never sees a tax line at all.
 */
function invoiceTotals(lines, taxPercent) {
  const subtotal = round2((lines || []).reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0));
  const pct = Math.min(100, Math.max(0, Number(taxPercent) || 0));
  const tax = round2(subtotal * (pct / 100));
  return { subtotal, tax, total: round2(subtotal + tax) };
}

/** What is still owed on one invoice. Never negative — an overpayment is
 *  credit on the customer's account, not a negative balance on the invoice. */
function dueOf(sale) {
  return Math.max(0, round2(Number(sale.total) - Number(sale.paid)));
}

/** An invoice is settled once payments reach its total. Cancelled stays put. */
function statusFor(sale, paid) {
  if (sale.status === 'cancelled') return 'cancelled';
  return round2(paid) >= round2(Number(sale.total)) ? 'paid' : 'open';
}

/**
 * Recompute one invoice's paid figure and status from its payment rows.
 * Takes a client, not a pool: it must run inside the caller's transaction.
 */
async function syncPaid(client, companyId, saleId) {
  const sale = (await client.query(
    'SELECT id, total, status FROM furniture_sales WHERE id=$1 AND company_id=$2 FOR UPDATE',
    [saleId, companyId]
  )).rows[0];
  if (!sale) return null;
  const sum = (await client.query(
    'SELECT COALESCE(SUM(amount),0)::float AS paid FROM furniture_customer_payments WHERE sale_id=$1 AND company_id=$2',
    [saleId, companyId]
  )).rows[0].paid;
  const status = statusFor(sale, sum);
  await client.query(
    'UPDATE furniture_sales SET paid=$1, status=$2 WHERE id=$3 AND company_id=$4',
    [round2(sum), status, saleId, companyId]
  );
  return { paid: round2(sum), status };
}

/**
 * Record a payment on the CALLER's transaction.
 *
 * Takes a client rather than a pool for the same reason `syncPaid` does: a
 * deposit taken with an invoice belongs in the invoice's transaction. Recording
 * it afterwards on its own connection means the invoice can be saved while the
 * deposit is not — and the showroom is shown one success for two writes.
 */
async function recordPayment(client, companyId, { saleId, customerId, amount, payDate, method, note }) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error('amount must be positive');

  // A payment against a cancelled invoice would credit an order that is not
  // happening; take it on the customer's account instead, deliberately.
  if (saleId) {
    const s = (await client.query(
      'SELECT status, customer_id FROM furniture_sales WHERE id=$1 AND company_id=$2', [saleId, companyId]
    )).rows[0];
    if (!s) throw new Error('invoice not found');
    if (s.status === 'cancelled') throw new Error('invoice is cancelled');
    // Keep the payment attached to whoever the invoice belongs to, so a
    // statement can never miss a payment because the form sent no customer.
    if (!customerId) customerId = s.customer_id;
  }

  await client.query(
    `INSERT INTO furniture_customer_payments
       (company_id, sale_id, customer_id, amount, pay_date, method, note)
     VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,$7)`,
    [companyId, saleId || null, customerId || null, amt, payDate || null,
      ['cash', 'card', 'transfer'].includes(method) ? method : 'cash',
      note || null]
  );
  if (saleId) await syncPaid(client, companyId, saleId);
  return { amount: amt };
}

/** The same payment, on its own transaction, for callers who have no other
 *  write to keep it with. */
async function addPayment(pool, companyId, payment) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await recordPayment(client, companyId, payment);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * What each customer owes.
 *
 * Cancelled invoices are excluded from what was billed but their payments are
 * NOT excluded — money actually handed over stays on the account as credit
 * rather than vanishing because the order was later called off.
 *
 * Returns enter as `credited` (what the customer earned back) minus `refunded`
 * (what was handed to them in cash), and that net is subtracted. Note this runs
 * regardless of the returns feature toggle: a flag hides a page, it must never
 * quietly rewrite balances that existing documents already justify.
 *
 * Delivery fees are charged on top. A trip costs money the invoice never
 * mentioned, so the unpaid part of every fee is added to what the customer
 * owes — otherwise a showroom on prepaid terms reads "settled" while the van
 * fare is still outstanding, and dispatches on the strength of it.
 */
async function customerBalances(pool, companyId) {
  const r = await pool.query(
    `SELECT c.id, c.name, c.phone,
            COALESCE(inv.total, 0) AS invoiced,
            COALESCE(pay.total, 0) AS paid,
            COALESCE(ret.credited, 0) AS credited,
            COALESCE(ret.refunded, 0) AS refunded,
            COALESCE(dlv.fees_due, 0) AS fees_due,
            COALESCE(inv.total, 0) - COALESCE(pay.total, 0)
              - COALESCE(ret.credited, 0) + COALESCE(ret.refunded, 0)
              + COALESCE(dlv.fees_due, 0) AS balance
       FROM furniture_customers c
       LEFT JOIN (
         SELECT customer_id, SUM(total) AS total FROM furniture_sales
          WHERE company_id=$1 AND status <> 'cancelled' GROUP BY customer_id
       ) inv ON inv.customer_id = c.id
       LEFT JOIN (
         SELECT customer_id, SUM(amount) AS total FROM furniture_customer_payments
          WHERE company_id=$1 GROUP BY customer_id
       ) pay ON pay.customer_id = c.id
       LEFT JOIN (
         SELECT customer_id, SUM(total) AS credited, SUM(refunded) AS refunded
           FROM furniture_returns WHERE company_id=$1 GROUP BY customer_id
       ) ret ON ret.customer_id = c.id
       LEFT JOIN (
         SELECT customer_id, SUM(fee - fee_paid) AS fees_due FROM furniture_deliveries
          WHERE company_id=$1 AND fee > fee_paid GROUP BY customer_id
       ) dlv ON dlv.customer_id = c.id
      WHERE c.company_id=$1 AND c.is_active
        AND (inv.total IS NOT NULL OR pay.total IS NOT NULL
             OR ret.credited IS NOT NULL OR dlv.fees_due IS NOT NULL)
      ORDER BY balance DESC, c.name`,
    [companyId]
  );
  return r.rows;
}

/**
 * What customers actually owe, by the same arithmetic the statement uses.
 *
 * The dashboard card computed `SUM(total - paid) FROM furniture_sales WHERE
 * status='open'` — three differences from the statement, all of them in the
 * showroom's favour on paper:
 *
 *   · returns were not deducted, so credit already given back was still being
 *     chased;
 *   · unpaid delivery fees were not added, so real money owed was missing;
 *   · only 'open' invoices counted, so an invoice marked paid that later had a
 *     payment reversed vanished from the total.
 *
 * Two numbers for one question is worse than either of them alone: the owner
 * opens the statement to chase a customer and it disagrees with the figure that
 * made him open it. So this reuses the statement's own expression, and the
 * dashboard asks THIS.
 *
 * Only positive balances are summed. A customer in credit is not a negative
 * receivable — netting them off would quietly reduce what other customers owe.
 */
async function receivablesTotal(pool, companyId, branch = null) {
  const B = require('./branches');
  const p = [companyId];
  /* Branch scoping matches the reports: rows that carry branch_id filter on it,
     payments reach theirs through the invoice. */
  const invScope = B.sqlFor(branch, p, 's.branch_id');
  const payScope = branch == null ? '' : (branch === 'none'
    ? " AND EXISTS (SELECT 1 FROM furniture_sales ps WHERE ps.id = pm.sale_id AND ps.branch_id IS NULL)"
    : ` AND EXISTS (SELECT 1 FROM furniture_sales ps WHERE ps.id = pm.sale_id AND ps.branch_id = $${p.push(branch)})`);
  const retScope = branch == null ? '' : (branch === 'none'
    ? " AND EXISTS (SELECT 1 FROM furniture_sales rs WHERE rs.id = r.sale_id AND rs.branch_id IS NULL)"
    : ` AND EXISTS (SELECT 1 FROM furniture_sales rs WHERE rs.id = r.sale_id AND rs.branch_id = $${p.push(branch)})`);
  const dlvScope = B.sqlFor(branch, p, 'd.branch_id');

  const r = await pool.query(
    `SELECT COALESCE(SUM(GREATEST(bal, 0)), 0) AS v FROM (
       SELECT c.id,
              COALESCE(inv.total,0) - COALESCE(pay.total,0)
                - COALESCE(ret.credited,0) + COALESCE(ret.refunded,0)
                + COALESCE(dlv.fees_due,0) AS bal
         FROM furniture_customers c
         LEFT JOIN (SELECT s.customer_id, SUM(s.total) AS total FROM furniture_sales s
                     WHERE s.company_id=$1 AND s.status <> 'cancelled'${invScope}
                     GROUP BY s.customer_id) inv ON inv.customer_id = c.id
         LEFT JOIN (SELECT pm.customer_id, SUM(pm.amount) AS total FROM furniture_customer_payments pm
                     WHERE pm.company_id=$1${payScope}
                     GROUP BY pm.customer_id) pay ON pay.customer_id = c.id
         LEFT JOIN (SELECT r.customer_id, SUM(r.total) AS credited, SUM(r.refunded) AS refunded
                      FROM furniture_returns r WHERE r.company_id=$1${retScope}
                     GROUP BY r.customer_id) ret ON ret.customer_id = c.id
         LEFT JOIN (SELECT d.customer_id, SUM(d.fee - d.fee_paid) AS fees_due FROM furniture_deliveries d
                     WHERE d.company_id=$1 AND d.fee > d.fee_paid${dlvScope}
                     GROUP BY d.customer_id) dlv ON dlv.customer_id = c.id
        WHERE c.company_id=$1 AND c.is_active
     ) t`, p);
  return round2(r.rows[0].v);
}

/** One customer's invoices and payments, for the statement page. */
async function statement(pool, companyId, customerId) {
  const [customer, invoices, payments, returns, fees] = await Promise.all([
    pool.query('SELECT * FROM furniture_customers WHERE id=$1 AND company_id=$2', [customerId, companyId]),
    pool.query(
      `SELECT id, sale_date, subtotal, tax, total, paid, status
         FROM furniture_sales WHERE company_id=$1 AND customer_id=$2
        ORDER BY sale_date DESC, id DESC LIMIT 200`, [companyId, customerId]),
    pool.query(
      `SELECT id, sale_id, amount, pay_date, method, note
         FROM furniture_customer_payments WHERE company_id=$1 AND customer_id=$2
        ORDER BY pay_date DESC, id DESC LIMIT 200`, [companyId, customerId]),
    pool.query(
      `SELECT id, sale_id, return_date, total, refunded, reason
         FROM furniture_returns WHERE company_id=$1 AND customer_id=$2
        ORDER BY return_date DESC, id DESC LIMIT 200`, [companyId, customerId]),
    pool.query(
      `SELECT COALESCE(SUM(fee),0)::float AS fees, COALESCE(SUM(fee_paid),0)::float AS fees_paid
         FROM furniture_deliveries WHERE company_id=$1 AND customer_id=$2`, [companyId, customerId]),
  ]);
  const invoiced = invoices.rows
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + Number(i.total), 0);
  const paid = payments.rows.reduce((s, p) => s + Number(p.amount), 0);
  const credited = returns.rows.reduce((s, r) => s + Number(r.total), 0);
  const refunded = returns.rows.reduce((s, r) => s + Number(r.refunded), 0);
  return {
    customer: customer.rows[0] || null,
    invoices: invoices.rows,
    payments: payments.rows,
    returns: returns.rows,
    totals: {
      invoiced: round2(invoiced), paid: round2(paid),
      credited: round2(credited), refunded: round2(refunded),
      fees: round2(fees.rows[0].fees), feesPaid: round2(fees.rows[0].fees_paid),
      balance: round2(invoiced - paid - credited + refunded
        + (fees.rows[0].fees - fees.rows[0].fees_paid)),
    },
  };
}

module.exports = { round2, invoiceTotals, dueOf, statusFor, syncPaid, recordPayment, addPayment, customerBalances, receivablesTotal, statement };
