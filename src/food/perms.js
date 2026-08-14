'use strict';
/**
 * Who in a restaurant may see what.
 *
 * Same story as the clinic, one floor down: everything ran on the owner's single
 * login, so the cashier at the till, the tablet on the kitchen wall and the
 * driver's phone all had the owner's reach — the menu prices, the coupons, the
 * day's takings, the AI subscription. A restaurant will not hand that login to a
 * delivery rider, so in practice nobody but the owner could use the system,
 * which is the opposite of what a shift needs.
 *
 * The clinic's module is the template deliberately — same vocabulary, same
 * enforcement — so there is one idea to learn and not two.
 *
 * The enforcement is the part worth copying. `if (!req.perms.x) return 403`
 * spread over twenty routes gives nineteen guarded routes and one everybody
 * forgets. So permission hangs off a PATH PREFIX and one middleware applies it:
 * a route added under /food/reports next year is covered by where it lives, not
 * by whether someone remembered.
 */

/** The four roles, and what each may reach. */
const ROLES = {
  // Everything. The account that pays for the restaurant.
  owner:    { orders: true,  kitchen: true,  menu: true,  finance: true,  marketing: true,  staff: true },
  // Runs the shift: takes orders, works the kitchen screen, fixes the menu when
  // something runs out, and closes the till at the end of the night. Not the
  // staff accounts — those belong to the owner.
  manager:  { orders: true,  kitchen: true,  menu: true,  finance: true,  marketing: true,  staff: false },
  // The till. Takes and advances orders. The menu, the coupons and the takings
  // are not a cashier's screen.
  cashier:  { orders: true,  kitchen: true,  menu: false, finance: false, marketing: false, staff: false },
  // The kitchen tablet, mounted on a wall where anyone standing in the kitchen
  // can read it. It gets the KDS and NOTHING else — deliberately, because the
  // orders list carries the customer's name, phone and address and a wall
  // screen is the worst possible place for them.
  kitchen:  { orders: false, kitchen: true,  menu: false, finance: false, marketing: false, staff: false },
  // The rider's phone: needs the order, the address and the phone number to
  // deliver it, and nothing else.
  delivery: { orders: true,  kitchen: false, menu: false, finance: false, marketing: false, staff: false },
};

const ROLE_KEYS = Object.keys(ROLES).filter((r) => r !== 'owner');

/**
 * Path prefix → the permission it needs.
 *
 * Longest match wins, so a more specific prefix can be stricter than its
 * parent. Anything not listed needs only a login.
 */
const GUARDED = [
  ['/orders', 'orders'],
  ['/kds', 'kitchen'],
  ['/menu', 'menu'],
  ['/outlet', 'menu'],
  ['/category', 'menu'],
  ['/item', 'menu'],
  ['/coupons', 'marketing'],
  ['/ai', 'marketing'],
  ['/reports', 'finance'],
  ['/staff', 'staff'],
];

/**
 * Where a role lands after login. The kitchen tablet may not open the orders
 * list, so sending everyone to /food/orders would greet the kitchen with a
 * locked door on every sign-in.
 */
function homeFor(perms) {
  if (perms && perms.orders) return '/food/orders';
  if (perms && perms.kitchen) return '/food/kds';
  if (perms && perms.menu) return '/food/menu';
  return '/food/reports';
}

/** Build the permission object for this request's session. */
function permsFor(session) {
  const s = session || {};
  const role = s.foodStaffId ? (s.foodRole || 'cashier') : 'owner';
  const base = ROLES[role] || ROLES.cashier;
  return Object.assign({ role, isStaff: !!s.foodStaffId, name: s.staffName || null }, base);
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
  return function foodPermGuard(req, res, next) {
    const perms = req.perms || permsFor(req.session);
    const need = needsFor(req.path);
    if (!need || perms[need]) return next();
    if (req.method === 'GET') {
      return res.status(403).render('food_admin/denied', {
        company: req.company, session: req.session, need, perms,
        home: homeFor(perms), pendingOrders: 0,
      });
    }
    return res.status(403).send('403');
  };
}

module.exports = { ROLES, ROLE_KEYS, GUARDED, permsFor, needsFor, homeFor, guard };
