function getBaseDomains() {
  const env = process.env.PUBLIC_BASE_DOMAINS || process.env.PUBLIC_BASE_DOMAIN || '';
  const fromEnv = env.split(',').map(s => s.trim()).filter(Boolean);
  return fromEnv.length ? fromEnv : ['oscardevsads.replit.app', 'oscardevs.com'];
}

function isProductionHost(req) {
  const host = (req.hostname || '').toLowerCase();
  if (!host) return false;
  if (host.endsWith('.replit.dev') || host === 'replit.dev') return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  return getBaseDomains().some(b => host === b || host.endsWith('.' + b));
}

function matchedBase(req) {
  const host = (req.hostname || '').toLowerCase();
  return getBaseDomains().find(b => host === b || host.endsWith('.' + b)) || null;
}

function canonicalCompanyUrl(slug, req) {
  if (!slug) return '/';
  const safeSlug = encodeURIComponent(slug);
  const base = isProductionHost(req) ? matchedBase(req) : null;
  return base ? `https://${slug}.${base}` : `/view/${safeSlug}`;
}

/**
 * A URL for a page INSIDE a company's site.
 *
 * `canonicalCompanyUrl` deliberately returns no trailing slash, so every caller
 * that wanted a sub-page wrote `base + 'doctor/' + slug` and produced
 * `https://clinic.oscardevs.comdoctor/ahmed` — a dead address. That string was
 * the canonical, the og:url and the JSON-LD `url` on EVERY doctor page of
 * EVERY clinic, so Google was being pointed at a 404 for all of them.
 *
 * Joining is not the caller's job. One slash, always, whichever base is in
 * play — the production subdomain or the /view/<slug> path used off-domain.
 */
function companyPageUrl(slug, req, subPath) {
  const base = canonicalCompanyUrl(slug, req);
  const rest = String(subPath || '').replace(/^\/+/, '');
  if (!rest) return base;
  return base.replace(/\/+$/, '') + '/' + rest;
}

module.exports = { getBaseDomains, isProductionHost, matchedBase, canonicalCompanyUrl, companyPageUrl };
