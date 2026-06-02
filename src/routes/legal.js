const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TERMS_VERSION = '1.0';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';

router.get('/privacy', (req, res) => {
  res.render('legal/privacy');
});

router.get('/terms', (req, res) => {
  res.render('legal/terms', { termsVersion: TERMS_VERSION });
});

router.get('/about', (req, res) => {
  res.render('legal/about');
});

router.get('/contact', (req, res) => {
  res.render('legal/contact', { sent: req.query.sent === '1', error: req.query.error || null });
});

router.post('/contact', async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 100);
  const email = String(req.body.email || '').trim().slice(0, 150);
  const phone = String(req.body.phone || '').trim().slice(0, 30);
  const message = String(req.body.message || '').trim().slice(0, 5000);
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

router.get('/sitemap.xml', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: '/',         priority: '1.0', changefreq: 'weekly',  lastmod: today },
    { loc: '/about',    priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/contact',  priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/blog',     priority: '0.9', changefreq: 'weekly',  lastmod: today },
    { loc: '/apply',    priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/privacy',  priority: '0.4', changefreq: 'yearly',  lastmod: today },
    { loc: '/terms',    priority: '0.4', changefreq: 'yearly',  lastmod: today },
  ];
  for (const a of ARTICLES) {
    urls.push({ loc: '/blog/' + a.slug, priority: '0.7', changefreq: 'monthly', lastmod: a.date });
  }
  try {
    const r = await pool.query("SELECT slug FROM companies WHERE is_active = true ORDER BY slug");
    for (const row of r.rows) urls.push({ loc: '/view/' + row.slug, priority: '0.6', changefreq: 'weekly', lastmod: today });
  } catch (_) { /* DB optional for sitemap */ }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u =>
      `  <url>\n    <loc>${SITE_ORIGIN}${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    ).join('\n') +
    '\n</urlset>\n'
  );
});

module.exports = router;
