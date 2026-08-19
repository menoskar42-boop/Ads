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

const T = require('./tracking');

const KINDS = ['delivery', 'install'];
const SLOTS = ['morning', 'afternoon', 'evening'];
const STATUSES = ['scheduled', 'out', 'done', 'failed'];

// Still owed to somebody. `failed` counts as open: a trip that did not happen
// is work the workshop still has to do, and dropping it off the board is how
// a customer ends up waiting for a van nobody rebooked.
const OPEN = ['scheduled', 'out', 'failed'];

// How the showroom sells. 'prepaid': nothing leaves the workshop until the
// invoice and the trip fee are both settled. 'cod': the crew collects at the
// door. The default is prepaid — while the piece is still in the building the
// showroom has leverage, and after it is on the van it has none.
const POLICIES = ['prepaid', 'cod'];

const oneOf = (list, v, fallback) => (list.includes(String(v)) ? String(v) : fallback);
const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * What is still to be collected before, or at, this trip.
 *
 * Two separate debts that a showroom keeps confusing for each other:
 *  - the invoice balance, which belongs to the SALE and is shared by every
 *    trip against it;
 *  - the trip fee, which belongs to THIS job and is charged again for the
 *    second visit.
 *
 * They are returned apart, and only summed for display, because a second
 * delivery on a fully-paid invoice still owes a fee, and adding them earlier
 * would make that read as an unpaid invoice.
 */
function moneyOf(job) {
  const invoiceDue = job.sale_total == null
    ? 0 : Math.max(0, round2(Number(job.sale_total) - Number(job.sale_paid)));
  const feeDue = Math.max(0, round2(Number(job.fee || 0) - Number(job.fee_paid || 0)));
  return { invoiceDue, feeDue, total: round2(invoiceDue + feeDue) };
}

/**
 * May this job go out?
 * Under 'cod' always — the money is collected at the door by design. Under
 * 'prepaid' only once nothing is outstanding. Returns the reason rather than
 * a bare false, because "you cannot dispatch this" without a figure is an
 * instruction to work around the system.
 */
function dispatchCheck(job, policy) {
  const m = moneyOf(job);
  if (oneOf(POLICIES, policy, 'prepaid') === 'cod') return { ok: true, ...m };
  return { ok: m.total <= 0, ...m };
}

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

  /* branch_id was never written, and the delivery board filters on it.
   *
   * So booking a trip while looking at one showroom produced a row with
   * branch_id NULL, which the branch-filtered board then did not show. The
   * appointment did not fail — it VANISHED, which is the worse of the two: a
   * failure gets rebooked, a disappearance gets discovered by a customer
   * waiting at home for a van nobody dispatched.
   *
   * The branch comes from the same place every other furniture write takes it:
   * the active filter when the form does not name one. */
  const r = await pool.query(
    `INSERT INTO furniture_deliveries
       (company_id, sale_id, customer_id, kind, scheduled_date, slot, status, crew, address, phone, note, fee, branch_id)
     VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6,'scheduled',$7,$8,$9,$10,$11,$12) RETURNING id`,
    [companyId, saleId, customerId, oneOf(KINDS, o.kind, 'delivery'), o.scheduledDate || null,
      o.slot ? oneOf(SLOTS, o.slot, null) : null,
      String(o.crew || '').trim().slice(0, 120) || null,
      address, phone, String(o.note || '').trim().slice(0, 300) || null,
      Math.max(0, round2(o.fee)),
      require('./branches').idToStamp(o.branch, o.branchId, o.branches || [])]);
  return r.rows[0];
}

/**
 * Collect the trip fee. Capped at what is outstanding on THIS trip: paying
 * more than the fee is not a fee payment, it is money on the customer's
 * account, and it has to go through the invoice ledger to be found again.
 */
async function collectFee(pool, companyId, id, amount) {
  const amt = round2(amount);
  if (!(amt > 0)) throw new Error('amount');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const j = (await client.query(
      'SELECT fee, fee_paid FROM furniture_deliveries WHERE id=$1 AND company_id=$2 FOR UPDATE',
      [id, companyId])).rows[0];
    if (!j) throw new Error('not_found');
    const room = Math.max(0, round2(Number(j.fee) - Number(j.fee_paid)));
    if (room <= 0) throw new Error('nothing_due');
    const add = Math.min(amt, room);
    await client.query(
      'UPDATE furniture_deliveries SET fee_paid = fee_paid + $1 WHERE id=$2 AND company_id=$3',
      [add, id, companyId]);
    await client.query('COMMIT');
    return { added: add };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

/** The showroom's dispatch policy. Never throws — a missing settings row is a
 *  new showroom, and a new showroom gets the safe default. */
async function policyOf(pool, companyId) {
  try {
    const r = await pool.query('SELECT delivery_policy FROM furniture_settings WHERE company_id=$1', [companyId]);
    return oneOf(POLICIES, r.rows[0] && r.rows[0].delivery_policy, 'prepaid');
  } catch (e) { return 'prepaid'; }
}

/**
 * Move a job along. `done_at` is stamped when it lands on done and cleared if
 * it is reopened, so "when was this actually delivered" always has one answer.
 */
async function setStatus(pool, companyId, id, status, note, opts = {}) {
  const st = oneOf(STATUSES, status, null);
  if (!st) throw new Error('bad_status');

  // The gate. Only 'out' and 'done' are blocked: marking a trip FAILED must
  // always be possible, or a van that came back with the piece still on it has
  // nowhere to be recorded.
  if ((st === 'out' || st === 'done') && !opts.override) {
    const job = (await pool.query(
      `SELECT d.fee, d.fee_paid, s.total AS sale_total, s.paid AS sale_paid
         FROM furniture_deliveries d
         LEFT JOIN furniture_sales s ON s.id = d.sale_id
        WHERE d.id=$1 AND d.company_id=$2`, [id, companyId])).rows[0];
    if (!job) throw new Error('not_found');
    const check = dispatchCheck(job, opts.policy || await policyOf(pool, companyId));
    if (!check.ok) { const e = new Error('unpaid'); e.money = check; throw e; }
  }

  const r = await pool.query(
    `UPDATE furniture_deliveries
        SET status=$1,
            done_at = CASE WHEN $1='done' THEN COALESCE(done_at, now()) ELSE NULL END,
            note = COALESCE(NULLIF($2,''), note)
      WHERE id=$3 AND company_id=$4 RETURNING id, status, sale_id`,
    [st, String(note || '').trim().slice(0, 300), id, companyId]);
  if (!r.rows[0]) throw new Error('not_found');
  return r.rows[0];
}

/**
 * تسليم بتأكيد — البند ٨٦.
 *
 * الرحلة مابتتقفلش على «تم» مجرّدة. فيه طريقتين، والاتنين متسجّلين باسمهم:
 *
 *   'code'     — العميل قرا الكود اللي على صفحته للطاقم. الكود بيتقارن **جوّه
 *                جملة التحديث نفسها** مع شرط إن الاستلام لسه مااتأكدش، فكود
 *                غلط مابيقفلش الرحلة وكود صح مابيتستعملش مرتين.
 *   'declared' — الطاقم سلّم والعميل مش موجود/مش قادر يقرا الكود. مسموح،
 *                بس متكتوب إنه إقرار من الورشة — الشاشة والعميل الاتنين
 *                بيشوفوا الفرق. الادعاء إن العميل أكّد وهو ما أكّدش أسوأ من
 *                إننا نقول الحقيقة.
 *
 * بيرجع { ok, why } — و`why` من قاموس السيرفر مش من الرابط.
 */
async function deliverWithReceipt(pool, companyId, id, opts = {}) {
  const declared = opts.method === 'declared';
  const code = T.normalizeCode(opts.code);
  if (!declared && !T.CODE_RE.test(code)) return { ok: false, why: 'bad_code' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // نفس بوابة الفلوس بتاعة الإرسال: مايخرجش من الورشة قبل ما يتحاسب، إلا
    // بتجاوز صريح متسجّل.
    if (!opts.override) {
      const job = (await client.query(
        `SELECT d.fee, d.fee_paid, s.total AS sale_total, s.paid AS sale_paid
           FROM furniture_deliveries d
           LEFT JOIN furniture_sales s ON s.id = d.sale_id
          WHERE d.id=$1 AND d.company_id=$2`, [id, companyId])).rows[0];
      if (!job) { await client.query('ROLLBACK'); return { ok: false, why: 'not_found' }; }
      const check = dispatchCheck(job, opts.policy || 'prepaid');
      if (!check.ok) { await client.query('ROLLBACK'); return { ok: false, why: 'unpaid', money: check }; }
    }

    // الشرط في جملة الكتابة: الكود، وإن الاستلام لسه مااتأكدش. قراءة الكود
    // في جملة والتحديث في جملة تانية بتقرا صح وبتتسابق برضه.
    const params = [id, companyId, declared ? 'declared' : 'code',
      String(opts.by || '').trim().slice(0, 80) || null];
    const codeCond = declared ? '' : ' AND receipt_code = $5';
    if (!declared) params.push(code);

    const done = (await client.query(
      `UPDATE furniture_deliveries
          SET receipt_confirmed_at = now(), receipt_method = $3, receipt_by = $4,
              status = 'done', done_at = COALESCE(done_at, now())
        WHERE id=$1 AND company_id=$2 AND receipt_confirmed_at IS NULL${codeCond}
        RETURNING id, sale_id, receipt_method`, params
    )).rows[0];

    if (!done) {
      await client.query('ROLLBACK');
      const row = (await pool.query(
        'SELECT receipt_confirmed_at FROM furniture_deliveries WHERE id=$1 AND company_id=$2',
        [id, companyId])).rows[0];
      if (!row) return { ok: false, why: 'not_found' };
      return { ok: false, why: row.receipt_confirmed_at ? 'already' : 'wrong_code' };
    }

    await client.query('COMMIT');
    return { ok: true, job: done };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* راجع للبركة برضه */ }
    throw e;
  } finally { client.release(); }
}

/**
 * كود الاستلام بيتولد مرة واحدة للرحلة ويفضل هو هو.
 *
 * `COALESCE` مش `SET receipt_code=$1` عشان فتح الصفحة تاني مايغيّرش الكود
 * اللي العميل شايفه على تليفونه.
 */
async function ensureReceiptCode(pool, companyId, id) {
  const r = await pool.query(
    `UPDATE furniture_deliveries SET receipt_code = COALESCE(receipt_code, $3)
      WHERE id=$1 AND company_id=$2 AND receipt_confirmed_at IS NULL
      RETURNING receipt_code`,
    [id, companyId, T.newReceiptCode()]);
  return r.rows[0] ? r.rows[0].receipt_code : null;
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
async function board(pool, companyId, view, branch) {
  const day = today();
  const params = [companyId];
  let where = 'd.company_id=$1' + require('./branches').sqlFor(branch, params, 'd.branch_id');
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
async function counts(pool, companyId, branch) {
  const day = today();
  const params = [companyId, today()];
  const scope = require('./branches').sqlFor(branch, params);
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> 'done')::int AS open,
       COUNT(*) FILTER (WHERE status <> 'done' AND scheduled_date = $2)::int AS today,
       COUNT(*) FILTER (WHERE status <> 'done' AND scheduled_date < $2)::int AS late,
       COALESCE(SUM(fee - fee_paid) FILTER (WHERE fee > fee_paid), 0)::float AS fees_due
     FROM furniture_deliveries WHERE company_id=$1${scope}`, params);
  return r.rows[0];
}

/** Jobs attached to one invoice, for the invoice page. */
async function forSale(pool, companyId, saleId) {
  const r = await pool.query(
    `${SELECT} WHERE d.company_id=$1 AND d.sale_id=$2 ORDER BY d.scheduled_date, d.id`,
    [companyId, saleId]);
  return r.rows;
}

module.exports = {
  deliverWithReceipt, ensureReceiptCode,
  KINDS, SLOTS, STATUSES, POLICIES, OPEN, isLate, today, round2,
  moneyOf, dispatchCheck, policyOf,
  schedule, setStatus, reschedule, collectFee, board, counts, forSale,
};
