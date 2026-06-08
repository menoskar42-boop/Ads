const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TERMS_VERSION = '1.0';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';

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

const https = require('https');
const { ARTICLES } = require('./blog_articles');

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '';
const INDEXNOW_HOST = (process.env.SITE_ORIGIN || 'https://oscardevs.com').replace(/^https?:\/\//, '');

if (INDEXNOW_KEY) {
  router.get('/' + INDEXNOW_KEY + '.txt', (req, res) => {
    res.type('text/plain').send(INDEXNOW_KEY);
  });
}

router.get('/admin/seo/ping-indexnow', (req, res) => {
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
  const body = JSON.stringify({ host: INDEXNOW_HOST, key: INDEXNOW_KEY, urlList: urls });
  const req2 = https.request({
    method: 'POST', hostname: 'api.indexnow.org', path: '/IndexNow',
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
  }, (resp) => {
    let data = ''; resp.on('data', c => data += c);
    resp.on('end', () => res.type('text/plain').send(`IndexNow status ${resp.statusCode}\n${data}\n\nPinged ${urls.length} URLs.`));
  });
  req2.on('error', (e) => res.status(500).send('IndexNow error: ' + e.message));
  req2.write(body); req2.end();
});

router.get('/sitemap.xml', async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: '/',         priority: '1.0', changefreq: 'weekly',  lastmod: today },
    { loc: '/about',    priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/contact',  priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/blog',     priority: '0.9', changefreq: 'weekly',  lastmod: today },
    { loc: '/apply',    priority: '0.7', changefreq: 'monthly', lastmod: today },
    { loc: '/faq',      priority: '0.8', changefreq: 'monthly', lastmod: today },
    { loc: '/privacy',  priority: '0.4', changefreq: 'yearly',  lastmod: today },
    { loc: '/terms',    priority: '0.4', changefreq: 'yearly',  lastmod: today },
  ];
  for (const a of ARTICLES) {
    urls.push({ loc: '/blog/' + a.slug, priority: '0.7', changefreq: 'monthly', lastmod: a.date });
  }
  try {
    const r = await pool.query("SELECT slug FROM companies WHERE is_active = true ORDER BY slug");
    for (const row of r.rows) urls.push({ loc: '/view/' + row.slug, priority: '0.6', changefreq: 'weekly', lastmod: today });
    // Active shop products — helps Google index individual product pages.
    const p = await pool.query(
      `SELECT c.slug, p.id FROM products p
       JOIN companies c ON c.id = p.company_id
       WHERE p.is_active = true AND c.is_active = true AND c.page_type = 'shop'
       ORDER BY c.slug, p.id`
    );
    for (const row of p.rows) urls.push({ loc: '/shop/' + row.slug + '/product/' + row.id, priority: '0.5', changefreq: 'weekly', lastmod: today });
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