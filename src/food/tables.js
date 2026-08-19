'use strict';
/**
 * الطاولات — and the state that must never be stored.
 *
 * Every restaurant floor system gets this wrong the same way: a `status` column
 * on the table. Then a waiter closes the bill from the till, the update fails,
 * somebody edits the order instead of the table, or the app restarts — and the
 * table stays "occupied" forever while four people sit somewhere else. The
 * floor stops trusting the screen within a week, and after that the screen is
 * decoration.
 *
 * So a table has no status here. It is busy when it has an unfinished dine-in
 * order on it, and free when it does not, computed from the orders every time
 * the screen is drawn. There is no state to get stuck, because there is no
 * state.
 */

/** Orders that still have the table: anything not delivered or cancelled. */
const OPEN_STATUSES = ['pending', 'accepted', 'preparing', 'ready'];

function isOpen(order) {
  return OPEN_STATUSES.includes(String((order && order.status) || ''));
}

/**
 * The state of one table, read from the orders sitting on it.
 *
 * @param {object} table
 * @param {Array} orders   this outlet's orders (any status)
 * @returns {{state:'free'|'busy', order:object|null, since:Date|null}}
 */
function stateOf(table, orders) {
  const id = table && table.id;
  const mine = (Array.isArray(orders) ? orders : [])
    .filter((o) => Number(o.table_id) === Number(id) && isOpen(o))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  if (!mine.length) return { state: 'free', order: null, since: null };
  return { state: 'busy', order: mine[0], since: mine[0].created_at || null };
}

/** The whole floor at a glance, in the order the tables were entered. */
function floor(tables, orders) {
  return (Array.isArray(tables) ? tables : []).map((tb) => Object.assign({}, tb, stateOf(tb, orders)));
}

/** How many of each. A number the manager reads before walking the room. */
function summary(rows) {
  const out = { total: 0, free: 0, busy: 0 };
  for (const r of (Array.isArray(rows) ? rows : [])) {
    out.total++;
    if (r.state === 'busy') out.busy++; else out.free++;
  }
  return out;
}

/** Seats: a number a person typed, kept sane. Zero means "not recorded". */
function seatsOf(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(50, n);
}

/** The label the kitchen ticket carries. Never blank — a blank is unusable. */
function labelOf(table) {
  const n = String((table && table.name) || '').trim();
  return n || ('#' + ((table && table.id) || ''));
}

module.exports = { OPEN_STATUSES, isOpen, stateOf, floor, summary, seatsOf, labelOf };
