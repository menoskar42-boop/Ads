'use strict';

// ── Quotes, and the day they stop being true ─────────────────────────────────
//
// A showroom sells by quoting: somebody asks about a bedroom and leaves with a
// price on paper. Two things about that piece of paper decide whether the
// system is any use.
//
// **It has an expiry.** Timber moved, the pound moved, and a quote from March
// is not a price in September. A quote with no end date is a promise the
// showroom did not mean to make — so `valid_until` is real, and an expired
// quote is refused rather than quietly honoured.
//
// **It becomes exactly one invoice.** "Accept" is the moment a piece of paper
// turns into money owed, and two clicks on it must not produce two invoices for
// the same bedroom. That is decided in the database (a unique index on the
// invoice this quote became), not by a check in code that a double tap races
// past.
//
// Nothing here touches a database: this is the part that has to be right.

const S = require('./sales');

const STATUSES = ['draft', 'sent', 'accepted', 'rejected'];
const OPEN = ['draft', 'sent'];

function day(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) ? d : null;
}
function utc(d) { return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }

/** Whole days from `from` to `to`, comparing calendar days. */
function daysBetween(from, to) {
  const a = day(from); const b = day(to);
  if (!a || !b) return null;
  return Math.round((utc(b) - utc(a)) / 86400000);
}

/** The default: a quote is good for two weeks unless the showroom says otherwise. */
const DEFAULT_DAYS = 14;
function defaultValidUntil(from, days) {
  const d = day(from) || new Date();
  const n = Math.min(Math.max(parseInt(days, 10) || DEFAULT_DAYS, 1), 365);
  const out = new Date(utc(d) + n * 86400000);
  return out.toISOString().slice(0, 10);
}

/**
 * The state of a quote as of `now`.
 *   draft · sent · expired · accepted · rejected
 *
 * `expired` is computed, never stored: a stored flag needs somebody to run a
 * job at midnight, and a quote that expired while nobody was looking is exactly
 * the case that matters.
 */
function stateOf(quote, now) {
  if (!quote) return { state: 'none', daysLeft: null };
  if (quote.status === 'accepted' || quote.status === 'rejected') return { state: quote.status, daysLeft: null };
  const left = quote.valid_until ? daysBetween(now || new Date(), quote.valid_until) : null;
  if (left === null) return { state: quote.status === 'sent' ? 'sent' : 'draft', daysLeft: null };
  if (left < 0) return { state: 'expired', daysLeft: left };
  return { state: quote.status === 'sent' ? 'sent' : 'draft', daysLeft: left };
}

/**
 * May this quote turn into an invoice, and if not, why not?
 *
 * The reason travels with the answer because each one is a different sentence
 * on the screen: "already invoiced" is not "expired" and neither is "rejected".
 */
function canConvert(quote, now) {
  if (!quote) return { ok: false, why: 'missing' };
  if (quote.sale_id) return { ok: false, why: 'already' };
  if (quote.status === 'rejected') return { ok: false, why: 'rejected' };
  const st = stateOf(quote, now);
  if (st.state === 'expired') return { ok: false, why: 'expired' };
  if (!OPEN.includes(quote.status) && quote.status !== 'accepted') return { ok: false, why: 'state' };
  return { ok: true, why: null };
}

/** Quote arithmetic — the same helper the invoice uses, so the two agree. */
function totals(lines, taxPercent) { return S.invoiceTotals(lines, taxPercent); }

/** Digits only, so «0100 123 4567» and «01001234567» are one lead. */
function phoneKey(v) {
  return String(v == null ? '' : v)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .replace(/\D/g, '');
}

const LEAD_STATUSES = ['new', 'quoted', 'won', 'lost'];
const SOURCES = ['walkin', 'phone', 'facebook', 'instagram', 'referral', 'other'];

module.exports = {
  STATUSES, OPEN, LEAD_STATUSES, SOURCES, DEFAULT_DAYS,
  stateOf, canConvert, totals, daysBetween, defaultValidUntil, phoneKey,
};
