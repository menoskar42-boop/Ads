'use strict';
/**
 * Who in a clinic may see what.
 *
 * The external review's fourth point: everything ran on the owner's single
 * login, so the receptionist who books appointments had the same access as the
 * owner — the full medical file, the finances, the settings. In a clinic that
 * is not a convenience problem. The receptionist does not want to be able to
 * read a diagnosis any more than the clinic wants them to.
 *
 * The pharmacy has had roles for a while (`pharmacy_staff`), and this follows
 * its shape deliberately rather than inventing a second vocabulary.
 *
 * The important design decision is HOW it is enforced. Sprinkling `if
 * (!req.perms.x) return 403` across forty routes gives you thirty-nine guarded
 * routes and one that everybody forgets — which is the same failure the tenant
 * isolation fix had. So permission is attached to a PATH PREFIX and enforced by
 * one middleware. A route added next year under /clinic/invoices is covered
 * because of where it lives, not because someone remembered.
 */

/** The five roles, and what each may reach. */
const ROLES = {
  // Everything. The account that pays for the clinic.
  owner: { medical: true, finance: true, schedule: true, patients: true, settings: true, staff: true },
  // Runs the place day to day, but the medical record is the doctor's.
  manager: { medical: false, finance: true, schedule: true, patients: true, settings: true, staff: true },
  // Appointments and contact details. No diagnosis, no money.
  reception: { medical: false, finance: false, schedule: true, patients: true, settings: false, staff: false },
  // The medical file, and the day's queue to work from.
  doctor: { medical: true, finance: false, schedule: true, patients: true, settings: false, staff: false },
  // Invoices and payments, nothing clinical.
  accountant: { medical: false, finance: true, schedule: false, patients: true, settings: false, staff: false },
  // Calls out, books, follows up — and must never see a medical record.
  callcenter: { medical: false, finance: false, schedule: true, patients: true, settings: false, staff: false },
};

const ROLE_KEYS = Object.keys(ROLES).filter((r) => r !== 'owner');

/**
 * Path prefix → the permission it needs.
 *
 * Longest match wins, so a more specific prefix can be stricter than its
 * parent. Anything not listed needs only a login — the dashboard, the tenant's
 * own public page, the logout.
 */
const GUARDED = [
  ['/patients', 'patients'],       // the list and the file
  ['/visits', 'schedule'],
  ['/queue', 'schedule'],
  ['/appointments', 'schedule'],
  ['/invoices', 'finance'],
  ['/finance', 'finance'],
  ['/payments', 'finance'],
  ['/cashbox', 'finance'],
  ['/insurance', 'finance'],
  ['/installments', 'finance'],
  ['/settings', 'settings'],
  ['/modules', 'settings'],
  ['/addons', 'settings'],
  ['/integrations', 'settings'],
  ['/staff', 'staff'],
  ['/audit', 'settings'],          // the access log is an owner/manager screen
  ['/services', 'settings'],
  ['/doctors', 'settings'],
];

/**
 * The clinical parts of a patient's file — the sub-paths a receptionist may not
 * open even though they may open the patient list. Checked against the URL that
 * follows /patients/<id>.
 */
const MEDICAL_SUBPATHS = ['/vitals', '/notes', '/prescriptions', '/trends', '/dental', '/perio'];

/** Build the permission object for this request's session. */
function permsFor(session) {
  const s = session || {};
  const role = s.clinicStaffId ? (s.clinicRole || 'reception') : 'owner';
  const base = ROLES[role] || ROLES.reception;
  return Object.assign({ role, isStaff: !!s.clinicStaffId, name: s.staffName || null }, base);
}

/** The permission a path needs, or null when it only needs a login. */
function needsFor(urlPath) {
  const p = String(urlPath || '').split('?')[0];
  let best = null;
  for (const [prefix, perm] of GUARDED) {
    if ((p === prefix || p.startsWith(prefix + '/')) && (!best || prefix.length > best[0].length)) {
      best = [prefix, perm];
    }
  }
  // Writing INTO a patient's clinical record is a medical action even though
  // the patient list itself is not.
  if (/^\/patients\/\d+(\/|$)/.test(p)) {
    const rest = p.replace(/^\/patients\/\d+/, '');
    if (MEDICAL_SUBPATHS.some((m) => rest === m || rest.startsWith(m + '/'))) return 'medical';
  }
  return best ? best[1] : null;
}

/** Express middleware: refuse a path this session's role may not reach. */
function guard() {
  return function permGuard(req, res, next) {
    const perms = req.perms || permsFor(req.session);
    const need = needsFor(req.path);
    if (!need || perms[need]) return next();
    if (req.method === 'GET') {
      return res.status(403).render('clinic_admin/denied', {
        company: req.company, tab: '', need, perms,
      });
    }
    return res.status(403).send('403');
  };
}

module.exports = { ROLES, ROLE_KEYS, GUARDED, MEDICAL_SUBPATHS, permsFor, needsFor, guard };
