require('dotenv').config();
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

// ===== NeuroPilot (adhd.oscardevs.com) — ADHD focus timer, host-routed =====
// A fully client-side focus-timer (localStorage only — no DB, no API, no
// account). Rewritten natively for OscarDevs' stack and served as static
// files on its own subdomain, ahead of all OscarDevs middleware, so it never
// touches the session/tenant/AdSense pipeline. Kept ad-free like mykid.
const neuroDir = path.join(__dirname, 'neuropilot');
const neuroStatic = express.static(neuroDir, {
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    if (/\.(?:svg|wav|png|ico|webmanifest)$/i.test(filePath)) {
      // Immutable-ish assets — safe to cache for a week.
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      // HTML / CSS / JS / SW: always revalidate so a Republish ships instantly
      // (the app has no hashed filenames, so a stale cache would hide updates).
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
});
app.use((req, res, next) => {
  const rawHost = req.headers['x-tenant-host'] || req.hostname || req.headers.host || '';
  const host = String(rawHost).split(':')[0].toLowerCase();
  if (!host.startsWith('adhd.')) return next();
  // Serve a matching static asset; otherwise fall back to the app shell so
  // any path lands on the single-page timer instead of a tenant 404.
  neuroStatic(req, res, () => {
    res.sendFile(path.join(neuroDir, 'index.html'));
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
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (/\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    } else if (/\.(?:css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));
app.use(session({
  secret: process.env.SESSION_SECRET || 'oscardevs-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
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

    // Ensure demo store-owner logins exist so each store can be managed from its dashboard.
    const bcrypt = require('bcryptjs');
    const demoOwners = [
      ['delta', 'delta@test.com', 'delta123', 'shop'],
      ['petra', 'petra@test.com', 'petra123', 'portfolio'],
    ];
    for (const [slug, email, pwd, pageType] of demoOwners) {
      const c = await client.query('SELECT id FROM companies WHERE slug = $1', [slug]);
      if (c.rows.length) {
        await client.query('UPDATE companies SET page_type = $1 WHERE id = $2', [pageType, c.rows[0].id]);
        const hash = await bcrypt.hash(pwd, 10);
        await client.query(
          `INSERT INTO company_users (company_id, email, password_hash)
           VALUES ($1, $2, $3)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
          [c.rows[0].id, email, hash]
        );
      }
    }

    // Ensure the super-admin login exists. It's otherwise only created by
    // seed.js, which does NOT run on the deployed database — so the default
    // login failed in production. Idempotent; override via env if needed.
    const adminHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await client.query(
      `INSERT INTO admins (email, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [process.env.ADMIN_EMAIL || 'admin@oscardevs.com', adminHash]
    );

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

// Run schema migration in background — does not block startup
initDb().catch(err => console.error('DB init warning:', err.message));
