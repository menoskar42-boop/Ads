'use strict';
/**
 * Cross-site request forgery — the part `SameSite=Lax` does not cover.
 *
 * The session cookie is already `sameSite: 'lax'`, so a form auto-submitted
 * from `attacker.com` arrives with no cookie and no session. That closes the
 * classic attack, and it is why this file is not a full token scheme.
 *
 * What it does not close is the one this platform actually has: **every tenant
 * lives on a subdomain of the same site**. `evil.oscardevs.com` and
 * `oscardevs.com` are same-site as far as the cookie is concerned, so a
 * merchant we host can put a form on their own page that POSTs into
 * `/company/…` or `/admin/…` and the victim's cookie rides along. Lax sees
 * nothing wrong. A token in every form would fix it — and would also mean
 * editing several hundred templates, where the one form somebody forgets is
 * the one that stays exploitable.
 *
 * The browser already tells us what we need. On any cross-origin form POST it
 * sends `Origin`, and it sends the ORIGIN, not the site — so a request from
 * `https://evil.oscardevs.com` to `oscardevs.com` is visibly not from us. One
 * comparison, mounted once, covers every route including the ones not written
 * yet.
 *
 * Three details that decide whether this is safe or just noisy:
 *
 *  · **Absent Origin is allowed.** An attacker cannot suppress `Origin` on a
 *    cross-origin browser POST — `Referrer-Policy` hides `Referer` but never
 *    `Origin`. So "neither header" means the request did not come from another
 *    page in a browser: a mobile app, curl, a webhook. Rejecting those would
 *    break real clients to prevent an attack that cannot be mounted that way.
 *
 *  · **The host comes from the same place the app's own routing takes it**
 *    (`x-tenant-host` first), or a request Cloudflare rewrote would fail
 *    against its own subdomain.
 *
 *  · **Server-to-server callbacks are exempt by path.** A payment gateway does
 *    not send `Origin`, and it is HMAC-verified anyway — a stronger proof of
 *    where it came from than this middleware could ever be.
 */

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/* Verified by a shared secret instead — see the HMAC check in each handler. */
const EXEMPT = [
  '/shop/pay/paymob/callback',
  '/order/pay/paymob/callback',
];

/** The host the app itself considers this request to be for. */
function hostOf(req) {
  const raw = (req.headers && req.headers['x-tenant-host'])
    || req.hostname || (req.headers && req.headers.host) || '';
  return String(raw).toLowerCase().split(':')[0].trim();
}

/**
 * The host a browser says the submitting page was on, '' if it said nothing.
 * An unparseable value returns a token that can never equal a real host, so a
 * malformed header fails closed instead of falling into the "not a browser"
 * branch.
 */
function originHostOf(req) {
  const h = req.headers || {};
  const o = h.origin;
  // "null" is what a sandboxed iframe or a data: page sends. It is not us.
  if (o && o !== 'null') {
    try { return new URL(o).hostname.toLowerCase(); } catch (e) { return '?unparseable'; }
  }
  const r = h.referer || h.referrer;
  if (r) {
    try { return new URL(r).hostname.toLowerCase(); } catch (e) { return '?unparseable'; }
  }
  return '';
}

function guard(options) {
  const opts = options || {};
  const exempt = EXEMPT.concat(opts.exempt || []);
  return function csrfGuard(req, res, next) {
    if (SAFE.has(req.method)) return next();
    const p = req.path || '';
    if (exempt.some((e) => p === e || p.endsWith(e))) return next();

    const from = originHostOf(req);
    if (!from) return next();            // not a page in a browser — see above
    if (from === hostOf(req)) return next();

    console.warn('[csrf] refused', req.method, p, 'from', from, 'to', hostOf(req));
    // A short, honest page. A redirect would hide it, and the person needs to
    // know the click did nothing rather than assume it worked.
    res.status(403);
    if (req.accepts && req.accepts('html')) {
      return res.send('<!doctype html><meta charset="utf-8"><title>403</title>'
        + '<p style="font:16px/1.6 system-ui;padding:2rem;direction:rtl">'
        + 'الطلب ده جه من صفحة تانية مش من الموقع، فاتوقف. '
        + 'لو انت اللي عملته، افتح الصفحة من الموقع وجرّب تاني.</p>');
    }
    return res.json({ ok: false, error: 'csrf' });
  };
}

module.exports = { guard, hostOf, originHostOf, SAFE, EXEMPT };
