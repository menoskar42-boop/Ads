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

/**
 * The digits a person on an Egyptian keyboard actually types.
 *
 * `Number('٧٥')` is NaN, and every helper below then quietly falls back to its
 * default — so a weight typed in Arabic numerals became zero, in silence, on a
 * form written in Arabic. Thousands separators and a stray non-breaking space
 * pasted from a spreadsheet do the same thing.
 */
function digits(v) {
  return String(v == null ? '' : v)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))   // ٠-٩
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))   // ۰-۹
    .replace(/\u066B/g, '.')                    // Arabic decimal separator ٫
    .replace(/[\u066C\u00A0,\u060C\s]/g, '')  // thousands marks, NBSP, ، and spaces
    .trim();
}

/**
 * Reads a number the way it was typed, and SAYS when it cannot.
 *
 * Every other helper here answers with a number no matter what it was given,
 * which is right for money — a blank fee is no fee. It is wrong wherever zero
 * is itself a real answer: a food with 0 g of carbohydrate and a food whose
 * carbohydrate nobody filled in are both stored as 0, and no later screen can
 * tell them apart. So this one returns the reason instead of a number, and the
 * caller decides whether to refuse.
 *
 *   { ok: true, value } · { ok: false, why: 'blank' | 'unreadable' }
 */
function read(v) {
  const s = digits(v);
  if (s === '') return { ok: false, why: 'blank' };
  const n = Number(s);
  return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, why: 'unreadable' };
}

/** Any finite money value, to 2 decimals. Blank/garbage → `dflt`. */
function amount(v, dflt = 0) {
  if (v === '' || v === null || v === undefined) return dflt;
  const n = Number(digits(v));
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
  const n = parseInt(digits(v), 10);
  return Number.isInteger(n) && n >= 0 ? n : dflt;
}

/** Clamp an already-numeric value. Kept separate so ranges read out loud. */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, amount(n, lo)));
}

module.exports = { amount, positive, percent, discount, count, clamp, r2, digits, read };
