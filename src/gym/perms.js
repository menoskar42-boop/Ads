'use strict';
/**
 * Who in a gym may see what.
 *
 * The same story as the restaurant and the clinic, in a room with weights: the
 * whole panel ran on the owner's single login, so the person on reception, the
 * trainer with a tablet and whoever works the till all had the owner's reach —
 * the takings, the plan prices, the members' phone numbers, the staff accounts.
 * A gym will not hand that login to a part-time trainer, so in practice nobody
 * but the owner used the system, which is the opposite of what a shift needs.
 *
 * `src/food/perms.js` is the template on purpose — same vocabulary, same
 * enforcement — so there is one idea to learn across the whole platform and not
 * five.
 *
 * And the enforcement is the part worth copying: `if (!req.perms.x) return 403`
 * spread over twenty routes gives nineteen guarded routes and one everybody
 * forgets. Permission hangs off a PATH PREFIX and one middleware applies it, so
 * a route added under /gym/reports next year is covered by where it lives.
 */

/** The five roles, and what each may reach. */
const ROLES = {
  // Everything. The account that pays for the gym.
  owner:     { desk: true,  members: true,  classes: true,  pos: true,  finance: true,  settings: true,  staff: true },
  // Runs the place day to day: the desk, the members, the timetable, the till
  // and the numbers. Not the staff accounts — those belong to the owner.
  manager:   { desk: true,  members: true,  classes: true,  pos: true,  finance: true,  settings: true,  staff: false },
  // The front desk: check people in, sell and renew memberships, book classes.
  // The month's takings and the gym's settings are not a reception screen.
  reception: { desk: true,  members: true,  classes: true,  pos: true,  finance: false, settings: false, staff: false },
  // The till and nothing else. It needs the desk to know who is in front of it,
  // and the shop; it does not need the members' files.
  cashier:   { desk: true,  members: false, classes: false, pos: true,  finance: false, settings: false, staff: false },
  // The trainer's tablet: the timetable and who booked. Not phone numbers in
  // bulk, not money, not settings — a tablet left on a bench is the worst place
  // for a member list.
  trainer:   { desk: false, members: false, classes: true,  pos: false, finance: false, settings: false, staff: false },
};

const ROLE_KEYS = Object.keys(ROLES).filter((r) => r !== 'owner');

/**
 * Path prefix → the permission it needs.
 *
 * Longest match wins, so a more specific prefix can be stricter than its
 * parent. Anything not listed needs only a login.
 */
const GUARDED = [
  ['/desk', 'desk'],
  ['/attendance', 'desk'],
  ['/members', 'members'],
  ['/classes', 'classes'],
  ['/bookings', 'classes'],
  ['/trainers', 'classes'],
  ['/pos', 'pos'],
  ['/plans', 'finance'],
  ['/reports', 'finance'],
  ['/settings', 'settings'],
  ['/media', 'settings'],
  ['/staff', 'staff'],
];

/**
 * Where a role lands after login. A trainer may not open the desk, so sending
 * everyone to /gym/desk would greet the trainer with a locked door every time.
 */
function homeFor(perms) {
  if (perms && perms.desk) return '/gym/desk';
  if (perms && perms.classes) return '/gym/classes';
  if (perms && perms.pos) return '/gym/pos';
  return '/gym/reports';
}

/** Build the permission object for this request's session. */
function permsFor(session) {
  const s = session || {};
  const role = s.gymStaffId ? (s.gymRole || 'reception') : 'owner';
  const base = ROLES[role] || ROLES.reception;
  return Object.assign({ role, isStaff: !!s.gymStaffId, name: s.staffName || null }, base);
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
  return best ? best[1] : null;
}

/** Express middleware: refuse a path this session's role may not reach. */
function guard() {
  return function gymPermGuard(req, res, next) {
    const perms = req.perms || permsFor(req.session);
    const need = needsFor(req.path);
    if (!need || perms[need]) return next();
    if (req.method === 'GET') {
      return res.status(403).render('gym_admin/denied', {
        company: req.company, session: req.session, need, perms, tab: '', home: homeFor(perms),
      });
    }
    return res.status(403).send('403');
  };
}

module.exports = { ROLES, ROLE_KEYS, GUARDED, permsFor, needsFor, homeFor, guard };
