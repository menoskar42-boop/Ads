'use strict';

// ── The paid subscription, and what it is allowed to close ───────────────────
//
// Phase 6 of the nutrition roadmap: a practice can charge for the patient
// portal. The money side is deliberately small — the practice already has its
// own payment methods (gateway, InstaPay, wallet, cash), and this does not
// invent a second one. What this file decides is the part that can hurt
// somebody: WHO STILL GETS IN.
//
// The rules, in the order they matter:
//
//   1. **A practice that has not switched this on charges nobody.** Off is the
//      default, per the owner's standing rule that every merchant feature is
//      optional. With it off, every patient has access, always.
//   2. **A patient who was using the portal before the switch keeps it.** A
//      practice turning billing on must not lock out the people already in the
//      middle of a plan — they get a grace period, and the dietitian sees who
//      is in it.
//   3. **Unknown never means locked.** A missing subscription row, a broken
//      date, a database that could not answer: all of those mean OPEN. A
//      patient is looking at their own medical plan; failing closed over a
//      NULL is the wrong side to be wrong on.
//
// Nothing here talks to a database, so all three can be tested.

const MS_DAY = 86400000;

/** A date, or null. Strings from the database arrive in both shapes. */
function day(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) ? d : null;
}

function utcDay(d) { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

/** Whole days from `from` to `to`, comparing CALENDAR days, not instants. */
function daysBetween(from, to) {
  const a = day(from); const b = day(to);
  if (!a || !b) return null;
  return Math.round((utcDay(b) - utcDay(a)) / MS_DAY);
}

/** `ends_on` for a subscription that starts on `startsOn` and runs `months`. */
function endOf(startsOn, months) {
  const s = day(startsOn);
  const m = Math.min(Math.max(parseInt(months, 10) || 1, 1), 36);
  if (!s) return null;
  // "Same date, m months later" has no answer on the 31st of January, and
  // JavaScript's is 3 March — a subscription bought on the 31st would run four
  // days longer than one bought on the 30th. Clamp to the target month's last
  // day, the way every human calendar does.
  const y = s.getUTCFullYear();
  const targetMonth = s.getUTCMonth() + m;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const e = new Date(Date.UTC(y, targetMonth, Math.min(s.getUTCDate(), lastDay)));
  // The last day is the day BEFORE that: a one-month subscription bought on the
  // 1st runs to the end of the month, not one day into the next.
  e.setUTCDate(e.getUTCDate() - 1);
  return e.toISOString().slice(0, 10);
}

/**
 * The state of one subscription row, as of `now`.
 *   none · active · expired  (+ daysLeft when active)
 */
function stateOf(sub, now) {
  if (!sub || sub.status === 'cancelled') return { state: 'none', daysLeft: null };
  if (sub.status !== 'paid' && sub.status !== 'active') return { state: 'unpaid', daysLeft: null };
  const left = daysBetween(now || new Date(), sub.ends_on);
  if (left === null) return { state: 'unknown', daysLeft: null };
  return left >= 0 ? { state: 'active', daysLeft: left } : { state: 'expired', daysLeft: left };
}

const GRACE_DAYS = 14;

/**
 * May this patient open the portal?
 *
 * Returns { allowed, reason }. The reasons are for the SCREEN, so each one is
 * a different sentence the patient can act on — "your subscription ended" is
 * not the same message as "the practice has not set this up".
 */
function access(settings, patient, sub, now) {
  const on = !!(settings && settings.subscription_enabled);
  if (!on) return { allowed: true, reason: 'not_charging' };

  const st = stateOf(sub, now);
  if (st.state === 'active') return { allowed: true, reason: 'active', daysLeft: st.daysLeft };
  // A read that failed, or a date nobody can parse, must not lock a patient out
  // of their own plan.
  if (st.state === 'unknown') return { allowed: true, reason: 'unknown' };

  // Already using the portal before the practice started charging: they are not
  // a lapsed subscriber, they are somebody the rules changed under.
  const since = daysBetween(patient && (patient.portal_since || patient.created_at), now || new Date());
  const switchedAt = settings && settings.subscription_since;
  const sinceSwitch = switchedAt ? daysBetween(switchedAt, now || new Date()) : null;
  if (since !== null && sinceSwitch !== null && sinceSwitch <= GRACE_DAYS && since > sinceSwitch) {
    return { allowed: true, reason: 'grace', graceLeft: GRACE_DAYS - sinceSwitch };
  }
  return { allowed: false, reason: st.state === 'expired' ? 'expired' : 'unpaid' };
}

/** What the practice charges, clamped so a typo cannot bill a patient 90,000. */
function priceOf(settings) {
  const n = Number(settings && settings.subscription_price);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100) / 100, 100000) : 0;
}

module.exports = { access, stateOf, endOf, daysBetween, priceOf, GRACE_DAYS };
