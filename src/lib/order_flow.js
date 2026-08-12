'use strict';
/**
 * A finished order is finished.
 *
 * The pharmacy had this bug and it cost real money: an order could go
 * delivered → preparing → delivered, and the second pass through the fulfil
 * branch took stock off the shelf a SECOND time and counted the sale twice in
 * the day's takings. It was found by an external review, fixed there, and the
 * same shape was still live in the restaurant orders and the clinic queue —
 * which is why this is a shared module and not a third copy of the same `if`.
 *
 * Two rules, and nothing else:
 *
 *   1. **You cannot leave a terminal state.** delivered / rejected / cancelled
 *      are the end. Re-selecting the SAME status stays allowed — it is a no-op
 *      and forbidding it only produces confusing errors when somebody
 *      double-clicks.
 *
 *   2. **You cannot skip backwards** through the flow. Forward jumps are
 *      allowed on purpose: a small restaurant really does go pending →
 *      delivered for a walk-in, and refusing that would have staff working
 *      around the system, which is worse than a loose sequence.
 *
 * Cancelling is always available from any non-terminal state. An order that
 * cannot be cancelled is an order somebody edits in the database.
 */

/** Statuses that end an order's life. */
const TERMINAL = new Set(['delivered', 'done', 'rejected', 'cancelled', 'refunded']);

/** Statuses reachable from anywhere (before the end). */
const ALWAYS = new Set(['cancelled', 'rejected']);

/**
 * May `prev` become `next`, given the ordered flow this system uses?
 * Returns { ok: true } or { ok: false, reason: 'final' | 'backwards' | 'unknown' }.
 */
function canMove(flow, prev, next) {
  if (!next || !flow.includes(next)) return { ok: false, reason: 'unknown' };
  if (!prev) return { ok: true };                    // a new order
  if (prev === next) return { ok: true };            // no-op, e.g. a double click
  if (TERMINAL.has(prev)) return { ok: false, reason: 'final' };
  if (ALWAYS.has(next)) return { ok: true };
  const i = flow.indexOf(prev);
  const j = flow.indexOf(next);
  if (i === -1) return { ok: true };                 // unknown old value: don't block work
  if (j < i) return { ok: false, reason: 'backwards' };
  return { ok: true };
}

const isTerminal = (s) => TERMINAL.has(s);

module.exports = { canMove, isTerminal, TERMINAL, ALWAYS };
