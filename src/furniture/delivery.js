// Delivery and installation — the promises a workshop makes with a date on them.
//
// This is deliberately NOT part of the invoice. The two have different lives:
// a bedroom can be paid in full weeks before it is fitted, and a delivery can
// be moved three times without a single figure changing. Bolting a "delivered"
// flag onto furniture_sales would have made the second case unrecordable.
//
// A job is never deleted once it has happened. A trip that failed — nobody
// home, the lift too small, the wrong piece on the van — is the single most
// useful row in this table, because it is the one the workshop pays for twice.
'use strict';

const KINDS = ['delivery', 'install'];
const SLOTS = ['morning', 'afternoon', 'evening'];
const STATUSES = ['scheduled', 'out', 'done', 'failed'];

// Still owed to somebody. `failed` counts as open: a trip that did not happen
// is work the workshop still has to do, and dropping it off the board is how
// a customer ends up waiting for a van nobody rebooked.
const OPEN = ['scheduled', 'out', 'failed'];

const oneOf = (list, v, fallback) => (list.includes(String(v)) ? String(v) : fallback);
const today = () => new Date().toISOString().slice(0, 10);

/** Late means: still open, and its date has passed. */
function isLate(job, ref) {
  if (!OPEN.includes(job.status)) return false;
  return String(job.scheduled_date).slice(0, 10) < (ref || today());
}

/**
 * Book a job. The customer's address and phone are COPIED onto it rather than
 * joined at read time — see the schema note.
 */
async function schedule(pool, companyId, o) {
  const saleId = parseInt(o.saleId, 10) || null;
  let customerId = parseInt(o.customerId, 10) || null;
  let address = String(o.address || '').trim().slice(0, 300) || null;
  let phone = String(o.phone || '').trim().slice(0, 30) || null;

  if (saleId && !customerId) {
    const s = (await pool.query(
      'SELECT customer_id FROM furniture_sales WHERE id=$1 AND company_id=$2', [saleId, companyId])).rows[0];
    if (!s) throw new Error('invoice_not_found');
    customerId = s.customer_id;
  }
  // Prefill from the customer's file only when the form left it blank, so a
  // one-off "deliver to my mother's flat" is never overwritten.
  if (customerId && (!address || !phone)) {
    const c = (await pool.query(
      'SELECT address, phone FROM furniture_customers WHERE id=$1 AND company_id=$2',
      [customerId, companyId])).rows[0];
    if (c) { address = address || c.address; phone = phone || c.phone; }
  }
  if (!customerId && !saleId) throw new Error('no_customer');

  const r = await pool.query(
    `INSERT INTO furniture_deliveries
       (company_id, sale_id, customer_id, kind, scheduled_date, slot, status, crew, address, phone, note)
     VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,'scheduled',$7,$8,$9,$10) RETURNING id`,
    [companyId, saleId, customerId, oneOf(KINDS, o.kind, 'delivery'), o.scheduledDate || null,
      o.slot ? oneOf(SLOTS, o.slot, null) : null,
      String(o.crew || '').trim().slice(0, 120) || null,
      address, phone, String(o.note || '').trim().slice(0, 300) || null]);
  return r.rows[0];
}

/**
 * Move a job along. `done_at` is stamped when it lands on done and cleared if
 * it is reopened, so "when was this actually delivered" always has one answer.
 */
async function setStatus(pool, companyId, id, status, note) {
  const st = oneOf(STATUSES, status, null);
  if (!st) throw new Error('bad_status');
  const r = await pool.query(
    `UPDATE furniture_deliveries
        SET status=$1,
            done_at = CASE WHEN $1='done' THEN COALESCE(done_at, now()) ELSE NULL END,
            note = COALESCE(NULLIF($2,''), note)
      WHERE id=$3 AND company_id=$4 RETURNING id, status`,
    [st, String(note || '').trim().slice(0, 300), id, companyId]);
  if (!r.rows[0]) throw new Error('not_found');
  return r.rows[0];
}

/** Push a job to another date. Reopens it — a rebooked trip is not done. */
async function reschedule(pool, companyId, id, newDate, slot) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(newDate || ''))) throw new Error('bad_date');
  const r = await pool.query(
    `UPDATE furniture_deliveries
        SET scheduled_date=$1, slot=COALESCE($2, slot), status='scheduled', done_at=NULL
      WHERE id=$3 AND company_id=$4 RETURNING id`,
    [newDate, slot ? oneOf(SLOTS, slot, null) : null, id, companyId]);
  if (!r.rows[0]) throw new Error('not_found');
  return r.rows[0];
}

const SELECT = `
  SELECT d.*, c.name AS customer_name, s.total AS sale_total, s.paid AS sale_paid
    FROM furniture_deliveries d
    LEFT JOIN furniture_customers c ON c.id = d.customer_id
    LEFT JOIN furniture_sales s ON s.id = d.sale_id
`;

/**
 * The board. `view` is one of open | today | late | done — the four questions
 * a workshop actually asks, rather than a free-form filter nobody fills in.
 */
async function board(pool, companyId, view) {
  const day = today();
  const params = [companyId];
  let where = 'd.company_id=$1';
  if (view === 'today') where += ` AND d.scheduled_date = $${params.push(day)} AND d.status <> 'done'`;
  else if (view === 'late') where += ` AND d.scheduled_date < $${params.push(day)} AND d.status <> 'done'`;
  else if (view === 'done') where += " AND d.status = 'done'";
  else where += " AND d.status <> 'done'";
  const order = view === 'done'
    ? 'ORDER BY d.done_at DESC NULLS LAST, d.id DESC'
    : 'ORDER BY d.scheduled_date, d.id';
  const r = await pool.query(`${SELECT} WHERE ${where} ${order} LIMIT 300`, params);
  return r.rows;
}

/** Counts for the tabs and the dashboard card. */
async function counts(pool, companyId) {
  const day = today();
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'done')::int AS open,
       COUNT(*) FILTER (WHERE status <> 'done' AND scheduled_date = $2)::int AS today,
       COUNT(*) FILTER (WHERE status <> 'done' AND scheduled_date < $2)::int AS late
     FROM furniture_deliveries WHERE company_id=$1`, [companyId, day]);
  return r.rows[0];
}

/** Jobs attached to one invoice, for the invoice page. */
async function forSale(pool, companyId, saleId) {
  const r = await pool.query(
    `${SELECT} WHERE d.company_id=$1 AND d.sale_id=$2 ORDER BY d.scheduled_date, d.id`,
    [companyId, saleId]);
  return r.rows;
}

module.exports = { KINDS, SLOTS, STATUSES, OPEN, isLate, today, schedule, setStatus, reschedule, board, counts, forSale };
