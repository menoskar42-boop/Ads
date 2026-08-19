'use strict';
/**
 * Who in a dietitian's practice may see what.
 *
 * The third and last of the three systems that ran entirely on the owner's
 * login — after the clinic and the restaurant. A nutrition practice is small,
 * usually the dietitian plus somebody at the front desk, which is exactly why
 * it mattered: the assistant who weighs the patient and books the next visit
 * was signing in as the dietitian, so a blood panel and a treatment plan were
 * one click away from the reception desk.
 *
 * Same shape as src/clinic/perms.js and src/food/perms.js — one vocabulary
 * across the three, and permission hangs off a PATH PREFIX so a route added
 * later is guarded by where it lives.
 *
 * The split that matters here is measurement vs. clinical. Weighing somebody
 * and taking a waist measurement IS the assistant's job in a real practice; the
 * lab results, the plan and the printed report are the dietitian's.
 */

/** The roles, and what each may reach. */
const ROLES = {
  // The dietitian. The account that owns the practice.
  owner:     { patients: true,  measure: true,  clinical: true,  settings: true,  staff: true },
  // Front desk with a scale: registers people, records weight and measurements,
  // and never opens a lab result or a plan.
  assistant: { patients: true,  measure: true,  clinical: false, settings: false, staff: false },
  // Books and answers the phone. Contact details only.
  reception: { patients: true,  measure: false, clinical: false, settings: false, staff: false },
};

const ROLE_KEYS = Object.keys(ROLES).filter((r) => r !== 'owner');

/** Path prefix → permission. Longest match wins. */
const GUARDED = [
  ['/patients', 'patients'],
  // المواعيد شغل الاستقبال بالتحديد — «بيحجز وبيرد على التليفون». فبتتحط
  // على نفس صلاحية `patients` مش على `clinical`.
  ['/appointments', 'patients'],
  ['/plans', 'clinical'],
  // القالب العلاجي هو خطة محفوظة — نفس صلاحية الخطة بالظبط، عشان اللي
  // مايقدرش يكتب خطة مايقدرش يمسح القالب اللي الخطط بتتبني منه.
  ['/templates', 'clinical'],
  ['/foods', 'settings'],
  ['/settings', 'settings'],
  ['/staff', 'staff'],
];

/**
 * The parts of a patient's file that belong to the dietitian: the blood work,
 * the plan, the printed report, and handing the patient a portal account (which
 * hands them their own record). Checked against whatever follows /patients/<id>.
 */
const CLINICAL_SUBPATHS = ['/lab', '/report', '/plans', '/login'];

/** And the one part the front desk with a scale does own. */
const MEASURE_SUBPATHS = ['/measure'];

function permsFor(session) {
  const s = session || {};
  const role = s.nutriStaffId ? (s.nutriRole || 'reception') : 'owner';
  const base = ROLES[role] || ROLES.reception;
  return Object.assign({ role, isStaff: !!s.nutriStaffId, name: s.staffName || null }, base);
}

/** The permission a path needs, or null when it only needs a login. */
function needsFor(urlPath) {
  const p = String(urlPath || '').split('?')[0];
  // Sub-paths of a patient file first: they are stricter than /patients itself.
  if (/^\/patients\/\d+(\/|$)/.test(p)) {
    const rest = p.replace(/^\/patients\/\d+/, '');
    const hit = (list) => list.some((m) => rest === m || rest.startsWith(m + '/'));
    if (hit(CLINICAL_SUBPATHS)) return 'clinical';
    if (hit(MEASURE_SUBPATHS)) return 'measure';
  }
  let best = null;
  for (const [prefix, perm] of GUARDED) {
    if ((p === prefix || p.startsWith(prefix + '/')) && (!best || prefix.length > best[0].length)) {
      best = [prefix, perm];
    }
  }
  return best ? best[1] : null;
}

/** Express middleware: refuse a path this session's role may not reach. */
function guard() {
  return function nutriPermGuard(req, res, next) {
    const perms = req.perms || permsFor(req.session);
    const need = needsFor(req.path);
    if (!need || perms[need]) return next();
    if (req.method === 'GET') {
      return res.status(403).render('nutrition_admin/denied', { need, perms });
    }
    return res.status(403).send('403');
  };
}

module.exports = { ROLES, ROLE_KEYS, GUARDED, CLINICAL_SUBPATHS, MEASURE_SUBPATHS, permsFor, needsFor, guard };
