'use strict';
/**
 * A discount at the till, and who is allowed to give it.
 *
 * The two failure modes are symmetrical and both are real. A cashier who can
 * discount without limit can hand the shop away one pound at a time. A cashier
 * who cannot discount at all sends every regular customer, every rounding of
 * 47.50 down to 47, and every damaged-box haggle to go and find the owner —
 * so in practice the pharmacy stops using the till and writes on paper.
 *
 * So: a per-pharmacy ceiling a cashier may apply on their own, and above it a
 * manager signs in at the till. The approval is checked ON THE SERVER against
 * the password hash, because a role sent by a browser is a suggestion.
 *
 * The owner always passes — it is their money.
 */

const bcrypt = require('bcryptjs');

/** Roles that may approve a discount above the cashier ceiling. */
const APPROVER_ROLES = ['owner', 'pharmacist'];

/** Clamp a requested percent into something sane before anything else. */
function normalise(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.min(100, Math.round(p * 100) / 100);
}

/** The money, rounded the way money is, never more than the total. */
function amountOf(total, percent) {
  const t = Number(total) || 0;
  const p = normalise(percent);
  return Math.min(t, Math.round(t * p) / 100);
}

/**
 * May this session apply this discount unaided?
 *
 * The owner always may. A staff member may up to the pharmacy's ceiling, which
 * defaults to zero — a pharmacy that has never thought about this has not
 * authorised anybody to give money away.
 */
function allowedAlone(session, settings, percent) {
  const p = normalise(percent);
  if (!p) return true;
  const s = session || {};
  if (!s.staffId) return true;                       // the owner's own login
  if (APPROVER_ROLES.includes(s.staffRole)) return true;
  const ceiling = Number((settings || {}).cashier_discount_max) || 0;
  return p <= ceiling;
}

/**
 * Verify a manager standing at the till.
 *
 * Deliberately the same credentials as the login page rather than a short PIN:
 * a four-digit code that unlocks the day's takings gets watched over a
 * shoulder once and then belongs to everybody.
 *
 * Returns { id, name } or null. Never says which half was wrong.
 */
async function approve(pool, companyId, username, password) {
  const u = String(username || '').trim().toLowerCase().slice(0, 60);
  const pw = String(password || '');
  // bcrypt.compare('', hashOf('')) is true, so an empty password is rejected
  // before anything is compared — the same trap the company login already hit.
  if (!u || !pw) return null;

  // The owner's own account approves too: they may not have a staff row.
  const owner = (await pool.query(
    'SELECT id, email, password_hash FROM company_users WHERE company_id = $1 AND lower(email) = $2',
    [companyId, u]
  )).rows[0];
  if (owner) {
    const ok = owner.password_hash && await bcrypt.compare(pw, owner.password_hash);
    return ok ? { id: owner.id, name: owner.email } : null;
  }

  const st = (await pool.query(
    `SELECT id, name, username, role, password_hash FROM pharmacy_staff
      WHERE company_id = $1 AND lower(username) = $2 AND is_active = true`,
    [companyId, u]
  )).rows[0];
  if (!st) return null;
  if (!APPROVER_ROLES.includes(st.role)) return null;
  const ok = st.password_hash && await bcrypt.compare(pw, st.password_hash);
  return ok ? { id: st.id, name: st.name || st.username } : null;
}

/**
 * Settle a discount for one sale.
 *
 * @returns { percent, amount, byId, byName } or { error: 'needs_approval' | 'bad_approval' }
 */
async function settle(pool, companyId, session, settings, total, req) {
  const percent = normalise(req && req.percent);
  if (!percent) return { percent: 0, amount: 0, byId: null, byName: null };

  if (allowedAlone(session, settings, percent)) {
    return { percent, amount: amountOf(total, percent), byId: null, byName: null };
  }
  const who = req && (req.approver_user || req.approver_password)
    ? await approve(pool, companyId, req.approver_user, req.approver_password)
    : null;
  if (!who) {
    return { error: (req && req.approver_user) ? 'bad_approval' : 'needs_approval' };
  }
  return { percent, amount: amountOf(total, percent), byId: who.id, byName: who.name };
}

module.exports = { APPROVER_ROLES, normalise, amountOf, allowedAlone, approve, settle };
