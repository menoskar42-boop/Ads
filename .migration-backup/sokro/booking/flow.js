'use strict';

// ── Confirmation is a stage, not a sentence ──────────────────────────────────
//
// "Did the user agree?" was being answered by whatever the model wrote on a
// button and whatever it made of the reply. That is not a state; it is a guess
// re-made every turn, and the failure it produces is the expensive kind — a
// train ticket bought because «تمام» was read as approval of a booking the user
// was still editing.
//
// So the booking walks a named path and each step has ONE gate:
//
//   collecting  →  reviewing  →  ready_for_confirmation  →  confirmed  →  submitted
//
//   · nothing reaches `reviewing` while a required field is missing;
//   · nothing reaches `confirmed` except an explicit yes from the USER, matched
//     against words — never a model's summary of the mood;
//   · nothing is `submitted` twice, and nothing is submitted whose fields have
//     changed since the yes. Editing after confirming VOIDS the confirmation
//     and sends it back for a new one, because "the date I agreed to" is the
//     whole content of an agreement.
const crypto = require('crypto');
const state = require('./state');

const STATUSES = ['collecting', 'reviewing', 'ready_for_confirmation', 'confirmed', 'submitted', 'cancelled', 'failed'];
const OPEN = ['collecting', 'reviewing', 'ready_for_confirmation', 'confirmed'];
const FINAL = ['submitted', 'cancelled', 'failed'];

// from → the states it may move to. Anything not listed is refused, including
// the backwards moves that look harmless (`confirmed → collecting` would keep a
// yes attached to a booking that is being changed).
const NEXT = {
  collecting: ['reviewing', 'cancelled'],
  reviewing: ['ready_for_confirmation', 'collecting', 'cancelled'],
  ready_for_confirmation: ['confirmed', 'reviewing', 'cancelled'],
  confirmed: ['submitted', 'failed', 'cancelled'],
  submitted: [],
  cancelled: [],
  failed: [],
};

function can(from, to) {
  return !!NEXT[from] && NEXT[from].includes(to);
}

/** The exact values that were agreed to, as one short string. */
function fingerprint(fields) {
  const stable = Object.keys(fields || {}).sort().map((k) => k + '=' + fields[k]).join('|');
  return crypto.createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/* ── Was that a yes? ────────────────────────────────────────────────────── */

// Matched against the USER's own words. A model deciding "they seemed happy"
// is exactly what this replaces.
// `\b` is defined on Latin word characters, so it never matches after an
// Arabic letter — with it, «أيوه» read as unclear and the user was asked to
// confirm again, forever. The anchors and the trailing punctuation do the job.
const YES = /^\s*(?:أيوه|ايوه|أيوة|ايوة|تمام|ماشي|موافق|موافقة|أكيد|اكيد|اه|آه|نعم|احجز|إحجز|ابعت|إبعت|أكد|اكد|كمّل|كمل|yes|y|ok|okay|confirm|go ahead|do it)[\s.!،؟]*$/i;
const NO = /(?:^|\s)(?:لأ|لا|مش|بلاش|استنى|إستنى|ألغي|الغي|cancel|no|stop|wait)(?:\s|$)/i;

/**
 * `yes` · `no` · `unclear`.
 *
 * Anything that is not clearly one is `unclear` ON PURPOSE: asking again costs
 * a message, and reading «ماشي بس غيّر التاريخ» as approval costs a ticket.
 */
function readAnswer(text) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return 'unclear';
  if (NO.test(t)) return 'no';
  if (YES.test(t)) return 'yes';
  return 'unclear';
}

/**
 * Move a booking, or say why not.
 *
 * `booking` is the row shape: { status, fields, confirmed_fingerprint }.
 * Returns { ok, booking, why }.
 */
function advance(booking, to, opts) {
  const b = Object.assign({}, booking);
  const o = opts || {};
  if (!STATUSES.includes(to)) return { ok: false, booking: b, why: 'unknown_status' };
  if (!can(b.status, to)) return { ok: false, booking: b, why: 'bad_transition' };

  if (to === 'reviewing' || to === 'ready_for_confirmation') {
    if (!state.ready({ kind: b.kind, fields: b.fields })) return { ok: false, booking: b, why: 'incomplete' };
  }
  if (to === 'confirmed') {
    // The yes has to be the user's, and it has to be about THIS version.
    if (o.answer !== 'yes') return { ok: false, booking: b, why: 'not_confirmed' };
    b.confirmed_fingerprint = fingerprint(b.fields);
  }
  if (to === 'submitted') {
    if (b.confirmed_fingerprint !== fingerprint(b.fields)) return { ok: false, booking: b, why: 'changed_since_confirm' };
  }
  b.status = to;
  return { ok: true, booking: b, why: null };
}

/**
 * A field changed. Anything already agreed is no longer agreed.
 *
 * This is the rule that makes the fingerprint more than decoration: an edit
 * after the yes sends the booking BACK to review, and the old confirmation is
 * dropped rather than carried forward against different values.
 */
function afterEdit(booking, newFields) {
  const b = Object.assign({}, booking, { fields: newFields });
  const changed = fingerprint(booking.fields) !== fingerprint(newFields);
  if (!changed) return b;
  if (FINAL.includes(b.status)) return b;              // a submitted booking is history
  b.confirmed_fingerprint = null;
  b.status = state.ready({ kind: b.kind, fields: newFields }) ? 'reviewing' : 'collecting';
  return b;
}

/** What to say at each stage. The recap is the thing being agreed to. */
function prompt(booking) {
  if (booking.status === 'ready_for_confirmation') {
    return state.summary({ kind: booking.kind, fields: booking.fields })
      + '\n\nأأكّد الحجز كده؟ (اكتب «أيوه» عشان أكمّل)';
  }
  if (booking.status === 'confirmed') return 'تمام — بأكمّل الحجز دلوقتي.';
  if (booking.status === 'submitted') return 'الحجز اتبعت.';
  return null;
}

module.exports = { STATUSES, OPEN, FINAL, NEXT, can, advance, afterEdit, readAnswer, fingerprint, prompt };
