// Warranty — the promise, and when it starts running.
//
// The one decision this module exists for: a guarantee starts on the day the
// piece is DELIVERED, not the day it was invoiced. A wardrobe that sat in the
// workshop for six weeks has not been in use for six weeks, and dating its
// guarantee from the invoice quietly takes that time off the customer. So
// starts_on is NULL until a delivery for that sale is marked done.
//
// The months are COPIED onto the row at the time of sale. The product's
// warranty may be changed next year; this customer was promised the figure
// printed on their invoice, and that is what has to be honoured.
'use strict';

const DAY = 86400000;

const asDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);

/** Add whole months, clamping the day so 31 Jan + 1 month is 28/29 Feb. */
function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/**
 * The state of one warranty row.
 *  not_started — sold but not delivered yet; the clock has not begun
 *  none        — sold with no guarantee at all, which is a fact, not a gap
 *  active | expiring | expired
 */
function statusOf(row, todayIso) {
  const months = parseInt(row.months, 10) || 0;
  if (!months) return { state: 'none', expiresOn: null, daysLeft: null };
  const start = asDate(row.starts_on);
  if (!start) return { state: 'not_started', expiresOn: null, daysLeft: null };
  const end = addMonths(start, months);
  const now = asDate(todayIso) || new Date();
  const daysLeft = Math.floor((end.getTime() - now.getTime()) / DAY);
  let state = 'active';
  if (daysLeft < 0) state = 'expired';
  // 30 days is the window in which a workshop can still act: call the customer,
  // book a check-up, sell an extension. A warning that arrives on the day it
  // expires is not a warning.
  else if (daysLeft <= 30) state = 'expiring';
  return { state, expiresOn: iso(end), daysLeft };
}

/**
 * Create the warranty rows for a new invoice, inside the caller's transaction.
 * Only products that actually carry a guarantee get a row — a zero-month row
 * would fill the page with promises nobody made.
 */
async function createForSale(client, companyId, saleId, customerId, lines) {
  const ids = [...new Set(lines.map((l) => l.product_id).filter(Boolean))];
  if (!ids.length) return 0;
  const products = (await client.query(
    'SELECT id, name, warranty_months FROM furniture_products WHERE company_id=$1 AND id = ANY($2::int[])',
    [companyId, ids])).rows;
  const byId = new Map(products.map((p) => [p.id, p]));
  let made = 0;
  for (const l of lines) {
    const p = byId.get(l.product_id);
    const months = p ? parseInt(p.warranty_months, 10) || 0 : 0;
    if (!months) continue;
    await client.query(
      `INSERT INTO furniture_warranties
         (company_id, sale_id, customer_id, product_id, months, product_name, qty)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, saleId, customerId || null, l.product_id, months, p.name, l.qty]);
    made += 1;
  }
  return made;
}

/**
 * Start the clock on everything sold under one invoice.
 * Only rows that have not started already — a second delivery against the same
 * invoice must not reset a guarantee that has been running since the first.
 */
async function startForSale(pool, companyId, saleId, onDate) {
  if (!saleId) return 0;
  const r = await pool.query(
    `UPDATE furniture_warranties SET starts_on = COALESCE($1, CURRENT_DATE)
      WHERE company_id=$2 AND sale_id=$3 AND starts_on IS NULL
      RETURNING id`, [onDate || null, companyId, saleId]);
  return r.rowCount;
}

const SELECT = `
  SELECT w.*, c.name AS customer_name, s.sale_date
    FROM furniture_warranties w
    LEFT JOIN furniture_customers c ON c.id = w.customer_id
    LEFT JOIN furniture_sales s ON s.id = w.sale_id
`;

/** All warranties, decorated with their state, newest sale first. */
async function list(pool, companyId, view, todayIso) {
  const r = await pool.query(
    `${SELECT} WHERE w.company_id=$1 ORDER BY w.starts_on DESC NULLS FIRST, w.id DESC LIMIT 500`,
    [companyId]);
  const rows = r.rows.map((row) => ({ ...row, ...statusOf(row, todayIso) }));
  const tally = rows.reduce((acc, x) => { acc[x.state] = (acc[x.state] || 0) + 1; return acc; }, {});
  const shown = view && view !== 'all' ? rows.filter((x) => x.state === view) : rows;
  return { rows: shown, tally, total: rows.length };
}

/** Warranties on one invoice, for the invoice page. */
async function forSale(pool, companyId, saleId, todayIso) {
  const r = await pool.query(
    `${SELECT} WHERE w.company_id=$1 AND w.sale_id=$2 ORDER BY w.id`, [companyId, saleId]);
  return r.rows.map((row) => ({ ...row, ...statusOf(row, todayIso) }));
}

module.exports = { addMonths, statusOf, createForSale, startForSale, list, forSale };
