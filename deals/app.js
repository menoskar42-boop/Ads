'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { pool, initDealsDb } = require('./db');
const { listProviders, assertProviderAllowed } = require('./providers');

const app = express();
const PORT = Number(process.env.DEALS_PORT || 5002);
const BASE_URL = String(process.env.DEALS_PUBLIC_URL || 'https://deals.oscardevs.com').replace(/\/+$/, '');
const uploadDir = path.join(__dirname, 'public', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'");
  if (req.path.startsWith('/admin')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(session({
  name: 'deals.sid',
  secret: process.env.DEALS_SESSION_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.DEALS_COOKIE_SECURE === 'true', maxAge: 8 * 60 * 60 * 1000 },
}));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const loginAttempts = new Map();
app.use((req, res, next) => {
  if (!req.session.dealsCsrfToken) req.session.dealsCsrfToken = crypto.randomBytes(24).toString('hex');
  if (req.path.startsWith('/admin') && req.method === 'POST') {
    const submitted = String(req.body?._csrf || req.get('x-csrf-token') || '');
    if (!submitted || submitted.length !== req.session.dealsCsrfToken.length ||
        !crypto.timingSafeEqual(Buffer.from(submitted), Buffer.from(req.session.dealsCsrfToken))) {
      return res.status(403).render('error', common(req, { status: 403, message: 'انتهت صلاحية النموذج. أعد تحميل الصفحة وحاول مرة أخرى.' }));
    }
  }
  next();
});

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)),
});

const txt = (v, max) => {
  const value = String(v == null ? '' : v).trim();
  return value ? value.slice(0, max) : null;
};
const slugify = (v) => {
  const value = String(v || '').trim().toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return value || `item-${Date.now()}`;
};
const safeUrl = (v) => {
  const value = txt(v, 1200);
  return value && /^https?:\/\//i.test(value) ? value : null;
};
const bool = (v) => v === '1' || v === 'on' || v === 'true';
const numberOrNull = (v) => {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const integerOrNull = (v) => {
  const n = numberOrNull(v);
  return n == null || !Number.isInteger(n) ? null : n;
};

function common(req, extra = {}) {
  return {
    site: req.app.locals.settings || { site_name: 'Deals', site_description: 'اختيارات شراء موصى بها', theme_color: '#0f766e' },
    baseUrl: BASE_URL,
    providers: listProviders(),
    csrfToken: req.session?.dealsCsrfToken || '',
    ...extra,
  };
}

function requireAdmin(req, res, next) {
  if (!req.session.dealsAdmin) return res.redirect('/admin/login');
  next();
}

async function loadSettings() {
  const row = (await pool.query('SELECT * FROM deals_settings WHERE id = 1')).rows[0];
  return row;
}

app.use(async (req, _res, next) => {
  try { req.app.locals.settings = await loadSettings(); } catch (e) { console.error('[deals settings]', e.message); }
  next();
});

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'deals', database: 'ok' });
  } catch (e) {
    res.status(503).json({ ok: false, service: 'deals', database: 'unavailable' });
  }
});
app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'logo.svg')));

app.get('/', async (req, res, next) => {
  try {
    const products = (await pool.query(
      `SELECT p.*, c.name AS category_name FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.is_published = true ORDER BY p.is_featured DESC, p.created_at DESC`
    )).rows;
    const articles = (await pool.query(
      `SELECT * FROM deals_articles WHERE is_published = true
       ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 3`
    )).rows;
    res.render('home', common(req, { products, articles, title: req.app.locals.settings.site_name }));
  } catch (e) { next(e); }
});

app.get('/category/:slug', async (req, res, next) => {
  try {
    const category = (await pool.query('SELECT * FROM deals_categories WHERE slug = $1 AND is_published = true', [req.params.slug])).rows[0];
    if (!category) return res.status(404).render('error', common(req, { status: 404, message: 'التصنيف غير موجود' }));
    const products = (await pool.query(
      `SELECT p.*, c.name AS category_name FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.category_id = $1 AND p.is_published = true
       ORDER BY p.is_featured DESC, p.created_at DESC`, [category.id]
    )).rows;
    res.render('listing', common(req, { products, heading: category.name, description: category.description, title: `${category.name} — ${req.app.locals.settings.site_name}`, canonicalPath: `/category/${encodeURIComponent(category.slug)}` }));
  } catch (e) { next(e); }
});

app.get('/search', async (req, res, next) => {
  try {
    const q = txt(req.query.q, 100) || '';
    const products = q ? (await pool.query(
      `SELECT p.*, c.name AS category_name FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.is_published = true AND (p.title ILIKE $1 OR p.short_description ILIKE $1 OR p.brand ILIKE $1)
       ORDER BY p.is_featured DESC, p.created_at DESC`, [`%${q}%`]
    )).rows : [];
    res.render('listing', common(req, { products, heading: q ? `نتائج البحث: ${q}` : 'بحث', description: '', title: `بحث — ${req.app.locals.settings.site_name}`, canonicalPath: '/search' }));
  } catch (e) { next(e); }
});

app.get('/product/:slug', async (req, res, next) => {
  try {
    const product = (await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM deals_catalog_products p
       LEFT JOIN deals_categories c ON c.id = p.category_id
       WHERE p.slug = $1 AND p.is_published = true`, [req.params.slug]
    )).rows[0];
    if (!product) return res.status(404).render('error', common(req, { status: 404, message: 'المنتج غير موجود' }));
    res.render('product', common(req, { product, title: `${product.title} — ${req.app.locals.settings.site_name}` }));
  } catch (e) { next(e); }
});

app.get('/article/:slug', async (req, res, next) => {
  try {
    const article = (await pool.query('SELECT * FROM deals_articles WHERE slug = $1 AND is_published = true', [req.params.slug])).rows[0];
    if (!article) return res.status(404).render('error', common(req, { status: 404, message: 'المقال غير موجود' }));
    res.render('article', common(req, { article, title: `${article.title} — ${req.app.locals.settings.site_name}` }));
  } catch (e) { next(e); }
});

app.get('/about', (req, res) => res.render('legal', common(req, { title: 'عن Deals', heading: 'عن Deals', body: 'Deals منصة محتوى واكتشاف منتجات. نحن لا نبيع المنتجات ولا ننفذ الدفع أو الشحن أو المرتجعات.' })));
app.get('/affiliate-disclosure', (req, res) => res.render('legal', common(req, { title: 'إفصاح Affiliate', heading: 'إفصاح Affiliate', body: 'As an Amazon Associate I earn from qualifying purchases. قد نحصل على عمولة عند شراء منتج من خلال بعض الروابط، دون تكلفة إضافية عليك.' })));
app.get('/privacy', (req, res) => res.render('legal', common(req, { title: 'سياسة الخصوصية', heading: 'سياسة الخصوصية', body: 'نستخدم البيانات اللازمة لتشغيل الموقع وتحسينه. لا نطلب بيانات دفع، ولا ننفذ عمليات شراء داخل Deals.' })));
app.get('/terms', (req, res) => res.render('legal', common(req, { title: 'الشروط', heading: 'الشروط والأحكام', body: 'المعلومات والأسعار والتوافر قد تتغير لدى المتجر الخارجي. يجب مراجعة تفاصيل المنتج النهائية على موقع البائع قبل الشراء.' })));
app.get('/contact', (req, res) => res.render('legal', common(req, { title: 'تواصل معنا', heading: 'تواصل معنا', body: 'للاستفسارات أو تصحيح محتوى، استخدم قناة التواصل المعتمدة لدى مالك Deals.' })));

app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${BASE_URL}/sitemap.xml\n`));
app.get('/sitemap.xml', async (req, res, next) => {
  try {
    const [products, categories, articles] = await Promise.all([
      pool.query('SELECT slug, updated_at FROM deals_catalog_products WHERE is_published = true'),
      pool.query('SELECT slug FROM deals_categories WHERE is_published = true'),
      pool.query('SELECT slug, updated_at FROM deals_articles WHERE is_published = true'),
    ]);
    const urls = ['', 'about', 'affiliate-disclosure', 'privacy', 'terms', 'contact',
      ...products.rows.map((p) => `product/${encodeURIComponent(p.slug)}`),
      ...categories.rows.map((c) => `category/${encodeURIComponent(c.slug)}`),
      ...articles.rows.map((a) => `article/${encodeURIComponent(a.slug)}`)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${BASE_URL}/${u}</loc></url>`).join('')}</urlset>`);
  } catch (e) { next(e); }
});

app.get('/admin/login', (req, res) => {
  if (req.session.dealsAdmin) return res.redirect('/admin');
  res.render('admin/login', common(req, { title: 'دخول إدارة Deals', error: null }));
});
app.post('/admin/login', async (req, res, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (loginAttempts.get(ip) || []).filter((time) => now - time < 15 * 60 * 1000);
    if (recent.length >= 5) {
      res.setHeader('Retry-After', '900');
      return res.status(429).render('admin/login', common(req, { title: 'دخول إدارة Deals', error: 'محاولات كثيرة. حاول بعد دقائق.' }));
    }
    const email = txt(req.body.email, 240)?.toLowerCase();
    const configuredEmail = String(process.env.DEALS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').toLowerCase();
    const configuredPassword = process.env.DEALS_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
    const submittedPassword = Buffer.from(String(req.body.password || ''));
    const expectedPassword = Buffer.from(String(configuredPassword || ''));
    const passwordMatches = /^\$2[aby]\$\d{2}\$/.test(String(configuredPassword || ''))
      ? bcrypt.compareSync(String(req.body.password || ''), String(configuredPassword))
      : expectedPassword.length > 0
      && submittedPassword.length === expectedPassword.length
      && crypto.timingSafeEqual(submittedPassword, expectedPassword);
    if (!email || !configuredEmail || email !== configuredEmail || !passwordMatches) {
      recent.push(now);
      loginAttempts.set(ip, recent);
      return res.status(401).render('admin/login', common(req, { title: 'دخول إدارة Deals', error: 'بيانات الدخول غير صحيحة.' }));
    }
    loginAttempts.delete(ip);
    req.session.dealsAdmin = { email };
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/logout', requireAdmin, (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const [products, categories, articles] = await Promise.all([
      pool.query('SELECT p.*, c.name AS category_name FROM deals_catalog_products p LEFT JOIN deals_categories c ON c.id=p.category_id ORDER BY p.created_at DESC'),
      pool.query('SELECT * FROM deals_categories ORDER BY name'),
      pool.query('SELECT * FROM deals_articles ORDER BY created_at DESC'),
    ]);
    res.render('admin/dashboard', common(req, { products: products.rows, categories: categories.rows, articles: articles.rows, title: 'إدارة Deals' }));
  } catch (e) { next(e); }
});

app.post('/admin/settings', requireAdmin, async (req, res, next) => {
  try {
    await pool.query(`UPDATE deals_settings SET site_name=$1, site_description=$2, logo_url=$3, theme_color=$4, updated_at=now() WHERE id=1`,
      [txt(req.body.site_name, 120) || 'Deals', txt(req.body.site_description, 300) || 'اختيارات شراء موصى بها', safeUrl(req.body.logo_url), /^#[0-9a-f]{6}$/i.test(req.body.theme_color || '') ? req.body.theme_color : '#0f766e']);
    res.redirect('/admin');
  } catch (e) { next(e); }
});

app.post('/admin/categories', requireAdmin, async (req, res, next) => {
  try {
    const name = txt(req.body.name, 120);
    if (name) await pool.query('INSERT INTO deals_categories (name, slug, description) VALUES ($1,$2,$3) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description', [name, slugify(req.body.slug || name), txt(req.body.description, 300)]);
    res.redirect('/admin');
  } catch (e) { next(e); }
});

app.post('/admin/categories/:id/delete', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM deals_categories WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});

app.post('/admin/products', requireAdmin, upload.single('image_file'), async (req, res, next) => {
  try {
    assertProviderAllowed(req.body.source || 'MANUAL');
    const title = txt(req.body.title, 180);
    const affiliateUrl = safeUrl(req.body.affiliate_url);
    if (!title || !affiliateUrl) throw new Error('العنوان ورابط Affiliate مطلوبان');
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : safeUrl(req.body.image_url);
    const price = numberOrNull(req.body.current_price);
    const originalPrice = numberOrNull(req.body.original_price);
    await pool.query(
      `INSERT INTO deals_catalog_products
       (source, external_id, title, slug, short_description, full_description, brand, category_id,
        image_url, current_price, currency, original_price, amazon_product_url, affiliate_url,
        rating, review_count, availability, is_featured, is_published)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [req.body.source || 'MANUAL', txt(req.body.external_id, 80), title, slugify(req.body.slug || title),
         txt(req.body.short_description, 400), txt(req.body.full_description, 8000), txt(req.body.brand, 120),
         req.body.category_id || null, imageUrl, price, txt(req.body.currency, 8) || 'EGP',
         originalPrice, safeUrl(req.body.amazon_product_url), affiliateUrl,
         numberOrNull(req.body.rating), integerOrNull(req.body.review_count),
        txt(req.body.availability, 120), bool(req.body.is_featured), bool(req.body.is_published)],
    );
    res.redirect('/admin');
  } catch (e) { next(e); }
});

app.post('/admin/products/:id/toggle', requireAdmin, async (req, res, next) => {
  try { await pool.query('UPDATE deals_catalog_products SET is_published=NOT is_published, updated_at=now() WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});
app.get('/admin/products/:id/edit', requireAdmin, async (req, res, next) => {
  try {
    const [product, categories] = await Promise.all([
      pool.query('SELECT * FROM deals_catalog_products WHERE id=$1', [req.params.id]),
      pool.query('SELECT * FROM deals_categories ORDER BY name'),
    ]);
    if (!product.rows[0]) return res.redirect('/admin');
    res.render('admin/edit_product', common(req, { product: product.rows[0], categories: categories.rows, title: 'تعديل منتج' }));
  } catch (e) { next(e); }
});
app.post('/admin/products/:id/edit', requireAdmin, upload.single('image_file'), async (req, res, next) => {
  try {
    const current = (await pool.query('SELECT * FROM deals_catalog_products WHERE id=$1', [req.params.id])).rows[0];
    if (!current) return res.redirect('/admin');
    const title = txt(req.body.title, 180);
    const affiliateUrl = safeUrl(req.body.affiliate_url);
    if (!title || !affiliateUrl) throw new Error('العنوان ورابط Affiliate مطلوبان');
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : (safeUrl(req.body.image_url) || current.image_url);
    const price = numberOrNull(req.body.current_price);
    await pool.query(
      `UPDATE deals_catalog_products SET title=$1,slug=$2,short_description=$3,full_description=$4,
       brand=$5,category_id=$6,image_url=$7,current_price=$8,currency=$9,original_price=$10,
       amazon_product_url=$11,affiliate_url=$12,availability=$13,is_featured=$14,is_published=$15,updated_at=now()
       WHERE id=$16`,
      [title, slugify(req.body.slug || title), txt(req.body.short_description, 400), txt(req.body.full_description, 8000),
         txt(req.body.brand, 120), req.body.category_id || null, imageUrl, price,
         txt(req.body.currency, 8) || 'EGP', numberOrNull(req.body.original_price),
        safeUrl(req.body.amazon_product_url), affiliateUrl, txt(req.body.availability, 120),
        bool(req.body.is_featured), bool(req.body.is_published), req.params.id]
    );
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/products/:id/delete', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM deals_catalog_products WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});

app.post('/admin/articles', requireAdmin, async (req, res, next) => {
  try {
    const title = txt(req.body.title, 180);
    const body = txt(req.body.body, 30000);
    if (title && body) await pool.query(
      `INSERT INTO deals_articles (title,slug,excerpt,body,is_published,published_at)
       VALUES ($1,$2,$3,$4,$5,CASE WHEN $5 THEN now() ELSE NULL END)
       ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,body=EXCLUDED.body,is_published=EXCLUDED.is_published,published_at=EXCLUDED.published_at,updated_at=now()`,
      [title, slugify(req.body.slug || title), txt(req.body.excerpt, 400), body, bool(req.body.is_published)]
    );
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/articles/:id/delete', requireAdmin, async (req, res, next) => {
  try { await pool.query('DELETE FROM deals_articles WHERE id=$1', [req.params.id]); res.redirect('/admin'); } catch (e) { next(e); }
});

app.use((err, req, res, _next) => {
  console.error('[deals]', err.stack || err.message);
  if (res.headersSent) return;
  res.status(500).render('error', common(req, { status: 500, message: 'حدث خطأ مؤقت. حاول مرة أخرى.' }));
});

initDealsDb()
  .then(() => app.listen(PORT, '127.0.0.1', () => console.log(`Deals app running on 127.0.0.1:${PORT}`)))
  .catch((err) => { console.error('[deals] database init failed:', err.stack || err.message); process.exitCode = 1; });

module.exports = app;