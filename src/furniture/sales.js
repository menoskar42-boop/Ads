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

/** Record a payment and bring the invoice it belongs to back in step. */
async function addPayment(pool, companyId, { saleId, customerId, amount, payDate, method, note }) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error('amount must be positive');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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

    await client.query('COMMIT');
    return { amount: amt };
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
 */
async function customerBalances(pool, companyId) {
  const r = await pool.query(
    `SELECT c.id, c.name, c.phone,
            COALESCE(inv.total, 0) AS invoiced,
            COALESCE(pay.total, 0) AS paid,
            COALESCE(inv.total, 0) - COALESCE(pay.total, 0) AS balance
       FROM furniture_customers c
       LEFT JOIN (
         SELECT customer_id, SUM(total) AS total FROM furniture_sales
          WHERE company_id=$1 AND status <> 'cancelled' GROUP BY customer_id
       ) inv ON inv.customer_id = c.id
       LEFT JOIN (
         SELECT customer_id, SUM(amount) AS total FROM furniture_customer_payments
          WHERE company_id=$1 GROUP BY customer_id
       ) pay ON pay.customer_id = c.id
      WHERE c.company_id=$1 AND c.is_active
        AND (inv.total IS NOT NULL OR pay.total IS NOT NULL)
      ORDER BY balance DESC, c.name`,
    [companyId]
  );
  return r.rows;
}

/** One customer's invoices and payments, for the statement page. */
async function statement(pool, companyId, customerId) {
  const [customer, invoices, payments] = await Promise.all([
    pool.query('SELECT * FROM furniture_customers WHERE id=$1 AND company_id=$2', [customerId, companyId]),
    pool.query(
      `SELECT id, sale_date, subtotal, tax, total, paid, status
         FROM furniture_sales WHERE company_id=$1 AND customer_id=$2
        ORDER BY sale_date DESC, id DESC LIMIT 200`, [companyId, customerId]),
    pool.query(
      `SELECT id, sale_id, amount, pay_date, method, note
         FROM furniture_customer_payments WHERE company_id=$1 AND customer_id=$2
        ORDER BY pay_date DESC, id DESC LIMIT 200`, [companyId, customerId]),
  ]);
  const invoiced = invoices.rows
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + Number(i.total), 0);
  const paid = payments.rows.reduce((s, p) => s + Number(p.amount), 0);
  return {
    customer: customer.rows[0] || null,
    invoices: invoices.rows,
    payments: payments.rows,
    totals: { invoiced: round2(invoiced), paid: round2(paid), balance: round2(invoiced - paid) },
  };
}

module.exports = { round2, invoiceTotals, dueOf, statusFor, syncPaid, addPayment, customerBalances, statement };
