'use strict';

// ── Which sites may be written to, and saying so first ───────────────────────
//
// Consent was asked once, for a plan, in the abstract: "this needs the browser
// — confirm?". What the user actually cares about is WHERE. Approving "book me
// a ticket" is not approving a form on a site they have never heard of, and the
// operator can end up on one by following a link, a redirect, or a sentence
// written on a page.
//
// So the plan's domains are extracted BEFORE consent and shown, and they become
// the allowlist for that run. Reading stays free — opening a page is not
// something you undo — but every WRITE checks the domain it is about to write
// to against the list the user saw.
const pageTrust = require('./pageTrust');

/** Every site a plan intends to touch, in the order it will touch them. */
function domainsOf(plan) {
  const out = [];
  for (const s of ((plan && plan.steps) || [])) {
    const url = s && s.input && (s.input.url || s.input.site);
    const d = pageTrust.domainOf(url) || (typeof url === 'string' && !/\s/.test(url) && /\./.test(url)
      ? pageTrust.domainOf('https://' + url) : '');
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

/**
 * May this run write here?
 *
 * With no allowlist at all the answer is yes: a direct API call or an old
 * session predates this and must not start failing silently — the extension's
 * own per-domain confirmation still stands in front of it. With a list, the
 * domain has to be on it.
 */
function mayWrite(allowed, url) {
  if (!Array.isArray(allowed) || !allowed.length) return true;
  const d = pageTrust.domainOf(url);
  return !!d && allowed.includes(d);
}

/** What the user is told when a write is refused. The domain is the point. */
function refusal(url) {
  const d = pageTrust.domainOf(url) || 'الموقع ده';
  return 'مش هكتب حاجة في «' + d + '» — ده مش الموقع اللي وافقت عليه. '
    + 'لو ده مقصود، اطلبه بالاسم وأنا أسأل من أول.';
}

/** The sentence shown BEFORE the user confirms, naming where the writing goes. */
function consentLine(domains) {
  const list = (domains || []).filter(Boolean);
  if (!list.length) return null;
  return 'هيتم الدخول والكتابة في: ' + list.join(' · ');
}

module.exports = { domainsOf, mayWrite, refusal, consentLine };
