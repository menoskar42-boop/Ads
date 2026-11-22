'use strict';
/**
 * المرتجع — money going back over the counter.
 *
 * An invoice could be cancelled and a payment could be taken, and nothing in
 * between: a patient who paid and then did not have the procedure had to be
 * handled by editing the database, or by not recording it at all. Which means
 * the day's takings counted money that had already gone back — the same defect
 * the pharmacy had, in the same direction.
 *
 * ── The convention, stated once ─────────────────────────────────────────────
 *
 * A refund is a `clinic_payments` row with a NEGATIVE amount. Every screen that
 * sums payments then nets itself with no change at all — the day's cash, the
 * finance report, the invoice's own paid total. The alternative (a separate
 * refunds table) means every one of those places has to remember to subtract,
 * and the one that forgets is the one nobody notices.
 *
 * ── Two rules that are not negotiable ───────────────────────────────────────
 *
 * **Never refund more than was actually collected.** Not more than the invoice
 * total — more than was PAID, minus what was already given back. Two cashiers
 * refunding the same invoice is the case this exists for, so the number is
 * computed from the payment rows, inside the transaction.
 *
 * **The status follows the money.** After a refund the invoice is `paid`,
 * `partial` or `pending` according to what is left — not left saying "paid"
 * over an amount that is no longer there.
 */

/** What this invoice has actually taken, net of refunds. */
function collected(payments) {
  let sum = 0;
  for (const p of (Array.isArray(payments) ? payments : [])) {
    const a = Number(p.amount);
    if (Number.isFinite(a)) sum += a;
  }
  return +sum.toFixed(2);
}

/** The most that may still be given back. Never negative. */
function maxRefund(payments) {
  return Math.max(0, collected(payments));
}

/**
 * May this refund happen?
 * @returns {{ok:true, amount:number} | {ok:false, why:string, max?:number}}
 */
function check(invoice, payments, amount) {
  if (!invoice) return { ok: false, why: 'missing' };
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, why: 'amount' };
  const max = maxRefund(payments);
  if (max <= 0) return { ok: false, why: 'nothing' };
  // Rounded to the piastre before comparing: 0.1 + 0.2 arithmetic must not
  // refuse a refund of exactly what was paid.
  if (+n.toFixed(2) > +max.toFixed(2)) return { ok: false, why: 'too_much', max };
  return { ok: true, amount: +n.toFixed(2) };
}

/** The status an invoice should carry, given what is paid against its total. */
function statusAfter(total, paid, wasCancelled) {
  if (wasCancelled) return 'cancelled';
  const t = Number(total), p = Number(paid);
  if (!Number.isFinite(t) || !Number.isFinite(p)) return 'pending';
  if (p >= t && t > 0) return 'paid';
  if (p > 0) return 'partial';
  return 'pending';
}

module.exports = { collected, maxRefund, check, statusAfter };
