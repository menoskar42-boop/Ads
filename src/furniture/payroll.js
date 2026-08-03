// Attendance and payroll.
//
// A payslip is the one number a worker checks, argues about, and remembers. So
// every component is stored, not just the net: months later somebody will ask
// why a week was short, and "the system said so" is not an answer.
//
// Two rules shape the whole file:
//   1. Nothing is deducted twice. Bonuses, penalties, advances and canteen
//      credit are swept into a run by stamping payroll_id on them, so the next
//      run cannot pick the same rows up again.
//   2. The system PROPOSES, the owner decides. Every figure is pre-filled and
//      editable before the run is saved — real payroll always has a case the
//      rules did not cover.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const STATUSES = ['present', 'absent', 'half', 'vacation'];

// Days a weekly wage is spread over. Stated in the UI rather than hidden here,
// because a workshop on a five-day week would otherwise be short-changed and
// never know where the difference came from.
const WEEK_DAYS = 6;
// A working day, for converting an hour of permission into money.
const DAY_HOURS = 8;

/** Day rate implied by the worker's pay type, or null when it is not derivable. */
function dayRate(worker) {
  const rate = Number(worker.pay_rate) || 0;
  if (worker.pay_type === 'daily') return rate;
  if (worker.pay_type === 'weekly') return round2(rate / WEEK_DAYS);
  // Piece work is paid per piece, and the system does not count pieces. Guessing
  // a day rate here would invent a wage; the workshop enters the figure instead.
  return null;
}

/**
 * Turn attendance rows into paid and unpaid days.
 * A half day is half paid and half not; vacation is treated as PAID leave, and
 * a workshop that does not pay leave marks it absent instead.
 */
function attendanceDays(rows) {
  let present = 0, absent = 0, half = 0, vacation = 0, permissionHours = 0;
  for (const r of rows || []) {
    if (r.status === 'present') present += 1;
    else if (r.status === 'absent') absent += 1;
    else if (r.status === 'half') half += 1;
    else if (r.status === 'vacation') vacation += 1;
    permissionHours += Number(r.permission_hours) || 0;
  }
  return {
    present, absent, half, vacation, permissionHours,
    recorded: present + absent + half + vacation,
    paidDays: present + vacation + half * 0.5,
    unpaidDays: absent + half * 0.5,
  };
}

/**
 * Build one payslip.
 *
 * @returns every component, so the payslip explains itself rather than landing
 *          as a single net figure nobody can take apart.
 */
function computeRow(worker, attendance, adjustments, canteenRows) {
  const days = attendanceDays(attendance);
  const rate = dayRate(worker);

  // Permission hours come off the day rate pro rata. With no derivable day rate
  // there is nothing to pro-rate against, so it is left at zero rather than
  // guessed.
  const permissionCost = rate == null ? 0 : round2((days.permissionHours / DAY_HOURS) * rate);
  const base = rate == null ? 0 : round2(days.paidDays * rate - permissionCost);
  const attendanceDeduction = rate == null ? 0 : round2(days.unpaidDays * rate);

  let bonuses = 0, penalties = 0, advances = 0;
  for (const a of adjustments || []) {
    const amt = Number(a.amount) || 0;
    if (a.adj_type === 'bonus') bonuses += amt;
    else if (a.adj_type === 'penalty') penalties += amt;
    else if (a.adj_type === 'advance') advances += amt;
  }
  // Only what was taken ON ACCOUNT. Something paid for in cash at the counter
  // is already settled and deducting it again would charge the worker twice.
  const canteen = (canteenRows || [])
    .filter((c) => !c.paid_cash)
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const deductions = round2(penalties + advances + canteen);
  return {
    worker_id: worker.id,
    worker_name: worker.name,
    pay_type: worker.pay_type,
    pay_rate: Number(worker.pay_rate) || 0,
    day_rate: rate,
    days,
    permission_cost: permissionCost,
    attendance_deduction: attendanceDeduction,
    base,
    bonuses: round2(bonuses),
    penalties: round2(penalties),
    advances: round2(advances),
    canteen: round2(canteen),
    deductions,
    net: round2(base + bonuses - deductions),
    // What this run would consume, so the sweep marks exactly these rows.
    adjustment_ids: (adjustments || []).map((a) => a.id),
    canteen_ids: (canteenRows || []).filter((c) => !c.paid_cash).map((c) => c.id),
  };
}

/** Everything needed to draw the payroll table for one period. */
async function preview(pool, companyId, start, end) {
  const workers = (await pool.query(
    'SELECT * FROM furniture_workers WHERE company_id=$1 AND is_active ORDER BY name', [companyId]
  )).rows;
  if (!workers.length) return [];

  const ids = workers.map((w) => w.id);
  const [att, adj, can] = await Promise.all([
    pool.query(
      `SELECT worker_id, status, permission_hours FROM furniture_attendance
        WHERE company_id=$1 AND worker_id = ANY($2) AND work_date BETWEEN $3 AND $4`,
      [companyId, ids, start, end]),
    // payroll_id IS NULL is what stops a bonus being paid twice: once swept
    // into a run it can never be picked up again, whatever period is chosen.
    pool.query(
      `SELECT id, worker_id, adj_type, amount FROM furniture_payroll_adjustments
        WHERE company_id=$1 AND worker_id = ANY($2) AND payroll_id IS NULL AND adj_date BETWEEN $3 AND $4`,
      [companyId, ids, start, end]),
    pool.query(
      `SELECT id, worker_id, amount, paid_cash FROM furniture_canteen_purchases
        WHERE company_id=$1 AND worker_id = ANY($2) AND payroll_id IS NULL AND buy_date BETWEEN $3 AND $4`,
      [companyId, ids, start, end]),
  ]);

  const by = (rows) => rows.reduce((m, r) => { (m[r.worker_id] = m[r.worker_id] || []).push(r); return m; }, {});
  const A = by(att.rows), J = by(adj.rows), C = by(can.rows);
  return workers.map((w) => computeRow(w, A[w.id] || [], J[w.id] || [], C[w.id] || []));
}

/**
 * Save a payroll run. `rows` carries the figures as the owner left them, which
 * may differ from the preview — that is the point of letting them edit.
 */
async function runPayroll(pool, companyId, { start, end, rows, markPaid }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let saved = 0;
    for (const r of rows || []) {
      const run = (await client.query(
        `INSERT INTO furniture_payroll_runs
           (company_id, worker_id, period_start, period_end, base, bonuses, penalties,
            advances, canteen, deductions, net, paid, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [companyId, r.worker_id, start, end, r.base, r.bonuses, r.penalties,
          r.advances, r.canteen, r.deductions, r.net, !!markPaid, r.note || null]
      )).rows[0];

      // Stamp the rows this run consumed. Scoped by id AND company AND
      // still-unswept, so a double submit cannot claim the same rows twice.
      if (r.adjustment_ids && r.adjustment_ids.length) {
        await client.query(
          'UPDATE furniture_payroll_adjustments SET payroll_id=$1 WHERE company_id=$2 AND id = ANY($3) AND payroll_id IS NULL',
          [run.id, companyId, r.adjustment_ids]);
      }
      if (r.canteen_ids && r.canteen_ids.length) {
        await client.query(
          'UPDATE furniture_canteen_purchases SET payroll_id=$1 WHERE company_id=$2 AND id = ANY($3) AND payroll_id IS NULL',
          [run.id, companyId, r.canteen_ids]);
      }
      saved += 1;
    }
    await client.query('COMMIT');
    return { saved };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

module.exports = { STATUSES, WEEK_DAYS, DAY_HOURS, round2, dayRate, attendanceDays, computeRow, preview, runPayroll };
