// Branches — a showroom, a workshop, a store.
//
// The line this module draws, and the reason it is drawn there:
//
//   MONEY AND JOBS are per branch. Two showrooms have two tills, two sets of
//   expenses, two vans and two teams. Adding those together makes both sets of
//   numbers useless — "we took 90,000 this month" tells the owner nothing if he
//   cannot see that one branch took 85,000 of it.
//
//   STOCK AND MASTER DATA stay company-wide. A workshop with two showrooms has
//   ONE timber store, one supplier list and one product catalogue. Splitting
//   those would invent an inter-branch transfer problem the business does not
//   actually have, and every transfer is a chance for stock to go missing on
//   paper.
//
// Rows written before branches existed have branch_id NULL. They are shown
// under their own filter rather than folded into a branch: assigning them to a
// branch nobody chose would be a guess presented as a fact.
'use strict';

const KINDS = ['showroom', 'workshop', 'store'];

// Tables that carry branch_id. Anything not listed here is company-wide by
// design, not by omission — see the header.
const SCOPED = ['furniture_sales', 'furniture_expenses', 'furniture_deliveries', 'furniture_workers'];

/** Active branches. Never throws — a showroom with no branches is the normal
 *  case, not an error, and the whole system works without one. */
async function list(pool, companyId, { includeArchived = false } = {}) {
  try {
    const r = await pool.query(
      `SELECT * FROM furniture_branches WHERE company_id=$1 ${includeArchived ? '' : 'AND is_active'}
        ORDER BY is_active DESC, name`, [companyId]);
    return r.rows;
  } catch (e) { return []; }
}

/**
 * Resolve the branch filter for a request.
 *
 * Three states, all meaningful:
 *   null        — everything, the default and the only honest total
 *   a number    — one branch
 *   'none'      — rows recorded before branches existed
 */
function filterFrom(value, branches) {
  const v = String(value == null ? '' : value);
  if (v === 'none') return 'none';
  const id = parseInt(v, 10);
  if (Number.isInteger(id) && branches.some((b) => b.id === id)) return id;
  return null;
}

/**
 * Append the branch condition to a WHERE clause, mutating the params array.
 * Returns the SQL fragment (empty when no filter is active) so callers keep
 * one place to get this right instead of writing the same IS NULL three times.
 */
function sqlFor(filter, params, column = 'branch_id') {
  if (filter == null) return '';
  if (filter === 'none') return ` AND ${column} IS NULL`;
  return ` AND ${column} = $${params.push(filter)}`;
}

/** The id to stamp on a new row: only a real branch, never 'none'. */
function idToStamp(filter, posted, branches) {
  const p = parseInt(posted, 10);
  if (Number.isInteger(p) && branches.some((b) => b.id === p)) return p;
  return typeof filter === 'number' ? filter : null;
}

/** Money per branch over a period, for the reports page. */
async function segment(pool, companyId, from, to) {
  const r = await pool.query(
    `SELECT b.id, b.name,
            COALESCE(s.total, 0)  AS invoiced,
            COALESCE(e.total, 0)  AS expenses
       FROM furniture_branches b
       LEFT JOIN (
         SELECT branch_id, SUM(total) AS total FROM furniture_sales
          WHERE company_id=$1 AND status <> 'cancelled' AND sale_date BETWEEN $2 AND $3
          GROUP BY branch_id
       ) s ON s.branch_id = b.id
       LEFT JOIN (
         SELECT branch_id, SUM(amount) AS total FROM furniture_expenses
          WHERE company_id=$1 AND spend_date BETWEEN $2 AND $3 GROUP BY branch_id
       ) e ON e.branch_id = b.id
      WHERE b.company_id=$1 AND b.is_active
      ORDER BY invoiced DESC, b.name`, [companyId, from, to]);
  return r.rows;
}

module.exports = { KINDS, SCOPED, list, filterFrom, sqlFor, idToStamp, segment };
