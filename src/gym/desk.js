'use strict';

// ── The front desk ───────────────────────────────────────────────────────────
//
// Somebody is standing there. Whoever is on the desk has one question — "can
// this person come in?" — and about two seconds to answer it while a queue
// builds behind them. The members screen answers it eventually: search, open a
// file, read a table, work out whether a date is in the past.
//
// So this file decides three things, and nothing else:
//
//   · what a typed word IS (a code, a phone, or a name) — because the person on
//     the desk should type one thing, not choose a field first;
//   · what the membership STATE is, in words, with the number of days on it;
//   · how loud to say it. "Expired" has to be unmissable across a counter, and
//     "expires in three days" has to be visible without being alarming.
//
// No database, no rendering: this is the part that has to be right.

const MS_DAY = 86400000;

/** Digits only, so «0100 123 4567» and «01001234567» are the same person. */
function digits(v) {
  return String(v == null ? '' : v)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\D/g, '');
}

/**
 * What did they just type (or scan)?
 *
 * A QR scanner types a membership code and presses Enter, so a scan and a typed
 * code are the same input by design — one box, no mode to pick, nothing for the
 * desk to get wrong at speed.
 */
function classify(term) {
  const raw = String(term == null ? '' : term).trim();
  if (!raw) return { kind: 'empty' };
  const d = digits(raw);
  // A phone: mostly digits and long enough to be one.
  if (d.length >= 7 && d.length >= raw.replace(/[\s()+-]/g, '').length) return { kind: 'phone', value: d };
  // A code: short, no spaces, and not a sentence.
  if (!/\s/.test(raw) && raw.length <= 24 && /[a-z0-9]/i.test(raw)) return { kind: 'code', value: raw };
  return { kind: 'name', value: raw.slice(0, 60) };
}

/**
 * The state of a membership row as of `now`.
 *   active (with daysLeft) · expiring · expired · frozen · none
 *
 * `expiring` is its own state on purpose: the desk is the only place where
 * "yours ends on Thursday" gets said to somebody's face, and that conversation
 * is worth more than a renewal reminder sent a week later.
 */
const SOON_DAYS = 7;

function statusOf(membership, now) {
  if (!membership) return { state: 'none', daysLeft: null };
  if (membership.frozen_at) return { state: 'frozen', daysLeft: null };
  const end = membership.end_date ? new Date(String(membership.end_date).slice(0, 10) + 'T00:00:00Z') : null;
  if (!end || !Number.isFinite(end.getTime())) return { state: 'unknown', daysLeft: null };
  const today = now instanceof Date ? now : new Date();
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - t) / MS_DAY);
  if (membership.status && membership.status !== 'active') return { state: 'expired', daysLeft: days };
  if (days < 0) return { state: 'expired', daysLeft: days };
  if (days <= SOON_DAYS) return { state: 'expiring', daysLeft: days };
  return { state: 'active', daysLeft: days };
}

/** May this person walk in? The desk can override; the screen must not pretend. */
function mayEnter(status) {
  return status.state === 'active' || status.state === 'expiring' || status.state === 'unknown';
}

/**
 * How loud, and what to say. Tones map to colour on the screen; the desk reads
 * the colour from across the counter and the words up close.
 */
function alertFor(status) {
  switch (status.state) {
    case 'active': return { tone: 'ok', key: 'gd.state.active' };
    case 'expiring': return { tone: 'warn', key: 'gd.state.expiring' };
    case 'expired': return { tone: 'stop', key: 'gd.state.expired' };
    case 'frozen': return { tone: 'stop', key: 'gd.state.frozen' };
    case 'none': return { tone: 'stop', key: 'gd.state.none' };
    default: return { tone: 'warn', key: 'gd.state.unknown' };
  }
}

// An undo is for the tap that just happened — a mis-scan, the wrong person at
// the desk. Beyond this it is not an undo any more, it is editing attendance
// history, and that belongs on the reports screen with a reason attached.
const UNDO_MINUTES = 10;

function canUndo(attendance, now) {
  if (!attendance || !attendance.checked_in_at) return false;
  const at = new Date(attendance.checked_in_at);
  if (!Number.isFinite(at.getTime())) return false;
  return ((now instanceof Date ? now : new Date()).getTime() - at.getTime()) <= UNDO_MINUTES * 60000;
}

module.exports = { classify, statusOf, alertFor, mayEnter, canUndo, digits, SOON_DAYS, UNDO_MINUTES };
