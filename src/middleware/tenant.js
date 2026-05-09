const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE_DOMAINS = [
  'oscardevsads.replit.app',
  'oscardevs.com',
];

// Any host ending with these suffixes is treated as root (no tenant)
// Replit dev-preview URLs are UUID-based and never carry tenant slugs
const ROOT_SUFFIXES = ['.replit.dev', 'replit.dev'];

function extractSubdomain(hostname) {
  const host = hostname.split(':')[0].toLowerCase();

  // Replit preview / dev URLs → always homepage
  if (ROOT_SUFFIXES.some(s => host === s || host.endsWith('.' + s.replace(/^\./, '')))) {
    return null;
  }

  for (const base of BASE_DOMAINS) {
    // Exact root domain or www → homepage
    if (host === base || host === `www.${base}`) return null;

    // Subdomain of a known base: slug.base → return slug
    if (host.endsWith(`.${base}`)) {
      const sub = host.slice(0, host.length - base.length - 1);
      if (!sub || sub === 'www') return null;
      return sub;
    }
  }

  // Local dev fallback: sub.domain.tld (3 parts)
  const parts = host.split('.');
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (sub === 'www') return null;
  return sub;
}

async function tenantMiddleware(req, res, next) {
  const subdomain = extractSubdomain(req.hostname || req.headers.host || '');

  if (!subdomain) {
    return next();
  }

  try {
    const result = await pool.query(
      'SELECT * FROM companies WHERE slug = $1 AND is_active = true',
      [subdomain]
    );

    if (result.rows.length === 0) {
      return res.status(404).render('404', { subdomain });
    }

    const company = result.rows[0];

    const adsResult = await pool.query(
      'SELECT * FROM banner_ads WHERE company_id = $1 AND is_active = true',
      [company.id]
    );

    req.tenant = company;
    req.tenantAds = adsResult.rows;
    next();
  } catch (err) {
    console.error('Tenant lookup error:', err);
    res.status(500).send('Internal Server Error');
  }
}

module.exports = tenantMiddleware;
