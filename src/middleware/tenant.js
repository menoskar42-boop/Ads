const { Pool } = require('pg');
const { getBaseDomains } = require('../lib/urls');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Any host ending with these suffixes is treated as root (no tenant).
// - *.replit.dev  → Replit dev-preview URLs (UUID-based, never a tenant slug)
// - *.replit.app  → the deployment URL (e.g. oscardevsads.replit.app). Without
//   this, the first label ("oscardevsads") was parsed as a tenant slug, the
//   lookup failed, and the root served a 404 (noindex, no meta description) —
//   which tanked automated SEO audits that test the replit.app domain. Serving
//   the homepage here is safe: its canonical points to oscardevs.com, so the
//   replit.app URL never competes for indexing.
const ROOT_SUFFIXES = ['.replit.dev', 'replit.dev', '.replit.app', 'replit.app'];

function extractSubdomain(hostname) {
  const host = hostname.split(':')[0].toLowerCase();

  // Replit preview / dev URLs → always homepage
  if (ROOT_SUFFIXES.some(s => host === s || host.endsWith('.' + s.replace(/^\./, '')))) {
    return null;
  }

  for (const base of getBaseDomains()) {
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
  // Cloudflare Worker sets X-Tenant-Host with the original subdomain
  // (X-Forwarded-Host gets clobbered by Replit's edge proxy)
  const tenantHost = req.headers['x-tenant-host'];
  const subdomain = extractSubdomain(tenantHost || req.hostname || req.headers.host || '');

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
    // Hand it to the app's error handler instead of writing the response here.
    // This used to send a bare plain-text "Internal Server Error": on a DB blip
    // every merchant subdomain showed a white page with no branding, no way
    // back to the site, and no reference the owner could match to a log line.
    next(err);
  }
}

module.exports = tenantMiddleware;
// `extractSubdomain` هو التعريف الوحيد لـ«ده سَبدومين مستأجر ولا الدومين
// الأساسي». `lang_prefix` محتاجه عشان مايحوّلش صفحة تاجر على `/ar/` —
// وده كان هيكسر الصفحة الرئيسية لكل تاجر عندنا مرة واحدة. نسخة تانية من
// نفس المنطق كانت هتفترق عن دي أول ما يتضاف دومين أساسي جديد.
module.exports.extractSubdomain = extractSubdomain;
