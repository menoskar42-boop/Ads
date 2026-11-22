// The activity log — who did what, and when.
//
// Three rules this file exists to enforce:
//
// 1. Writing to the log must NEVER break the thing being logged. An audit
//    trail that can fail a sale is worse than no audit trail, so `log()`
//    swallows its own errors and returns instead of throwing.
//
// 2. The log is append-only and always written. There is no toggle. A record
//    of who did what that the person doing it can switch off is not a record;
//    the `activity` flag hides the PAGE, never the writing.
//
// 3. Rows carry the human-readable detail as text at write time rather than
//    ids to be joined later. An invoice can be cancelled and a customer
//    archived; the line "cancelled invoice #12 for Mohamed A." has to still
//    read the same in a year.
'use strict';

const MAX_DETAIL = 300;

/**
 * Who is acting. Staff logins carry a name; the company's own login is the
 * owner. Never null in the log — "somebody" is not an answer to "who".
 */
function actorOf(req, t) {
  const s = (req && req.session) || {};
  if (s.staffId && s.staffName) return String(s.staffName).slice(0, 80);
  const owner = typeof t === 'function' ? t('fn2.act.owner') : 'owner';
  return owner === 'fn2.act.owner' ? 'owner' : owner;
}

/**
 * Append one row. Fire and forget: callers do not await a decision from it.
 * @param action one of the ACTIONS keys below, so the page can translate it
 * @param detail already-rendered text — names and numbers, not ids
 */
function log(pool, companyId, { actor, action, entity, entityId, detail }) {
  if (!pool || !companyId || !action) return Promise.resolve();
  return pool.query(
    `INSERT INTO furniture_activity_log (company_id, actor, action, entity, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [companyId, String(actor || 'owner').slice(0, 80), String(action).slice(0, 60),
      entity ? String(entity).slice(0, 40) : null,
      Number.isFinite(Number(entityId)) ? parseInt(entityId, 10) : null,
      detail ? String(detail).slice(0, MAX_DETAIL) : null]
  ).catch((e) => {
    // Deliberately quiet on the page, loud in the server log: the owner should
    // not see a red banner because an audit row failed to write.
    console.error('[furniture activity]', e.message);
  });
}

/**
 * Bind the log to one request. Routes then call `req.flog('sale.create', ...)`
 * without repeating the pool, the company or the actor at every call site —
 * which is how call sites quietly start disagreeing about who acted.
 */
function attach(pool) {
  return (req, res, next) => {
    const actor = actorOf(req, res.locals.t);
    req.flog = (action, entity, entityId, detail) =>
      log(pool, req.company && req.company.id, { actor, action, entity, entityId, detail });
    next();
  };
}

// Entities the page offers as filters. Anything logged outside this list still
// appears under "all" — the filter is a convenience, not a gate.
const ENTITIES = ['sale', 'payment', 'return', 'refund', 'delivery', 'purchase',
  'supplier_payment', 'payroll', 'expense', 'master', 'settings'];

/** Recent rows, newest first, optionally narrowed to one entity. */
async function recent(pool, companyId, { entity, limit, offset } = {}) {
  const params = [companyId];
  let where = 'company_id=$1';
  if (entity && ENTITIES.includes(entity)) where += ` AND entity=$${params.push(entity)}`;
  const lim = Math.min(200, Math.max(10, parseInt(limit, 10) || 100));
  const off = Math.max(0, parseInt(offset, 10) || 0);
  const r = await pool.query(
    `SELECT * FROM furniture_activity_log WHERE ${where}
      ORDER BY created_at DESC, id DESC LIMIT ${lim + 1} OFFSET ${off}`, params);
  // One row over the limit tells the page whether a "more" link is honest,
  // without a second COUNT query over a table that only grows.
  const more = r.rows.length > lim;
  return { rows: r.rows.slice(0, lim), more, limit: lim, offset: off };
}

module.exports = { log, attach, actorOf, recent, ENTITIES };
