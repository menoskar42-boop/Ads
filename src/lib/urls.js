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

module.exports = { getBaseDomains, isProductionHost, matchedBase, canonicalCompanyUrl };
