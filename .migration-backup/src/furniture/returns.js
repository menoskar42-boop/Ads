// Sales returns — credit notes, not undone invoices.
//
// The temptation with a return is to edit the invoice down, or delete a line.
// Both destroy the record of a sale that genuinely happened: the customer paid,
// the piece left the showroom, and weeks later it came back. A statement that
// cannot show that sequence cannot be argued from.
//
// So a return is its own document with its own date, and the customer's balance
// is arithmetic over three ledgers rather than a number anyone edits:
//
//     balance = invoiced − payments − returns.total + returns.refunded
//
// The two return columns are separate on purpose. `total` is the credit the
// customer earns the moment the piece is accepted back; `refunded` is cash
// actually handed over, which cancels that credit. They are usually days apart,
// and a workshop needs to see which of the two has happened.
//
// Nothing here touches stock: furniture_products carries no quantity — only
// materials do — so a returned piece changes money, not inventory.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Line arithmetic. No tax: the credit mirrors what was actually charged. */
function returnTotal(lines) {
  return round2((lines || []).reduce((s, l) => s + Number(l.qty) * Number(l.unit_price), 0));
}

/** Cash still owed back to the customer on one return. Never negative. */
function outstandingRefund(ret) {
  return Math.max(0, round2(Number(ret.total) - Number(ret.refunded)));
}

/**
 * How much of each line of a sale may still be returned.
 * Returns a Map product_id → qty. A showroom that has already taken back two
 * of three chairs must not be able to take back three more, and the check has
 * to read the returns table rather than trust the form.
 */
async function returnableQty(client, companyId, saleId) {
  const sold = await client.query(
    `SELECT product_id, SUM(qty) AS qty, MAX(unit_price) AS unit_price
       FROM furniture_sale_items WHERE sale_id=$1 AND company_id=$2
      GROUP BY product_id`, [saleId, companyId]);
  const back = await client.query(
    `SELECT ri.product_id, SUM(ri.qty) AS qty
       FROM furniture_return_items ri
       JOIN furniture_returns r ON r.id = ri.return_id
      WHERE r.sale_id=$1 AND ri.company_id=$2
      GROUP BY ri.product_id`, [saleId, companyId]);
  const taken = new Map(back.rows.map((r) => [r.product_id, Number(r.qty)]));
  const out = new Map();
  for (const s of sold.rows) {
    out.set(s.product_id, {
      qty: round2(Number(s.qty) - (taken.get(s.product_id) || 0)),
      unit_price: Number(s.unit_price),
    });
  }
  return out;
}

/**
 * Record a return. `refundNow` is optional — accepting the piece back and
 * paying for it are allowed to be two separate decisions.
 */
async function createReturn(pool, companyId, opts) {
  const { saleId, returnDate, reason, note, refundNow, lines } = opts;
  const clean = (lines || [])
    .map((l) => ({
      product_id: parseInt(l.product_id, 10) || null,
      qty: Number(l.qty) > 0 ? Number(l.qty) : 0,
      unit_price: Number(l.unit_price) >= 0 ? Number(l.unit_price) : 0,
    }))
    .filter((l) => l.qty > 0);
  if (!clean.length) throw new Error('no_lines');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let customerId = parseInt(opts.customerId, 10) || null;
    if (saleId) {
      const sale = (await client.query(
        'SELECT id, customer_id, status FROM furniture_sales WHERE id=$1 AND company_id=$2 FOR UPDATE',
        [saleId, companyId])).rows[0];
      if (!sale) throw new Error('invoice_not_found');
      // A cancelled invoice never delivered anything, so there is nothing to
      // hand back — whatever came through the door belongs to another sale.
      if (sale.status === 'cancelled') throw new Error('invoice_cancelled');
      if (!customerId) customerId = sale.customer_id;

      const allowed = await returnableQty(client, companyId, saleId);
      for (const l of clean) {
        const a = allowed.get(l.product_id);
        if (!a) throw new Error('not_on_invoice');
        if (l.qty > a.qty + 0.0005) throw new Error('over_return');
        // Price the credit at what was actually charged, not at today's list
        // price: a piece sold at a discount is not refunded at full value.
        l.unit_price = a.unit_price;
      }
    }

    const total = returnTotal(clean);
    const refund = Math.min(round2(refundNow), total);
    const ret = (await client.query(
      `INSERT INTO furniture_returns
         (company_id, sale_id, customer_id, return_date, total, refunded, reason, note)
       VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7,$8) RETURNING id`,
      [companyId, saleId || null, customerId, returnDate || null, total,
        refund > 0 ? refund : 0,
        String(reason || '').trim().slice(0, 120) || null,
        String(note || '').trim().slice(0, 300) || null]
    )).rows[0];

    for (const l of clean) {
      await client.query(
        `INSERT INTO furniture_return_items (company_id, return_id, product_id, qty, unit_price, total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [companyId, ret.id, l.product_id, l.qty, l.unit_price, round2(l.qty * l.unit_price)]);
    }

    await client.query('COMMIT');
    return { id: ret.id, total, refunded: refund > 0 ? refund : 0 };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

/**
 * Hand cash back later. Capped at the credit outstanding, because refunding
 * more than was credited is not a refund — it is a payment to the customer,
 * and the system should not let one be entered as the other by accident.
 */
async function addRefund(pool, companyId, returnId, amount) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error('amount');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = (await client.query(
      'SELECT id, total, refunded FROM furniture_returns WHERE id=$1 AND company_id=$2 FOR UPDATE',
      [returnId, companyId])).rows[0];
    if (!r) throw new Error('not_found');
    const room = outstandingRefund(r);
    if (room <= 0) throw new Error('already_refunded');
    const add = Math.min(amt, room);
    await client.query('UPDATE furniture_returns SET refunded = refunded + $1 WHERE id=$2 AND company_id=$3',
      [add, returnId, companyId]);
    await client.query('COMMIT');
    return { added: add };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

/** Returns list for the page, newest first. */
async function listReturns(pool, companyId, limit = 200) {
  const r = await pool.query(
    `SELECT r.*, c.name AS customer_name,
            (SELECT COUNT(*)::int FROM furniture_return_items i WHERE i.return_id = r.id) AS line_count
       FROM furniture_returns r
       LEFT JOIN furniture_customers c ON c.id = r.customer_id
      WHERE r.company_id=$1 ORDER BY r.return_date DESC, r.id DESC LIMIT $2`,
    [companyId, limit]);
  return r.rows;
}

/** One return with its lines. */
async function getReturn(pool, companyId, id) {
  const ret = (await pool.query(
    `SELECT r.*, c.name AS customer_name, c.phone AS customer_phone
       FROM furniture_returns r LEFT JOIN furniture_customers c ON c.id = r.customer_id
      WHERE r.id=$1 AND r.company_id=$2`, [id, companyId])).rows[0];
  if (!ret) return null;
  const items = await pool.query(
    `SELECT i.*, p.name AS product_name FROM furniture_return_items i
       LEFT JOIN furniture_products p ON p.id = i.product_id
      WHERE i.return_id=$1 AND i.company_id=$2 ORDER BY i.id`, [id, companyId]);
  return { ret, items: items.rows, outstanding: outstandingRefund(ret) };
}

/** Totals over a period, for the reports page. */
async function periodReturns(pool, companyId, from, to) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(total),0)::float AS total, COALESCE(SUM(refunded),0)::float AS refunded
       FROM furniture_returns WHERE company_id=$1 AND return_date BETWEEN $2 AND $3`,
    [companyId, from, to]);
  return { total: round2(r.rows[0].total), refunded: round2(r.rows[0].refunded) };
}

module.exports = {
  round2, returnTotal, outstandingRefund, returnableQty,
  createReturn, addRefund, listReturns, getReturn, periodReturns,
};
