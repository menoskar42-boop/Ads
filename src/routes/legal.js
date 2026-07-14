const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { rateLimit } = require('../middleware/rateLimit');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TERMS_VERSION = '1.0';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';
// Bare base domain (e.g. "oscardevs.com") for building the production subdomain
// URLs that tenant pages canonicalize to — so the sitemap lists the same URLs.
const BASE_DOMAIN = SITE_ORIGIN.replace(/^https?:\/\//, '').replace(/\/$/, '');

// Legal pages are real content — allow AdSense.
router.use((req, res, next) => { res.locals.showAds = true; next(); });

router.get('/privacy', (req, res) => {
  res.render('legal/privacy');
});

router.get('/terms', (req, res) => {
  res.render('legal/terms', { termsVersion: TERMS_VERSION });
});

router.get('/about', (req, res) => {
  res.render('legal/about');
});

router.get('/faq', (req, res) => {
  res.render('legal/faq');
});

router.get('/our-work', (req, res) => {
  res.render('legal/our_work');
});

router.get('/contact', (req, res) => {
  res.render('legal/contact', { sent: req.query.sent === '1', error: req.query.error || null });
});

// Public form → abuse-prone. Cap submissions per IP (5 / 15 min).
const contactLimiter = rateLimit({ name: 'contact', windowMs: 15 * 60000, max: 5 });

router.post('/contact', contactLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  const email = String(req.body.email || '').trim().slice(0, 150);
  const phone = String(req.body.phone || '').trim().slice(0, 30);
  const message = String(req.body.message || '').trim().slice(0, 5000);
  // Honeypot: a hidden field real users never fill. If a bot fills it, pretend
  // success (so it won't retry) but drop the message silently.
  if (String(req.body.website || '').trim()) return res.redirect('/contact?sent=1');
  // Link-flood: legitimate enquiries rarely contain 3+ URLs; spam almost always does.
  const linkCount = (message.match(/https?:\/\/|www\.|\bmega\.nz\b|t\.me\//gi) || []).length;
  if (linkCount >= 3) return res.redirect('/contact?sent=1');
  if (!name || !message) return res.redirect('/contact?error=' + encodeURIComponent('الاسم والرسالة مطلوبان'));
  try {
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, sender_phone, message)
       VALUES (NULL, $1, $2, $3, $4)`,
      [name, email || null, phone || null, message]
    );
    res.redirect('/contact?sent=1');
  } catch (err) {
    console.error('[POST /contact] error:', err);
    res.redirect('/contact?error=' + encodeURIComponent('حدث خطأ، حاول مرة أخرى لاحقاً.'));
  }
});

const { ARTICLES } = require('./blog_articles');
const indexnow = require('../lib/indexnow');
const { INDEXNOW_KEY } = indexnow;

if (INDEXNOW_KEY) {
  router.get('/' + INDEXNOW_KEY + '.txt', (req, res) => {
    res.type('text/plain').send(INDEXNOW_KEY);
  });
}

router.get('/admin/seo/ping-indexnow', async (req, res) => {
  if (!req.session || !req.session.adminId) return res.status(401).send('Unauthorized');
  if (!INDEXNOW_KEY) return res.status(400).send('INDEXNOW_KEY env var not set');
  const urls = [
    SITE_ORIGIN + '/',
    SITE_ORIGIN + '/about',
    SITE_ORIGIN + '/contact',
    SITE_ORIGIN + '/faq',
    SITE_ORIGIN + '/blog',
    ...ARTICLES.map(a => SITE_ORIGIN + '/blog/' + a.slug),
  ];
  try {
    const c = await pool.query("SELECT slug FROM companies WHERE is_active = true");
    for (const row of c.rows) urls.push('https://' + row.slug + '.' + BASE_DOMAIN + '/');
    const p = await pool.query(
      `SELECT c.slug, p.id FROM products p
       JOIN companies c ON c.id = p.company_id
       WHERE p.is_active = true AND c.is_active = true AND c.page_type = 'shop'`
    );
    for (const row of p.rows) urls.push(SITE_ORIGIN + '/shop/' + row.slug + '/product/' + row.id);
  } catch (_) { /* DB optional — still ping static + articles */ }
  const r = await indexnow.submit(urls);
  res.type('text/plain').send(`IndexNow status ${r.status}\n${r.body}\n\nPinged ${urls.length} URLs.`);
});

// Format a DB timestamp as YYYY-MM-DD for <lastmod>, falling back to today
// when the value is missing/invalid so the sitemap never emits a bad date.
function ymd(value) {
  const d = value ? new Date(value) : null;
  return (d && !isNaN(d)) ? d.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
}

router.get('/sitemap.xml', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: '/',         priority: '1.0', changefreq: 'weekly',  lastmod: today },
    { loc: '/about',    priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/contact',  priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/blog',     priority: '0.9', changefreq: 'weekly',  lastmod: today },
    { loc: '/apply',    priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/faq',      priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/our-work', priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/privacy',  priority: '0.4', changefreq: 'yearly',  lastmod: today },
    { loc: '/terms',    priority: '0.4', changefreq: 'yearly',  lastmod: today },
  ];
  for (const a of ARTICLES) {
    urls.push({ loc: '/blog/' + a.slug, priority: '0.7', changefreq: 'monthly', lastmod: a.date });
  }
  try {
    // Only list tenant pages that pass the same indexing quality gate used in
    // tenant.js, so the sitemap never points crawlers at noindex'd thin pages.
    const r = await pool.query(
      `SELECT c.slug, c.created_at, c.page_type,
        (SELECT COUNT(*) FROM products p WHERE p.company_id = c.id AND p.is_active = true) AS prod_count,
        (SELECT COUNT(*) FROM portfolio_items pi WHERE pi.company_id = c.id) AS pf_count,
        (SELECT COUNT(*) FROM pharmacy_inventory piv WHERE piv.company_id = c.id) AS stock_count,
        (SELECT COUNT(*) FROM clinic_doctors cd WHERE cd.company_id = c.id AND cd.is_active = true) AS doc_count,
        COALESCE(char_length(trim(c.description)), 0) AS desc_len
       FROM companies c WHERE c.is_active = true ORDER BY c.slug`
    );
    const indexableShops = new Set();
    for (const row of r.rows) {
      // Same quality gate tenant.js uses, per page type, so the sitemap never
      // points crawlers at a page that renders noindex.
      // Demo tenants (slug === page_type) are samples — never list them.
      if (row.page_type === 'pharmacy' && row.slug === 'pharmacy') continue;
      if (row.page_type === 'clinic' && row.slug === 'clinic') continue;
      const ok = row.page_type === 'shop'
        ? Number(row.prod_count) >= 3
        : row.page_type === 'pharmacy'
        ? Number(row.stock_count) >= 3
        : row.page_type === 'clinic'
        ? (Number(row.doc_count) >= 1 && Number(row.desc_len) >= 40)
        : (Number(row.pf_count) >= 2 || Number(row.desc_len) >= 120);
      if (!ok) continue;
      urls.push({ loc: 'https://' + row.slug + '.' + BASE_DOMAIN + '/', priority: '0.6', changefreq: 'weekly', lastmod: ymd(row.created_at) });
      if (row.page_type === 'shop') indexableShops.add(row.slug);
    }
    // Active products of indexable shops — helps Google index product pages.
    const p = await pool.query(
      `SELECT c.slug, p.id, p.created_at FROM products p
       JOIN companies c ON c.id = p.company_id
       WHERE p.is_active = true AND c.is_active = true AND c.page_type = 'shop'
       ORDER BY c.slug, p.id`
    );
    for (const row of p.rows) {
      if (!indexableShops.has(row.slug)) continue;
      urls.push({ loc: '/shop/' + row.slug + '/product/' + row.id, priority: '0.5', changefreq: 'weekly', lastmod: ymd(row.created_at) });
    }
  } catch (_) { /* DB optional for sitemap */ }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u =>
      `  <url>\n    <loc>${u.loc.startsWith('http') ? u.loc : SITE_ORIGIN + u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n') +
    '\n</urlset>\n'
  );
});

// llms.txt — curated, AI-friendly map of the site (llmstxt.org standard).
// Lets LLMs (ChatGPT, Gemini, Perplexity, Claude…) discover and cite our key pages.
router.get('/llms.txt', (req, res) => {
  const lines = [];
  lines.push('# OscarDevs');
  lines.push('');
  lines.push('> منصّة عربية لتصميم مواقع البورتفوليو والمتاجر الإلكترونية الاحترافية للمشاريع الصغيرة والمتوسطة في مصر والعالم العربي — تصميم سريع، أسعار مناسبة، وSEO جاهز.');
  lines.push('');
  lines.push('## صفحات أساسية');
  lines.push(`- [الرئيسية](${SITE_ORIGIN}/): نظرة عامة على خدمات تصميم المواقع والمتاجر.`);
  lines.push(`- [من نحن](${SITE_ORIGIN}/about): قصة OscarDevs ورؤيتها.`);
  lines.push(`- [اطلب موقعك](${SITE_ORIGIN}/apply): تقديم طلب إنشاء موقع بورتفوليو أو متجر إلكتروني.`);
  lines.push(`- [الأسئلة الشائعة](${SITE_ORIGIN}/faq): إجابات عن أكثر الأسئلة تكراراً.`);
  lines.push(`- [من أعمالنا](${SITE_ORIGIN}/our-work): تطبيقات ويب طوّرها فريق OscarDevs (Safari Kids، NeuroPilot، Kakeibo، Sokro).`);
  lines.push(`- [تواصل معنا](${SITE_ORIGIN}/contact): طرق التواصل مع الفريق.`);
  lines.push('');
  lines.push('## المدوّنة (أدلة عملية أصلية)');
  for (const a of ARTICLES) {
    lines.push(`- [${a.title}](${SITE_ORIGIN}/blog/${a.slug}): ${a.metaDescription || a.excerpt || ''}`);
  }
  lines.push('');
  lines.push('## قانوني');
  lines.push(`- [سياسة الخصوصية](${SITE_ORIGIN}/privacy)`);
  lines.push(`- [الشروط والأحكام](${SITE_ORIGIN}/terms)`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(lines.join('\n') + '\n');
});

module.exports = router;