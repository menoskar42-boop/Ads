'use strict';
/**
 * A staff login is not a company login.
 *
 * Three systems now hand out scoped accounts — the pharmacy's cashier, the
 * clinic's receptionist, the restaurant's rider — and every one of them sets
 * `session.companyId`, because that is how the tenant is identified. Which
 * means every mount that asks only "is there a companyId?" treats a rider as
 * the owner. `/accounting` asked exactly that: the whole ledger, revenue,
 * expenses, salaries, one URL away from a delivery account.
 *
 * The permission modules (src/clinic/perms.js, src/food/perms.js) decide what a
 * role reaches INSIDE its own area. This decides which area a session belongs to
 * at all — and it lives in one file for the same reason those do: four mounts
 * each re-deriving the rule gives three correct ones and a hole.
 */

/**
 * Session key → the area that key belongs to. Each system names its key
 * differently on purpose, so one staff session can never be read as another's.
 */
const AREAS = [
  ['staffId', '/pharmacy'],
  ['clinicStaffId', '/clinic'],
  ['foodStaffId', '/food'],
];

/** The area this session is scoped to, or null for the owner's own account. */
function areaOf(session) {
  const s = session || {};
  for (const [key, area] of AREAS) if (s[key]) return area;
  return null;
}

/** True when this session is a scoped staff account rather than the owner. */
function isStaff(session) { return areaOf(session) !== null; }

/**
 * Middleware for a mount only the owner may use — the books, the billing, the
 * page settings. Staff are sent back to their own area rather than shown a
 * locked door they cannot do anything about.
 */
function ownerOnly() {
  return function ownerOnlyGuard(req, res, next) {
    const area = areaOf(req.session);
    if (!area) return next();
    return res.redirect(area);
  };
}

/**
 * Middleware for one system's own area: its staff pass, another system's staff
 * are sent home. The owner always passes — it is their company.
 */
function only(area) {
  return function areaGuard(req, res, next) {
    const mine = areaOf(req.session);
    if (!mine || mine === area) return next();
    return res.redirect(mine);
  };
}

module.exports = { AREAS, areaOf, isStaff, ownerOnly, only };
