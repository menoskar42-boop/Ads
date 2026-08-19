'use strict';
/**
 * Who on a shop's team may see what.
 *
 * The fifth system to need this, and the same story every time: everything ran
 * on the owner's single login, so whoever packs the orders, whoever writes the
 * product descriptions and whoever runs the discounts all had the owner's
 * reach — the takings, the customers' addresses, the payment credentials, the
 * subscription that pays for the whole thing. A shop will not hand that login
 * to somebody who joined last week, so in practice only the owner used it.
 *
 * `src/food/perms.js` and `src/gym/perms.js` are the template on purpose: same
 * vocabulary, same enforcement, one idea to learn.
 *
 * The one difference worth stating: the company panel is where the OWNER's own
 * things live — billing, the plan, the page's identity, the payment keys. Those
 * are not a permission any role gets; they are owner-only, and a staff session
 * is refused there whatever role it carries.
 */

/** The four roles a shop can hand out, and what each may reach. */
const ROLES = {
  // Everything, including the owner-only pages. This is the account that pays.
  owner:     { orders: true,  catalog: true,  marketing: true,  customers: true,  reports: true,  staff: true,  owner: true },
  // Runs the shop day to day: orders, catalogue, discounts, the numbers.
  // Not the billing, the plan, or who else has an account.
  manager:   { orders: true,  catalog: true,  marketing: true,  customers: true,  reports: true,  staff: false, owner: false },
  // Packs and dispatches: the orders, the returns, the messages that come with
  // them. Not the prices, not the discounts, not the month's figures.
  orders:    { orders: true,  catalog: false, marketing: false, customers: true,  reports: false, staff: false, owner: false },
  // Writes the shop: products, categories, photos, the pages. Never the
  // customers' addresses and phone numbers — a copywriter has no need of them.
  catalog:   { orders: false, catalog: true,  marketing: false, customers: false, reports: false, staff: false, owner: false },
  // Runs the discounts, the campaigns and the pixels, and reads the analytics.
  // Cannot change a price or open an order.
  marketing: { orders: false, catalog: false, marketing: true,  customers: false, reports: true,  staff: false, owner: false },
};

const ROLE_KEYS = Object.keys(ROLES).filter((r) => r !== 'owner');

/**
 * Path prefix -> the permission it needs.
 *
 * Longest match wins. Anything not listed needs only a login — and the
 * owner-only pages are listed EXPLICITLY rather than left out, because a page
 * about money must never be reachable by omission.
 */
const GUARDED = [
  ['/orders', 'orders'],
  ['/returns', 'orders'],
  ['/abandoned', 'orders'],
  ['/shipping', 'orders'],
  ['/products', 'catalog'],
  ['/categories', 'catalog'],
  ['/content', 'catalog'],
  ['/banners', 'catalog'],
  ['/portfolio', 'catalog'],
  ['/deals', 'marketing'],
  ['/coupons', 'marketing'],
  ['/giftcards', 'marketing'],
  ['/marketing', 'marketing'],
  ['/push', 'marketing'],
  ['/analytics', 'reports'],
  ['/reports', 'reports'],
  ['/messages', 'customers'],
  ['/questions', 'customers'],
  ['/subscriptions', 'customers'],
  ['/staff', 'staff'],
  // The owner's own: billing, the plan, the page identity, the currencies and
  // the payment keys behind them.
  ['/profile', 'owner'],
  ['/features', 'owner'],
  ['/company', 'owner'],
  ['/landing', 'owner'],
  ['/currencies', 'owner'],
];

/** Where a role lands after login: the first screen it can actually open. */
function homeFor(perms) {
  if (perms && perms.orders) return '/company/orders';
  if (perms && perms.catalog) return '/company/products';
  if (perms && perms.marketing) return '/company/coupons';
  if (perms && perms.customers) return '/company/messages';
  return '/company/analytics';
}

/** Build the permission object for this request's session. */
function permsFor(session) {
  const s = session || {};
  const role = s.shopStaffId ? (s.shopRole || 'orders') : 'owner';
  const base = ROLES[role] || ROLES.orders;
  return Object.assign({ role, isStaff: !!s.shopStaffId, name: s.staffName || null }, base);
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

/**
 * Express middleware: refuse a path this session's role may not reach.
 *
 * It does nothing at all for the owner's own session — this is invisible until
 * somebody hands out an account.
 */
function guard() {
  return function shopPermGuard(req, res, next) {
    if (!(req.session && req.session.shopStaffId)) return next();
    const perms = req.perms || permsFor(req.session);
    const need = needsFor(req.path);
    if (!need || perms[need]) return next();
    if (req.method === 'GET') {
      return res.status(403).render('company/denied', {
        company: req.company || null, session: req.session, need, perms, home: homeFor(perms),
      });
    }
    return res.status(403).send('403');
  };
}

module.exports = { ROLES, ROLE_KEYS, GUARDED, permsFor, needsFor, homeFor, guard };
