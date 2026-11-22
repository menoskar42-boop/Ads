'use strict';
/**
 * أوامر الشراء — the order the pharmacy sends to its supplier.
 *
 * Until now the only way stock arrived was somebody typing a quantity into the
 * inventory form after the boxes were already on the counter. Which means there
 * was no answer to any of the questions a pharmacy actually asks: what did we
 * order, from whom, at what price, what arrived, and what is still owed. A
 * supplier who short-delivers is invisible when the only record is the shelf.
 *
 * ── Two decisions, and both are the same decision ───────────────────────────
 *
 * **What arrived is a fact; what state the order is in is derived from it.**
 * `draft`, `sent` and `cancelled` are stored because they are decisions a human
 * made. `partial` and `received` are NOT stored — they are read from the lines
 * every time. A stored "received" flag is how an order that was reopened, or
 * whose line was corrected, keeps claiming to be complete.
 *
 * **A receipt is a claim, not an increment.** The form carries the quantity it
 * was rendered with, and the UPDATE only matches while that is still the value
 * in the table. A double-clicked "استلمت ١٠" adds ten once — the second press
 * matches nothing. Receiving is exactly the kind of write that gets
 * double-submitted: it is at the end of a long form, on a phone, in a shop.
 */

/** The states a human sets. Everything else is read from the lines. */
const STATES = ['draft', 'sent', 'cancelled'];

function int(v, dflt) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : dflt;
}

/** Where one line stands: nothing yet, some, all, or more than ordered. */
function lineState(item) {
  const ordered = Math.max(0, int(item && item.qty_ordered, 0));
  const got = Math.max(0, int(item && item.qty_received, 0));
  if (got === 0) return 'none';
  if (got < ordered) return 'partial';
  if (got === ordered) return 'complete';
  // Suppliers do send extra, and pretending they do not is how the shelf and
  // the record disagree. It is recorded and shown, not refused.
  return 'over';
}

/** What is still owed on a line — never negative. */
function outstanding(item) {
  return Math.max(0, int(item && item.qty_ordered, 0) - int(item && item.qty_received, 0));
}

/**
 * The order's state, derived.
 *
 * `cancelled` wins over everything: a cancelled order that happens to have a
 * received line is still cancelled, and hiding that would be worse than showing
 * it.
 */
function stateOf(po, items) {
  const stored = String((po && po.status) || 'draft');
  if (stored === 'cancelled') return 'cancelled';
  const lines = Array.isArray(items) ? items : [];
  if (!lines.length) return stored === 'sent' ? 'sent' : 'draft';
  const any = lines.some((i) => int(i.qty_received, 0) > 0);
  const all = lines.every((i) => outstanding(i) === 0);
  if (all) return 'received';
  if (any) return 'partial';
  return stored === 'sent' ? 'sent' : 'draft';
}

/** May this order still take a receipt? */
function canReceive(po, items) {
  const state = stateOf(po, items);
  if (state === 'cancelled') return { ok: false, why: 'cancelled' };
  return { ok: true, why: 'ok' };
}

/** A draft can still be edited; once it is sent, the lines are what was asked for. */
function canEdit(po, items) {
  const state = stateOf(po, items);
  if (state === 'draft') return { ok: true, why: 'ok' };
  return { ok: false, why: state };
}

/**
 * How much to order for a medicine that is at or below its minimum.
 *
 * Up to twice the minimum, which is the rule a pharmacist can hold in their
 * head and correct by eye — and every suggested line is editable before the
 * order is sent. Never zero: a line that suggests ordering nothing is noise on
 * a screen that exists to be acted on.
 */
function suggestQty(row) {
  const min = Math.max(0, int(row && row.min_qty, 0));
  const available = Math.max(0, int(row && row.available, 0));
  return Math.max(1, min * 2 - available);
}

/** The rows worth suggesting: at or below the minimum, with a minimum set. */
function suggestions(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => int(r.min_qty, 0) > 0 && int(r.available, 0) <= int(r.min_qty, 0))
    .map((r) => Object.assign({}, r, { suggest_qty: suggestQty(r) }));
}

/** Expected cost of the order, and of what actually arrived. */
function totals(items) {
  const lines = Array.isArray(items) ? items : [];
  let ordered = 0, received = 0;
  for (const i of lines) {
    const cost = Number(i.cost);
    if (!Number.isFinite(cost)) continue;
    ordered += cost * Math.max(0, int(i.qty_ordered, 0));
    received += cost * Math.max(0, int(i.qty_received, 0));
  }
  return { ordered: +ordered.toFixed(2), received: +received.toFixed(2) };
}

module.exports = {
  STATES, lineState, outstanding, stateOf, canReceive, canEdit,
  suggestQty, suggestions, totals,
};
