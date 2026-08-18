'use strict';
/**
 * Money that arrives in a form field.
 *
 * `Number('-50')` is a perfectly good number, and that is the whole bug: an
 * invoice read `discount_amount` straight off the body and did
 * `subtotal - discount`, so a request carrying `discount_amount=-50` **raised**
 * the patient's bill by fifty. Nothing looked wrong on the screen — the field
 * is called "discount", the arithmetic is right, only the sign was never
 * anybody's decision.
 *
 * The same shape repeats: a coupon saved at `discount_percent=150` takes one
 * and a half times the basket, a payment larger than the invoice marks it
 * over-paid, a negative quantity credits stock. One helper per *meaning* —
 * not one `Number()` per call site — so the range lives with the concept:
 *
 *   amount()   any money, rounded to piastres
 *   positive() money that cannot be below zero (a price, a fee, a payment)
 *   percent()  0 … 100
 *   discount() 0 … the thing being discounted
 *   count()    whole units, never negative
 *
 * Round to 2 places everywhere, because 0.1 + 0.2 is not 0.3 and an invoice
 * that is off by a thousandth still prints wrong.
 */

const r2 = (n) => Math.round(n * 100) / 100;

/** Any finite money value, to 2 decimals. Blank/garbage → `dflt`. */
function amount(v, dflt = 0) {
  if (v === '' || v === null || v === undefined) return dflt;
  const n = Number(typeof v === 'string' ? v.trim() : v);
  return Number.isFinite(n) ? r2(n) : dflt;
}

/** Money that has no meaning below zero: a price, a fee, a payment. */
function positive(v, dflt = 0) {
  return Math.max(0, amount(v, dflt));
}

/** A percentage. Anything outside 0–100 is not a percentage of anything. */
function percent(v, dflt = 0) {
  const n = amount(v, dflt);
  return Math.min(100, Math.max(0, n));
}

/**
 * A discount is bounded by the thing it discounts. Below zero it is a
 * surcharge nobody agreed to; above the subtotal it is the shop paying the
 * customer. `of` may itself be junk, so it is floored too.
 */
function discount(v, of) {
  const cap = Math.max(0, amount(of, 0));
  return Math.min(cap, Math.max(0, amount(v, 0)));
}

/** Whole units — stock, seats, sessions. Never negative, never a fraction. */
function count(v, dflt = 0) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 0 ? n : dflt;
}

/** Clamp an already-numeric value. Kept separate so ranges read out loud. */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, amount(n, lo)));
}

module.exports = { amount, positive, percent, discount, count, clamp, r2 };
