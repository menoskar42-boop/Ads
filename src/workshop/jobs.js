// What a job card costs, what it earns, and where it is.
//
// Two honesty rules run through this file, both borrowed from the furniture
// modules because they were learned the hard way there:
//
//   1. Parts and labour are never merged. Their margins are completely
//      different — a workshop can be making money on labour and losing it on
//      parts — and one blended number hides exactly the thing the owner needs
//      to see.
//
//   2. Cost is captured when the part is issued, not read back from the shelf
//      later. Re-pricing an old job at today's cost rewrites history and makes
//      last month look better or worse than it was.
'use strict';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// received → diagnosing → quoted → approved → awaiting_parts → in_progress →
// quality_check → done → ready_for_pickup → delivered.
// 'cancelled' is reachable from any of them; it is a decision, not a stage.
const STATUSES = [
  'received', 'diagnosing', 'quoted', 'approved', 'awaiting_parts',
  'in_progress', 'quality_check', 'done', 'ready_for_pickup', 'delivered', 'cancelled',
];
const OPEN_STATUSES = STATUSES.filter((status) => !['delivered', 'cancelled'].includes(status));

// The order a job normally moves in. Used to offer the next step, never to
// forbid a jump: a workshop that finishes a small job in ten minutes should not
// have to click through four screens to say so.
const FLOW = [
  'received', 'diagnosing', 'quoted', 'approved', 'awaiting_parts',
  'in_progress', 'quality_check', 'done', 'ready_for_pickup', 'delivered',
];

function nextStatus(status) {
  const i = FLOW.indexOf(status);
  return i === -1 || i === FLOW.length - 1 ? null : FLOW[i + 1];
}

/**
 * Money for one job card.
 *
 * @param job    the workshop_jobs row (discount, tax_percent, paid)
 * @param parts  workshop_job_parts rows (qty, unit_cost, unit_price)
 * @param labour workshop_job_labour rows (amount)
 * @returns every line separately, plus the totals — never a single blended
 *          figure, so a caller cannot accidentally show parts revenue as profit.
 */
function jobTotals(job, parts, labour) {
  let partsRevenue = 0, partsCost = 0;
  for (const p of parts || []) {
    partsRevenue += Number(p.qty || 0) * Number(p.unit_price || 0);
    partsCost += Number(p.qty || 0) * Number(p.unit_cost || 0);
  }
  let labourRevenue = 0;
  for (const l of labour || []) labourRevenue += Number(l.amount || 0);

  const subtotal = round2(partsRevenue + labourRevenue);
  const discount = Math.max(0, Number((job && job.discount) || 0));
  const afterDiscount = Math.max(0, round2(subtotal - discount));
  const taxPercent = Number((job && job.tax_percent) || 0);
  const tax = round2(afterDiscount * (taxPercent / 100));
  const total = round2(afterDiscount + tax);
  const paid = Math.max(0, Number((job && job.paid) || 0));
  const due = round2(Math.max(0, total - paid));

  return {
    partsRevenue: round2(partsRevenue),
    partsCost: round2(partsCost),
    // Parts margin only. Labour is not in it, and neither is any overhead.
    partsMargin: round2(partsRevenue - partsCost),
    labourRevenue: round2(labourRevenue),
    subtotal,
    discount: round2(discount),
    tax,
    taxPercent,
    total,
    paid: round2(paid),
    due,
    // Revenue minus what the parts actually cost. NOT profit: the technician's
    // wage, the rent and the power are not in it. Named for what it is so no
    // screen can call it profit.
    grossAfterParts: round2(afterDiscount - partsCost),
  };
}

/**
 * Is this job safe to hand over?
 *
 * A workshop can always override — sometimes a regular customer pays next week
 * — but the default is that the car does not leave with money outstanding,
 * because a car is the only leverage a workshop has.
 */
function deliveryCheck(totals, opts = {}) {
  if (opts.allowCredit) return { ok: true, due: totals.due };
  return { ok: totals.due <= 0, due: totals.due };
}

/**
 * Add whole months to a date, clamping to the end of the target month.
 * 31 January + 1 month is 28 (or 29) February, not 2 or 3 March.
 */
/**
 * Whole days between two moments, counted as CALENDAR days.
 *
 * `Math.floor((ends - now) / 86400000)` looks like "days left" and is not. It
 * measures instants: `ends` is midnight on the last day, `now` is the middle of
 * an afternoon, so a warranty whose last day is TODAY came out at −1 and the
 * screen said expired. A workshop turning a customer away on the last day of
 * their own warranty is the version of this bug that reaches a person.
 *
 * Both sides are reduced to their date first, so "today" and "the end date" are
 * compared as days on a calendar — which is what everybody involved means.
 */
function daysBetween(from, to) {
  const a = new Date(from), b = new Date(to);
  if (isNaN(a) || isNaN(b)) return null;
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(b) - day(a)) / 86400000);
}

function addMonths(date, months) {
  const d = new Date(date);
  if (isNaN(d)) return null;
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + Number(months || 0));
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/**
 * When is this vehicle next due?
 *
 * Both a date and an odometer come back, and the caller shows whichever
 * arrives first. A taxi hits the kilometres long before the months; a second
 * car that sits in a garage hits the months first. A workshop that tracks only
 * one of them chases the wrong half of its customers.
 *
 * Returns nulls rather than guesses when the inputs are not there — a reminder
 * built on an invented odometer sends the customer a message that is wrong.
 */
function nextService(vehicle, settings, from) {
  const km = Number(
    (vehicle && vehicle.service_km) || (settings && settings.service_km) || 0
  );
  const months = Number(
    (vehicle && vehicle.service_months) || (settings && settings.service_months) || 0
  );
  const base = from ? new Date(from) : new Date();

  const odometer = vehicle && vehicle.odometer != null ? Number(vehicle.odometer) : null;
  return {
    dueOdometer: (km > 0 && odometer != null && Number.isFinite(odometer))
      ? Math.round(odometer + km) : null,
    dueOn: months > 0 && !isNaN(base) ? addMonths(base, months) : null,
    intervalKm: km || null,
    intervalMonths: months || null,
  };
}

/**
 * How overdue is a reminder, as of today?
 *
 * `byKm` is only computed when a newer odometer reading exists than the one the
 * reminder was written against — otherwise the workshop has no idea how far the
 * car has been driven and a "you are 2,000 km late" message is a fabrication.
 */
function reminderState(reminder, vehicle, today) {
  const now = today ? new Date(today) : new Date();
  const out = { overdueDays: null, overdueKm: null, due: false };

  if (reminder && reminder.due_on) {
    const d = new Date(reminder.due_on);
    if (!isNaN(d)) {
      out.overdueDays = Math.floor((now - d) / 86400000);
      if (out.overdueDays >= 0) out.due = true;
    }
  }
  const odo = vehicle && vehicle.odometer != null ? Number(vehicle.odometer) : null;
  if (reminder && reminder.due_odometer != null && odo != null && Number.isFinite(odo)) {
    out.overdueKm = Math.round(odo - Number(reminder.due_odometer));
    if (out.overdueKm >= 0) out.due = true;
  }
  return out;
}

/**
 * A short human code for a job card: WS-<job id> padded.
 * Written on the printed card and on the customer's copy, so the two can be
 * matched by eye across a counter.
 */
function jobCode(id) {
  return 'WS-' + String(id || 0).padStart(5, '0');
}

module.exports = {
  STATUSES, OPEN_STATUSES, FLOW, nextStatus,
  jobTotals, deliveryCheck, nextService, reminderState, addMonths, jobCode, daysBetween };
