require('dotenv').config();

// Deploy-stability backstop: Node 22 crashes the process on an unhandled promise
// rejection, which on Replit Autoscale turns a background failure (e.g. an
// optional SDK's async init that can't reach its sidecar) into a boot-time
// healthcheck 500 → crash loop. Log these instead of dying. Real request errors
// are still handled by Express' error middleware; this only catches stray
// background rejections that would otherwise take the whole deploy down.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', (reason && reason.stack) || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', (err && err.stack) || err);
});

// compression is optional — if it isn't installed yet (e.g. node_modules
// not refreshed after a pull) the app must still boot, just without gzip.
let compression;
try {
  compression = require('compression');
} catch (e) {
  console.warn('compression module not available — continuing without gzip:', e.message);
  compression = () => (req, res, next) => next();
}
const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const i18nMiddleware = require('./src/middleware/i18n');
const tenantMiddleware = require('./src/middleware/tenant');
const indexRouter = require('./src/routes/index');
const tenantRouter = require('./src/routes/tenant');
const companyRouter = require('./src/routes/company');
const pharmacyAdminRouter = require('./src/routes/pharmacy_admin');
const foodAdminRouter = require('./src/routes/food_admin');
const clinicAdminRouter = require('./src/routes/clinic_admin');
const adminRouter = require('./src/routes/admin');
const shopRouter = require('./src/routes/shop');
const customerRouter = require('./src/routes/customer');
const applyRouter = require('./src/routes/apply');
const legalRouter = require('./src/routes/legal');
const blogRouter = require('./src/routes/blog');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust Cloudflare Worker proxy headers (X-Forwarded-Host, X-Forwarded-Proto)
// so req.hostname reflects the original tenant subdomain (e.g. delta.oscardevs.com).
app.set('trust proxy', true);

// ===== Safari Kids Adventure (mykid.oscardevs.com) — merged, host-routed =====
// A separate ESM Express app serves the kids PWA on its own subdomain. It's
// loaded dynamically (ES module) and fully handles any request to mykid.* —
// so it never touches OscarDevs' middleware/session/AdSense. This keeps the
// child-directed app ad-free (COPPA-safe) and lets one deployment host both.
let safariApp = null;
const safariReady = import('./mykid/server/app.mjs')
  .then((m) => { safariApp = m.default; console.log('🦁 Safari Kids (mykid) app loaded'); })
  .catch((e) => { console.error('Safari Kids app failed to load:', (e && e.stack) || e); });

app.use(async (req, res, next) => {
  // The Cloudflare Worker passes the real subdomain in X-Tenant-Host, because
  // Replit's edge proxy clobbers X-Forwarded-Host (so req.hostname is NOT the
  // tenant host). Read the same source the tenant middleware uses.
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('mykid.')) return next();
  // The app opens the port immediately (before the async import resolves), so a
  // mykid request on a cold start could arrive first. Wait for the import here
  // instead of falling through to the tenant router (which would 404 "no company
  // named mykid"). If the import genuinely failed, show 503 — never the tenant 404.
  if (!safariApp) { try { await safariReady; } catch (_e) {} }
  if (safariApp) return safariApp(req, res, next);
  return res.status(503).type('text/plain; charset=utf-8')
    .send('Safari Kids is starting up — please refresh in a moment.');
});

// ===== Co-hosted apps gateway (e.g. mybible.oscardevs.com) — host-routed =====
// Reverse-proxies a co-hosted app's subdomain to that app running as its own
// process on the same Reserved VM (same pattern as mykid above, but the app
// stays a fully separate process so it runs byte-for-byte unchanged — same DB,
// same sessions). DISABLED unless its upstream env var (MYBIBLE_UPSTREAM) is
// set, so this is a complete no-op for the live site until we deliberately
// enable it. Placed before all OscarDevs middleware so a co-hosted host never
// touches OscarDevs' session/tenant/AdSense pipeline.
const { createHostGateway } = require('./src/lib/host_gateway');
const __hostGateway = createHostGateway();
if (__hostGateway) app.use(__hostGateway);

// ===== NeuroPilot (adhd.oscardevs.com) — ADHD focus timer, host-routed =====
// A fully client-side focus-timer (localStorage only — no DB, no API, no
// account). Rewritten natively for OscarDevs' stack and served as static
// files on its own subdomain, ahead of all OscarDevs middleware, so it never
// touches the session/tenant/AdSense pipeline. Kept ad-free like mykid.
const fs = require('fs');
const neuroDir = path.join(__dirname, 'neuropilot');
// Per-boot cache-busting token. Changes on every deploy (server restart), so
// the versioned CSS/JS URLs below are always fresh after a Republish. This is
// what stops a browser/CDN from serving a stale styles.css: the app uses fixed
// filenames (no build-time hashing like the old Vite version), so without a
// version query a cached styles.css would hide layout updates indefinitely.
const NEURO_VERSION = String(Date.now());
const neuroStatic = express.static(neuroDir, {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (/\.(?:svg|wav|png|ico|webmanifest)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800'); // immutable-ish
    } else {
      res.setHeader('Cache-Control', 'no-cache'); // css/js/sw: always revalidate
    }
  },
});
// Serve the SPA shell with versioned asset links injected, so /styles.css and
// /app.js resolve to brand-new URLs on every deploy — impossible to cache stale.
function sendNeuroIndex(res) {
  fs.readFile(path.join(neuroDir, 'index.html'), 'utf8', (err, html) => {
    if (err) return res.status(500).type('text/plain').send('NeuroPilot failed to load.');
    const out = html
      .replace('/styles.css', '/styles.css?v=' + NEURO_VERSION)
      .replace('/app.js', '/app.js?v=' + NEURO_VERSION);
    res.type('html').set('Cache-Control', 'no-cache').send(out);
  });
}
const neuroPush = require('./src/lib/neuropilot_push');
const neuroJson = express.json({ limit: '16kb' });
app.use((req, res, next) => {
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('adhd.')) return next();
  const p = req.path;
  // Web Push API (served on the adhd subdomain, ahead of the static fallback).
  // This block runs before the global JSON parser, so parse inline where needed.
  if (p === '/push/key') {
    return res.json({ enabled: neuroPush.isEnabled(), publicKey: neuroPush.publicKey() });
  }
  if (p === '/push/subscribe' && req.method === 'POST') {
    return neuroJson(req, res, () => {
      neuroPush.saveSub(req.body && req.body.subscription)
        .then((ok) => res.json({ ok: !!ok }))
        .catch(() => res.status(500).json({ ok: false }));
    });
  }
  if (p === '/push/unsubscribe' && req.method === 'POST') {
    return neuroJson(req, res, () => {
      neuroPush.removeSub(req.body && req.body.endpoint)
        .then(() => res.json({ ok: true })).catch(() => res.json({ ok: true }));
    });
  }
  if (p === '/' || p === '/index.html') return sendNeuroIndex(res);
  // Serve a matching static asset; otherwise return a real 404. NeuroPilot is a
  // single page (only "/"), so falling back to the shell for made-up URLs made
  // invalid links look like valid 200 pages to crawlers (soft-404 → wasted crawl
  // budget). A true 404 keeps the index clean.
  neuroStatic(req, res, () => {
    res.status(404).type('html').send(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>404 — NeuroPilot</title></head><body style="font-family:system-ui;background:#0b1020;color:#fff;text-align:center;padding:80px 20px">' +
      '<h1>٤٠٤ — الصفحة غير موجودة</h1><p><a href="/" style="color:#22d3ee">ارجع لـ NeuroPilot</a></p></body></html>'
    );
  });
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Cache-busting token for static assets — changes on every server start,
// so a new deploy always serves fresh CSS/JS instead of a stale CDN copy.
app.locals.assetVersion = Date.now();

app.use(compression());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());

// NeuroPilot daily-push external trigger — mounted BEFORE tenant routing so it
// isn't swallowed as an unknown-tenant 404. Call it every morning from an
// external scheduler (cron-job.org / UptimeRobot): the reliable way to fire the
// push on scale-to-zero hosting (Replit Autoscale sleeps → internal cron won't
// run). Protected by PUSH_CRON_SECRET; disabled (503) until that secret is set.
app.all('/api/neuropilot/run-daily', async (req, res) => {
  const secret = process.env.PUSH_CRON_SECRET || '';
  if (!secret) return res.status(503).json({ ok: false, error: 'PUSH_CRON_SECRET not set' });
  const provided = req.query.key || req.get('x-cron-key') || '';
  if (provided !== secret) return res.status(403).json({ ok: false, error: 'bad key' });
  try {
    const r = await neuroPush.sendDaily({ force: 'force' in req.query });
    res.json(r);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Subscriptions daily renewal — external trigger (reliable on scale-to-zero).
// Same secret as the push cron. Point cron-job.org at this once a day.
app.all('/api/subscriptions/run-daily', async (req, res) => {
  const secret = process.env.PUSH_CRON_SECRET || '';
  if (!secret) return res.status(503).json({ ok: false, error: 'PUSH_CRON_SECRET not set' });
  const provided = req.query.key || req.get('x-cron-key') || '';
  if (provided !== secret) return res.status(403).json({ ok: false, error: 'bad key' });
  try {
    const r = await require('./src/lib/subscriptions').runDueRenewals();
    res.json({ ok: true, ...r });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ===== Sokro (sokro.oscardevs.com) — AI Operating System, host-routed =====
// Its own product (voice-driven task execution). Mounted BEFORE express.static
// so the subdomain serves its own robots.txt/sitemap.xml (a physical
// public/robots.txt would otherwise be served for every host). It uses its own
// JWT-cookie auth — not express-session — so the body parsers + cookieParser
// above are all it needs; it stays fully isolated from the OscarDevs pipeline.
const sokroRouter = require('./sokro/router');
app.use((req, res, next) => {
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('sokro.')) return next();
  return sokroRouter(req, res, next);
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    // SECURITY: user-uploaded files live under /uploads. Neutralize active
    // content (e.g. an SVG/HTML file with an embedded <script>) if it's opened
    // directly as a top-level document: the sandbox CSP blocks script execution
    // and nosniff prevents MIME confusion. This does NOT affect legitimate
    // inline <img> embedding (a sub-resource's CSP is ignored by the browser).
    if (/[\\/]uploads[\\/]/.test(filePath)) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    if (/(?:robots\.txt|sitemap[^/]*\.xml)$/i.test(filePath)) {
      // SEO control files must always revalidate — a 7-day cache made a stale
      // robots.txt/sitemap stick in the browser/CDN long after a deploy.
      res.setHeader('Cache-Control', 'no-cache');
    } else if (/\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else if (/\.(?:css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

// Persistent-storage fallback for uploads: the local filesystem is ephemeral on
// Autoscale (files wiped on redeploy), so if express.static above 404s an
// /uploads file, serve it from Object Storage instead. Keeps merchant logos /
// product images / banners alive across deploys.
const _objStore = require('./src/lib/object_store');
app.get('/uploads/:file', async (req, res, next) => {
  if (!_objStore.enabled()) return next();
  try {
    const buf = await _objStore.get(req.params.file);
    if (!buf) return next();
    const ext = path.extname(req.params.file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp'
      : ext === '.gif' ? 'image/gif' : ext === '.mp4' ? 'video/mp4'
      : (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=2592000');
    return res.send(buf);
  } catch (_) { return next(); }
});
// Persistent session store in Postgres so logins/saves survive cold starts and
// instance recycling on Autoscale (the default MemoryStore loses every session
// on restart → intermittent logouts and silently-failing POST saves).
const { Pool: SessionPool } = require('pg');
const sessionPool = new SessionPool({ connectionString: process.env.DATABASE_URL });
const sessionStore = require('./src/lib/pg_session_store')(session, sessionPool);
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'oscardevs-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' },
}));

// ===== Kakeibo (kakeibo.oscardevs.com) — AI financial coach, host-routed =====
// Its own product: runs after the shared session/body parsers but before the
// OscarDevs i18n/tenant/ads pipeline, so it never mixes with the merchant site.
const kakeiboRouter = require('./src/kakeibo/router');
app.use((req, res, next) => {
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('kakeibo.')) return next();
  return kakeiboRouter(req, res, next);
});


app.use(i18nMiddleware);
app.use(require('./src/middleware/urls'));

// Normalize URLs: strip trailing slash(es) and stray trailing punctuation
// (e.g. "/apply،" from auto-linkified posts, or "/blog/x/") and 301-redirect to
// the clean canonical path. Prevents 404s from malformed links + duplicate URLs (SEO).
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.length > 1) {
    // req.path is percent-encoded (e.g. "/apply%D8%8C" for a trailing Arabic
    // comma), so decode before matching, then re-encode the cleaned path.
    let dec;
    try { dec = decodeURIComponent(req.path); } catch (e) { return next(); }
    const cleaned = dec.replace(/[/.,،]+$/u, '');
    if (cleaned && cleaned !== dec) {
      const query = req.originalUrl.slice(req.path.length);
      const target = cleaned.split('/').map(encodeURIComponent).join('/');
      return res.redirect(301, target + query);
    }
  }
  next();
});

// SEO/canonical + central AdSense config exposed to every view. All ad
// units across the platform (main site + every tenant) read slot ids
// from this single object so OscarDevs' AdSense account serves the lot.
const adsConfig = require('./src/config/ads');
app.use((req, res, next) => {
  const origin = process.env.SITE_ORIGIN || 'https://oscardevs.com';
  res.locals.siteOrigin = origin;
  res.locals.canonicalUrl = origin + req.originalUrl.split('?')[0].split('#')[0];
  res.locals.ads = adsConfig;
  // Default OFF — AdSense loads only on content pages that opt in (fail-closed
  // so prohibited pages like login/dashboards/checkout/404 never show ads).
  res.locals.showAds = false;
  next();
});

// Bare /company has no page of its own → send to login (avoids 404).
app.get('/company', (req, res) => res.redirect('/company/login'));

// Company dashboard must be before tenant middleware
app.use('/company', companyRouter);
app.use('/accounting', require('./src/routes/accounting'));
app.use('/pharmacy', pharmacyAdminRouter);
app.use('/food', foodAdminRouter);
app.use('/clinic', clinicAdminRouter);
app.use('/gym', require('./src/routes/gym_admin'));
app.use('/radiology', require('./src/routes/radiology'));

// Super admin panel must be before tenant middleware too
app.use('/admin', adminRouter);

// Shop and customer routers — also before tenant middleware
app.use('/shop', shopRouter);
app.use('/customer', customerRouter);

// Public content routes (apply form, legal pages, blog, sitemap) — before tenant middleware
app.use('/', applyRouter);
app.use('/', legalRouter);
app.use('/', blogRouter);

// Tenant detection: runs on every non-company request
app.use(tenantMiddleware);

// If req.tenant is set, render the tenant page
app.use((req, res, next) => {
  if (req.tenant) {
    res.locals.showAds = true; // tenant shop/portfolio pages are content
    return tenantRouter(req, res, next);
  }
  next();
});

// Main platform homepage
app.use('/', indexRouter);

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { subdomain: null });
});

async function initDb() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        theme_color TEXT DEFAULT '#2563eb',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS banner_ads (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        position TEXT, image_url TEXT, target_url TEXT,
        is_active BOOLEAN DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS company_users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS portfolio_items (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        title TEXT, description TEXT, image_url TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        sender_name TEXT NOT NULL,
        sender_email TEXT,
        sender_phone TEXT,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS sender_phone TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS page_type TEXT DEFAULT 'portfolio';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EGP';
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name TEXT NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        image_url TEXT,
        stock INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        phone TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        customer_id INTEGER REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        shipping_address TEXT NOT NULL,
        total_amount NUMERIC(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name TEXT NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL,
        quantity INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS product_categories (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id),
        change_amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        notes TEXT,
        order_id INTEGER REFERENCES orders(id),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS banner_slides (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        image_url TEXT NOT NULL,
        target_url TEXT,
        caption TEXT,
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS signup_applications (
        id SERIAL PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL,
        country TEXT,
        business_name TEXT NOT NULL,
        business_type TEXT NOT NULL,
        preferred_slug TEXT NOT NULL,
        description TEXT,
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        reviewer_id INTEGER REFERENCES admins(id),
        reviewed_at TIMESTAMPTZ,
        accepted_terms_version TEXT NOT NULL,
        accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        accepted_ip TEXT,
        user_agent TEXT,
        approved_company_id INTEGER REFERENCES companies(id),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      -- Carries a referrer's code from /apply?ref=… through review, so the
      -- bonus months can be granted at approval time.
      ALTER TABLE signup_applications ADD COLUMN IF NOT EXISTS referral_code TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES product_categories(id);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_top TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_sidebar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_bottom TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE company_users ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS content_i18n BOOLEAN DEFAULT false;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name_ar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name_en TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS description_ar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS description_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS name_ar TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_type TEXT DEFAULT 'unit';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sizes TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'كجم';
      ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url TEXT;
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_push_subs_company ON push_subscriptions(company_id);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_messages BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS notify_orders BOOLEAN DEFAULT true;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS description_ar TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS description_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sold_count INTEGER NOT NULL DEFAULT 0;
      -- Reviews (Amazon roadmap phase 4): aggregates cached on the product row.
      ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS review_count INTEGER NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS product_reviews (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
        rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        title       TEXT,
        body        TEXT,
        author_name TEXT,
        is_verified BOOLEAN NOT NULL DEFAULT true,
        is_approved BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON product_reviews (product_id, is_approved);
      -- Wishlist (Amazon roadmap phase 6).
      CREATE TABLE IF NOT EXISTS wishlist_items (
        id          SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (customer_id, product_id)
      );
      CREATE INDEX IF NOT EXISTS idx_wishlist_customer ON wishlist_items (customer_id);
      -- Customer saved addresses (Amazon roadmap phase 13).
      CREATE TABLE IF NOT EXISTS customer_addresses (
        id             SERIAL PRIMARY KEY,
        customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        label          TEXT,
        recipient_name TEXT,
        phone          TEXT,
        governorate    TEXT,
        city           TEXT,
        street         TEXT,
        apartment      TEXT,
        notes          TEXT,
        is_default     BOOLEAN NOT NULL DEFAULT false,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_customer_addresses ON customer_addresses (customer_id);
      -- Product Q&A (Amazon roadmap phase 17).
      CREATE TABLE IF NOT EXISTS product_questions (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        author_name TEXT,
        question    TEXT NOT NULL,
        answer      TEXT,
        answered_at TIMESTAMPTZ,
        is_approved BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_questions ON product_questions (product_id, is_approved);
      -- Loyalty points (Amazon roadmap phase 19).
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_redeemed INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0;
      -- Order status tracking (Amazon roadmap phase 15).
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cod';
      -- Marketing pixels + product feed (competitor phase 24).
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS fb_pixel_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS tiktok_pixel_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS ga4_id TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
      -- Store wallet / gift-card credit per customer (competitor phase 31).
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS wallet_used NUMERIC(10,2) NOT NULL DEFAULT 0;
      -- Abandoned checkout recovery (competitor phase 26). One live snapshot per
      -- customer+store; deleted on a completed order, so rows here = carts that
      -- reached checkout but never converted. Merchant sends a manual reminder.
      CREATE TABLE IF NOT EXISTS abandoned_carts (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id   INTEGER REFERENCES customers(id) ON DELETE CASCADE,
        customer_name TEXT,
        customer_phone TEXT,
        items_summary TEXT,
        total         NUMERIC(10,2) NOT NULL DEFAULT 0,
        item_count    INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, customer_id)
      );
      CREATE INDEX IF NOT EXISTS idx_abandoned_carts ON abandoned_carts (company_id, updated_at DESC);
      -- Store analytics (competitor phase 29): one row per storefront page view,
      -- with the referrer host bucketed to a traffic source. Fire-and-forget
      -- insert; used for visits/conversion/top-source dashboards.
      CREATE TABLE IF NOT EXISTS store_visits (
        id          BIGSERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        kind        TEXT NOT NULL DEFAULT 'store',
        source      TEXT NOT NULL DEFAULT 'direct',
        visited_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_store_visits ON store_visits (company_id, visited_at DESC);
      -- Multi-currency display (competitor phase 33). Base currency stays
      -- companies.currency; these are display-only conversions. rate = how many
      -- units of this currency equal ONE base unit (display = base * rate).
      CREATE TABLE IF NOT EXISTS store_currencies (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        symbol      TEXT NOT NULL,
        rate        NUMERIC(14,6) NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        UNIQUE (company_id, code)
      );
      -- Recurring subscriptions (competitor phase 32). COD-style: a daily job
      -- creates the next order and advances next_renewal — no gateway needed.
      ALTER TABLE products ADD COLUMN IF NOT EXISTS subscribable BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_interval_days INTEGER NOT NULL DEFAULT 30;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
      CREATE TABLE IF NOT EXISTS subscriptions (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        customer_id   INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        product_id    INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity      INTEGER NOT NULL DEFAULT 1,
        unit_price    NUMERIC(10,2) NOT NULL,
        interval_days INTEGER NOT NULL DEFAULT 30,
        status        TEXT NOT NULL DEFAULT 'active', -- active|cancelled
        next_renewal  DATE NOT NULL,
        ship_name     TEXT,
        ship_phone    TEXT,
        ship_address  TEXT,
        last_order_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_subscriptions_due ON subscriptions (status, next_renewal);
      CREATE TABLE IF NOT EXISTS gift_cards (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code        TEXT NOT NULL,
        amount      NUMERIC(10,2) NOT NULL,
        redeemed_by INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        redeemed_at TIMESTAMPTZ,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      );
      CREATE TABLE IF NOT EXISTS order_status_history (
        id         SERIAL PRIMARY KEY,
        order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        status     TEXT NOT NULL,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_order_status_history ON order_status_history (order_id, created_at);
      -- Back-in-stock / price-drop alerts (Amazon roadmap phase 18).
      CREATE TABLE IF NOT EXISTS stock_notifications (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        email       TEXT NOT NULL,
        notify_on   TEXT NOT NULL DEFAULT 'back_in_stock',
        notified    BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_stock_notifications ON stock_notifications (product_id, notified);
      -- Return / refund requests (Amazon roadmap phase 20).
      CREATE TABLE IF NOT EXISTS return_requests (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        reason      TEXT,
        notes       TEXT,
        status      TEXT NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_return_requests ON return_requests (company_id, status);
      -- Product variants (Amazon roadmap phase 8): size/color/… with own stock + price delta.
      CREATE TABLE IF NOT EXISTS product_variants (
        id          SERIAL PRIMARY KEY,
        product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        company_id  INTEGER REFERENCES companies(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        attributes  JSONB NOT NULL DEFAULT '{}',
        sku         TEXT,
        price_delta NUMERIC(10,2) NOT NULL DEFAULT 0,
        stock       INTEGER NOT NULL DEFAULT 0,
        image_url   TEXT,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants (product_id, is_active);
      ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL;
      -- Deals / Deal of the Day (Amazon roadmap phase 10).
      CREATE TABLE IF NOT EXISTS deals (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        discount_pct SMALLINT NOT NULL CHECK (discount_pct BETWEEN 1 AND 90),
        ends_at      TIMESTAMPTZ,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_deals_company ON deals (company_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_deals_product ON deals (product_id, is_active);
      -- Coupons (Amazon roadmap phase 11).
      CREATE TABLE IF NOT EXISTS coupons (
        id               SERIAL PRIMARY KEY,
        company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        code             TEXT NOT NULL,
        discount_type    TEXT NOT NULL DEFAULT 'percent', -- percent | fixed
        discount_value   NUMERIC(10,2) NOT NULL DEFAULT 0,
        min_order_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
        max_uses         INTEGER,
        used_count       INTEGER NOT NULL DEFAULT 0,
        expires_at       TIMESTAMPTZ,
        is_active        BOOLEAN NOT NULL DEFAULT true,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, code)
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_cost NUMERIC(10,2) NOT NULL DEFAULT 0;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_zone TEXT;
      -- Shipping zones by governorate (Amazon roadmap phase 12).
      CREATE TABLE IF NOT EXISTS shipping_zones (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        governorate    TEXT NOT NULL,
        cost           NUMERIC(10,2) NOT NULL DEFAULT 0,
        free_over      NUMERIC(10,2),
        eta_days       TEXT,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (company_id, governorate)
      );
      -- Courier integration per merchant (competitor phase 25). Each store enters
      -- its OWN provider + API key; the platform holds no shared courier account.
      -- 'manual' works with ANY courier today (merchant types the AWB per order).
      CREATE TABLE IF NOT EXISTS shipping_integrations (
        company_id  INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        provider    TEXT NOT NULL DEFAULT 'none', -- none|manual|bosta
        api_key     TEXT,
        pickup_phone   TEXT,
        pickup_address TEXT,
        enabled     BOOLEAN NOT NULL DEFAULT false,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS awb TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_provider TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_status TEXT;
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipment_tracking_url TEXT;
      -- Per-store feature flags (Amazon roadmap phase 21). Only overrides stored.
      CREATE TABLE IF NOT EXISTS company_features (
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        feature_key TEXT NOT NULL,
        enabled     BOOLEAN NOT NULL DEFAULT true,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (company_id, feature_key)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_product_review_customer ON product_reviews (product_id, customer_id) WHERE customer_id IS NOT NULL;
      -- Search acceleration (Amazon roadmap phase 1): fast catalogue scans + name lookups.
      CREATE INDEX IF NOT EXISTS idx_products_company_active ON products (company_id, is_active);
      CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products (lower(name));
      CREATE INDEX IF NOT EXISTS idx_products_name_ar_lower ON products (lower(name_ar));
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_ar TEXT;
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_en TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS promo_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_headline TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_subtext TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_cta_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_phone TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_address TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_trust_bar BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_promo_bar BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_hero_cards BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_banners BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_categories BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_contact BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS color_accent TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_card1_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_card2_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_about BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_services BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_portfolio BOOLEAN DEFAULT true;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS profession TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS page_content JSONB;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service1_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service1_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service2_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service2_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service3_title TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS service3_desc TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_text_color TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_btn_bg TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_btn_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_facebook TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_instagram TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_linkedin TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_twitter TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_tiktok TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_youtube TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_threads TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS social_website TEXT;
      ALTER TABLE banner_slides ADD COLUMN IF NOT EXISTS slot TEXT DEFAULT 'section';
    `);

    // Demo catalog for the Delta showcase store (only seeded when it has no products,
    // so a real owner's products are never duplicated or overwritten).
    const deltaRes = await client.query("SELECT id, currency FROM companies WHERE slug = 'delta'");
    if (deltaRes.rows.length) {
      const deltaId = deltaRes.rows[0].id;
      if (!deltaRes.rows[0].currency) {
        await client.query('UPDATE companies SET currency = $1 WHERE id = $2', ['EGP', deltaId]);
      }
      const cnt = await client.query('SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1', [deltaId]);
      if (cnt.rows[0].n === 0) {
        const addCat = async (ar, en, idx) => (await client.query(
          'INSERT INTO product_categories (company_id, name, name_ar, name_en, order_index) VALUES ($1,$2,$2,$3,$4) RETURNING id',
          [deltaId, ar, en, idx]
        )).rows[0].id;
        const catPhones = await addCat('موبايلات', 'Mobiles', 0);
        const catComp = await addCat('لابتوبات وكمبيوترات', 'Laptops & PCs', 1);
        // Product images live under /public/products/<slug>.png — committed
        // to the repo so they're always available without depending on an
        // external CDN. Each one is rendered to match its product type.
        const img = (file) => '/products/' + file + '.jpg';
        const demo = [
          [catPhones, 'آيفون 15 برو ماكس 256GB', 'iPhone 15 Pro Max', 'هيكل تيتانيوم، شاشة 6.7 بوصة Super Retina XDR، شريحة A17 Pro، وكاميرا 48 ميجابكسل.', 84999, img('iphone-15-pro-max'), 12],
          [catPhones, 'سامسونج جالاكسي S24 ألترا', 'Samsung Galaxy S24 Ultra', 'شاشة 6.8 بوصة Dynamic AMOLED، قلم S Pen، كاميرا 200 ميجابكسل ومعالج Snapdragon 8 Gen 3.', 72999, img('galaxy-s24-ultra'), 9],
          [catPhones, 'جوجل بيكسل 8 برو', 'Google Pixel 8 Pro', 'أفضل كاميرا حوسبية، شريحة Tensor G3، وتحديثات أندرويد لمدة 7 سنوات.', 41999, img('pixel-8-pro'), 15],
          [catPhones, 'آيفون 14 128GB', 'iPhone 14', 'شاشة 6.1 بوصة، شريحة A15 Bionic، نظام كاميرا مزدوج وبطارية تدوم طوال اليوم.', 44999, img('iphone-14'), 20],
          [catPhones, 'شاومي ريدمي نوت 13 برو', 'Xiaomi Redmi Note 13 Pro', 'شاشة AMOLED 120Hz، كاميرا 200 ميجابكسل، وشحن سريع 67 واط بسعر اقتصادي.', 18999, img('xiaomi-note13'), 30],
          [catComp,   'ماك بوك برو 16 M3 Pro',     'MacBook Pro 16 M3 Pro', 'شريحة M3 Pro، شاشة Liquid Retina XDR، 18GB رام و512GB SSD لأصحاب الأعمال الاحترافية.', 149999, img('macbook-pro-16'), 6],
          [catComp,   'ماك بوك إير M2 13 بوصة',     'MacBook Air M2', 'تصميم نحيف بوزن 1.2 كجم، شريحة M2، وبطارية تدوم حتى 18 ساعة.', 64999, img('macbook-air'), 11],
          [catComp,   'لابتوب Dell XPS 15',         'Dell XPS 15', 'معالج Intel Core i7، شاشة 15.6 بوصة OLED، 16GB رام وكرت RTX 4050.', 89999, img('dell-xps-15'), 8],
          [catComp,   'لابتوب ASUS ROG Gaming',     'ASUS ROG Gaming Laptop', 'للألعاب الثقيلة: RTX 4070، شاشة 165Hz، ومعالج Ryzen 9 وتبريد متقدم.', 99999, img('asus-rog-gaming'), 7],
          [catComp,   'كمبيوتر مكتبي للألعاب RGB',   'RGB Gaming Desktop PC', 'تجميعة قوية: RTX 4070 Ti، 32GB رام، SSD 1TB، وإضاءة RGB كاملة.', 79999, img('rgb-gaming-pc'), 5],
        ];
        for (const [cat, nameAr, nameEn, descAr, price, image, stock] of demo) {
          await client.query(
            `INSERT INTO products (company_id, category_id, name, description, price, image_url, stock, is_active, name_ar, name_en, description_ar)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true,$3,$8,$4)`,
            [deltaId, cat, nameAr, descAr, price, image, stock, nameEn]
          );
        }
        console.log(`Delta demo catalog seeded (${demo.length} products).`);
      } else {
        // Existing installations may still hold the old loremflickr URLs.
        // Migrate them to the new local /products/<slug>.png files keyed
        // off the product's name_en so each picture matches its title.
        const updates = [
          ['iPhone 15 Pro Max', '/products/iphone-15-pro-max.jpg'],
          ['Samsung Galaxy S24 Ultra', '/products/galaxy-s24-ultra.jpg'],
          ['Google Pixel 8 Pro', '/products/pixel-8-pro.jpg'],
          ['iPhone 14', '/products/iphone-14.jpg'],
          ['Xiaomi Redmi Note 13 Pro', '/products/xiaomi-note13.jpg'],
          ['MacBook Pro 16 M3 Pro', '/products/macbook-pro-16.jpg'],
          ['MacBook Air M2', '/products/macbook-air.jpg'],
          ['Dell XPS 15', '/products/dell-xps-15.jpg'],
          ['ASUS ROG Gaming Laptop', '/products/asus-rog-gaming.jpg'],
          ['RGB Gaming Desktop PC', '/products/rgb-gaming-pc.jpg'],
        ];
        let touched = 0;
        for (const [nameEn, imgPath] of updates) {
          const r = await client.query(
            `UPDATE products SET image_url = $1
             WHERE company_id = $2 AND name_en = $3
               AND (image_url IS NULL OR image_url LIKE '%loremflickr%' OR image_url <> $1)`,
            [imgPath, deltaId, nameEn]
          );
          touched += r.rowCount || 0;
        }
        if (touched) console.log(`Delta product images updated to local set (${touched} rows).`);
      }
    }

    // Delta brand assets (logo + 3 hero banners) — committed under
    // public/. Apply once when the demo store has no logo / no section
    // banners yet so existing customised stores aren't overwritten.
    if (deltaRes.rows.length) {
      const deltaId = deltaRes.rows[0].id;
      // Logo
      await client.query(
        `UPDATE companies SET logo_url = $1
         WHERE id = $2 AND (logo_url IS NULL OR logo_url = '' OR logo_url LIKE 'https://loremflickr%')`,
        ['/uploads/delta-logo.png', deltaId]
      );
      // Banners — only seed if there aren't any 'section' banners yet
      // Drop the outdated banner set (delta-banner-1/2/3) so the refreshed
      // images apply, without touching any custom banners the store added.
      await client.query(
        "DELETE FROM banner_slides WHERE company_id = $1 AND slot = 'section' AND image_url LIKE '/banners/delta-banner-_.jpg'",
        [deltaId]
      );
      const hasSection = await client.query(
        "SELECT 1 FROM banner_slides WHERE company_id = $1 AND slot = 'section' LIMIT 1",
        [deltaId]
      );
      if (!hasSection.rows.length) {
        const banners = [
          ['/banners/delta-banner-phone.jpg', 'أحدث الموبايلات — iPhone | Samsung | Pixel'],
          ['/banners/delta-banner-laptop.jpg', 'أقوى اللابتوبات — MacBook | Dell | ASUS ROG'],
          ['/banners/delta-banner-pc.jpg', 'كمبيوترات الألعاب — أداء وحوش بإضاءة RGB'],
        ];
        for (let i = 0; i < banners.length; i++) {
          await client.query(
            `INSERT INTO banner_slides (company_id, image_url, target_url, caption, slot, order_index, is_active)
             VALUES ($1, $2, NULL, $3, 'section', $4, true)`,
            [deltaId, banners[i][0], banners[i][1], i]
          );
        }
        console.log(`Delta hero banners seeded (${banners.length}).`);
      }
    }

    // Ensure demo store-owner logins exist so each store can be managed from its
    // dashboard. SECURITY: these demo tenants are PUBLIC and linked from the
    // homepage, so they must never carry predictable passwords. Provide a
    // per-tenant secret (DEMO_DELTA_PASSWORD / DEMO_PETRA_PASSWORD) if you need
    // to log in; otherwise the account is rotated to a random, unknowable
    // password on every boot so the old seeded creds (delta123/petra123) can
    // never be used again.
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    const demoOwners = [
      ['delta', 'delta@test.com', 'shop'],
      ['petra', 'petra@test.com', 'portfolio'],
    ];
    for (const [slug, email, pageType] of demoOwners) {
      const c = await client.query('SELECT id FROM companies WHERE slug = $1', [slug]);
      if (c.rows.length) {
        await client.query('UPDATE companies SET page_type = $1 WHERE id = $2', [pageType, c.rows[0].id]);
        const envPwd = process.env['DEMO_' + slug.toUpperCase() + '_PASSWORD'];
        const pwd = (envPwd && envPwd.length >= 8) ? envPwd : crypto.randomBytes(24).toString('hex');
        const hash = await bcrypt.hash(pwd, 10);
        await client.query(
          `INSERT INTO company_users (company_id, email, password_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
          [c.rows[0].id, email, hash]
        );
      }
    }

    // Demo CUSTOMER account for QA of the storefront customer area (wishlist,
    // points, wallet, addresses, order tracking). Same security stance as the
    // demo merchants: only created when DEMO_CUSTOMER_PASSWORD is explicitly set
    // (>=8 chars). Without it, no demo customer exists (customers self-register),
    // so there is never a hardcoded customer backdoor.
    const demoCustPwd = process.env.DEMO_CUSTOMER_PASSWORD || '';
    if (demoCustPwd.length >= 8) {
      const custHash = await bcrypt.hash(demoCustPwd, 10);
      await client.query(
        `INSERT INTO customers (email, password_hash, full_name, phone)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        ['customer@demo.oscardevs.com', custHash, 'عميل تجريبي', '01000000000']
      );
    }

    // SECURITY: never bootstrap the super-admin from predictable hardcoded
    // defaults — that turned a missing secret into a full platform backdoor
    // (anyone could log in with the known default email/password). Only create
    // or rotate the admin when BOTH secrets are explicitly provided. If they're
    // missing, skip entirely (admin login stays disabled) and warn loudly.
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim();
    const adminPassword = process.env.ADMIN_PASSWORD || '';
    if (adminEmail && adminPassword) {
      const adminHash = await bcrypt.hash(adminPassword, 10);
      await client.query(
        `INSERT INTO admins (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [adminEmail, adminHash]
      );
      // Neutralize any legacy default-credential admin left over from earlier
      // boots (before this fix), unless it's the configured admin itself.
      if (adminEmail !== 'admin@oscardevs.com') {
        await client.query('DELETE FROM admins WHERE email = $1', ['admin@oscardevs.com']);
      }
    } else {
      console.warn('[SECURITY] ADMIN_EMAIL/ADMIN_PASSWORD not set — super-admin bootstrap skipped (no default account created). Set them as deployment secrets to enable admin login.');
    }

    console.log('Database tables ready.');
  } catch (err) {
    console.error('DB init warning:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Start immediately so Replit can detect the open port
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Oscardevs Ads running on http://0.0.0.0:${PORT}`);
});

// ===== Co-hosted mybible: auto-launch on the same VM =====
// When MYBIBLE_UPSTREAM + MYBIBLE_DATABASE_URL are set and the built app exists,
// start mybible as a child process on its internal port, with ITS OWN database
// and session secret (passed explicitly so they don't collide with OscarDevs').
// The host gateway then proxies mybible.oscardevs.com to it. INERT otherwise, so
// the deploy's Run command can stay `node server.js` — no separate launcher.
if (process.env.MYBIBLE_UPSTREAM && process.env.MYBIBLE_DATABASE_URL) {
  const mybibleDist = path.join(__dirname, 'mybible', 'dist', 'index.cjs');
  if (fs.existsSync(mybibleDist)) {
    const mbPort = process.env.MYBIBLE_PORT || '5001';
    // Shared secret for the internal daily-push trigger. mybible's
    // /api/push/trigger-daily rejects requests without it, so when the owner
    // hasn't set one we mint a random per-boot secret and hand it to the child —
    // the endpoint stays closed to the outside, but OscarDevs can always call it
    // with zero configuration.
    const mbCronSecret = process.env.MYBIBLE_CRON_SECRET
      || process.env.CRON_SECRET
      || require('crypto').randomBytes(24).toString('hex');
    const mybibleEnv = Object.assign({}, process.env, {
      NODE_ENV: 'production',
      PORT: mbPort,
      // mybible MUST use its own DB + secret (keeps the members logged in):
      DATABASE_URL: process.env.MYBIBLE_DATABASE_URL,
      SESSION_SECRET: process.env.MYBIBLE_SESSION_SECRET || process.env.SESSION_SECRET,
      // mybible MUST use its OWN VAPID keys so the members' existing push
      // subscriptions keep working. We deliberately do NOT fall back to
      // OscarDevs' VAPID — empty (push disabled) is safer than wrong keys
      // (which would silently fail to deliver to the 700 subscribers).
      VAPID_PUBLIC_KEY: process.env.MYBIBLE_VAPID_PUBLIC_KEY || '',
      VAPID_PRIVATE_KEY: process.env.MYBIBLE_VAPID_PRIVATE_KEY || '',
      VAPID_EMAIL: process.env.MYBIBLE_VAPID_EMAIL || '',
      CRON_SECRET: mbCronSecret,
    });

    // Keep mybible alive: if the child dies (crash, OOM, VM hiccup) restart it
    // automatically instead of leaving a 502 for the members. Exponential
    // backoff (1s→30s max) guards against a tight crash-loop; a child that
    // stayed up healthy for >60s resets the backoff so transient crashes don't
    // accumulate delay. `mbShuttingDown` prevents restarts during a clean exit.
    let mbRestarts = 0;
    let mbShuttingDown = false;
    let mbChild = null;
    const launchMybible = () => {
      const startedAt = Date.now();
      mbChild = require('child_process').spawn(process.execPath, [mybibleDist], {
        cwd: path.join(__dirname, 'mybible'),
        stdio: 'inherit',
        env: mybibleEnv,
      });
      mbChild.on('exit', (code, signal) => {
        if (mbShuttingDown) return;
        if (Date.now() - startedAt > 60000) mbRestarts = 0; // ran healthy → fresh count
        const delay = Math.min(30000, 1000 * Math.pow(2, mbRestarts));
        mbRestarts += 1;
        console.error(`[co-host] mybible exited (code=${code} signal=${signal}) — restarting in ${delay}ms (attempt ${mbRestarts})`);
        setTimeout(launchMybible, delay);
      });
      mbChild.on('error', (err) => console.error('[co-host] mybible spawn error:', err));
    };
    // On a clean OscarDevs shutdown, take mybible down with it (no restart).
    const mbShutdown = () => { mbShuttingDown = true; if (mbChild) { try { mbChild.kill(); } catch (_) {} } };
    process.once('SIGTERM', mbShutdown);
    process.once('SIGINT', mbShutdown);

    launchMybible();
    console.log('🕮 Co-hosted mybible launched on 127.0.0.1:' + mbPort);

    // ── Daily verse push: drive it from THIS (always-alive) process ──────────
    // mybible schedules its own 6 AM cron internally, but that timer dies with
    // the child — a crash/restart anywhere before 06:00 silently skips the day
    // (exactly what happened when Neon's idle-suspend killed it at 02:48).
    // NeuroPilot solves this with an external trigger; here the parent plays
    // that role: every 30 min inside the 06:00–07:59 Cairo window we POST to
    // mybible's trigger endpoint. Its `last_daily_notif_date` DB guard makes
    // repeat calls a no-op, so this can only ever add a missed send, never a
    // duplicate one.
    setInterval(() => {
      try {
        const h = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }));
        if (h !== 6 && h !== 7) return;
        const url = String(process.env.MYBIBLE_UPSTREAM).replace(/\/+$/, '') + '/api/push/trigger-daily';
        fetch(url, {
          method: 'POST',
          headers: { 'x-cron-secret': mbCronSecret, 'content-type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(20000),
        })
          .then((r) => r.ok
            ? console.log('[co-host] mybible daily push trigger ok')
            : console.error('[co-host] mybible daily push trigger failed, status', r.status))
          .catch((err) => console.error('[co-host] mybible daily push trigger error:', err.message));
      } catch (e) { /* never let the timer throw */ }
    }, 30 * 60 * 1000).unref();
  } else {
    console.warn('[co-host] MYBIBLE_UPSTREAM set but mybible/dist/index.cjs missing — build mybible first');
  }
}

// Run schema migration in background — does not block startup.
// After the core tables are ready, ensure the pharmacy module's tables and
// demo pharmacy exist (additive, idempotent — safe on every boot).
const { ensurePharmacySchema } = require('./src/pharmacy/schema');
const { ensureFoodSchema } = require('./src/food/schema');
const { ensureAccountingSchema } = require('./src/accounting/schema');
const { ensureKakeiboSchema } = require('./src/kakeibo/schema');
const { ensureClinicSchema } = require('./src/clinic/schema');
const { ensureGymSchema } = require('./src/gym/schema');
const { ensureRadiologySchema } = require('./src/radiology/schema');
const { ensureSokroSchema } = require('./sokro/schema');
const { syncMedicinesSafe } = require('./src/pharmacy/medicine_sync');
initDb()
  .then(() => ensurePharmacySchema())
  .then(() => ensureFoodSchema())
  .then(() => ensureAccountingSchema())
  .then(() => ensureKakeiboSchema())
  .then(() => ensureClinicSchema())
  .then(() => ensureGymSchema())
  .then(() => ensureRadiologySchema())
  .then(() => ensureSokroSchema())
  // Auto-import the full Egyptian medicines catalog once the tables exist.
  // Runs in the background, is staleness-gated (won't re-download if fresh),
  // and can never crash boot. A daily timer keeps a long-running instance
  // up to date without anyone editing the code.
  .then(() => { syncMedicinesSafe(); })
  .catch(err => console.error('DB init warning:', err.message));

setInterval(() => { syncMedicinesSafe(); }, 24 * 60 * 60 * 1000).unref();

// NeuroPilot push schema — run independently so it never depends on the
// pharmacy/food chain above completing on a fresh DB.
neuroPush.ensureSchema().catch((err) => console.error('[neuropilot push schema]', err.message));

// Back-in-stock notifier (phase 18) — check every 15 min for restocked products.
try {
  const stockNotifier = require('./src/lib/stock_notifier');
  setInterval(() => { stockNotifier.checkAndNotify().catch(() => {}); }, 15 * 60 * 1000).unref();
} catch (e) { /* optional */ }

// Kakeibo daily expense-logging reminders (best-effort; self-gated to evening +
// once/day per user). Checks hourly so long-running instances remind opted-in users.
try {
  const kkbPush = require('./src/kakeibo/push');
  setInterval(() => { kkbPush.dailyReminders().catch(() => {}); }, 60 * 60 * 1000).unref();
} catch (e) { /* push optional */ }

// NeuroPilot daily reminder — INTERNAL cron fallback. Fires at ~08:00 Cairo when
// the instance happens to be awake (dedup-guarded so it never double-sends). The
// RELIABLE path is the external trigger below (Replit Autoscale sleeps, so this
// internal timer won't run while the app is scaled to zero).
setInterval(() => {
  try {
    const h = Number(new Date().toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Africa/Cairo' }));
    if (h === 8) {
      neuroPush.sendDaily().catch(() => {});
      require('./src/lib/gym_alerts').runExpiryAlerts().catch(() => {}); // gym renewals
    }
  } catch (e) { /* ignore */ }
}, 30 * 60 * 1000).unref();

// Clinic WhatsApp reminders. Hourly; the job itself only acts during the Cairo
// evening hour it sends in, and every send is deduped against
// clinic_whatsapp_log — so an extra tick can never double-message a patient.
const clinicReminders = require('./src/clinic/reminders');
setInterval(() => {
  clinicReminders.sendDueReminders(pool).catch((e) => console.error('[reminders]', e.message));
}, 60 * 60 * 1000).unref();

// Subscriptions (phase 32): create due recurring orders. Runs hourly and is
// idempotent per day (each renewal advances next_renewal past today), so it
// self-heals whenever the instance is awake. Also exposed as an external
// trigger below for scale-to-zero hosting.
const subscriptions = require('./src/lib/subscriptions');
setInterval(() => { subscriptions.runDueRenewals().catch(() => {}); }, 60 * 60 * 1000).unref();
subscriptions.runDueRenewals().catch(() => {}); // once on boot

