const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { canonicalCompanyUrl, isProductionHost } = require('../lib/urls');
const push = require('../lib/push');
const { ARTICLES } = require('./blog_articles');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Latest 6 articles featured on the homepage — surfaces real content for
// users, crawlers, and the AdSense reviewer.
const LATEST_ARTICLES = ARTICLES.slice()
  .sort((a, b) => b.date.localeCompare(a.date))
  .slice(0, 6);

router.get('/', (req, res) => {
  res.render('home', {
    sent: req.query.sent === '1',
    contactError: req.query.error || null,
    showAds: true, // marketing homepage is content
    latestArticles: LATEST_ARTICLES,
  });
});

const MAX_MESSAGE_LEN = 5000;

function validateContact(body) {
  const sender_name = (body.sender_name || '').trim();
  const sender_email = (body.sender_email || '').trim();
  const sender_phone = (body.sender_phone || '').trim();
  const message = (body.message || '').trim();
  if (!sender_name) return { error: 'Name is required.' };
  if (!message) return { error: 'Message is required.' };
  if (message.length > MAX_MESSAGE_LEN) return { error: 'Message is too long.' };
  if (sender_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender_email)) {
    return { error: 'Invalid email address.' };
  }
  if (sender_phone && sender_phone.length > 30) {
    return { error: 'Phone number is too long.' };
  }
  return {
    sender_name,
    sender_email: sender_email || null,
    sender_phone: sender_phone || null,
    message,
  };
}

// Lightweight spam heuristics (no CAPTCHA, never blocks a real visitor). A hit
// doesn't reject the message — it just files it under the "spam" folder.
//  - honeypot: a hidden field humans never see; bots fill it.
//  - timing: forms submitted in under ~2.5s are almost always bots.
//  - link-stuffing: 2+ URLs in a contact message is a strong spam signal.
function classifySpam(body) {
  if (String(body.website || body.url2 || '').trim()) return true;
  const ft = parseInt(body.ft, 10);
  if (Number.isFinite(ft)) {
    const age = Date.now() - ft;
    if (age >= 0 && age < 2500) return true;
  }
  const msg = String(body.message || '');
  const email = String(body.sender_email || '').toLowerCase().trim();
  // link-stuffing: 2+ URLs in a contact message is a strong spam signal.
  const links = (msg.match(/https?:\/\//gi) || []).length;
  if (links >= 2) return true;
  // Anonymous file-drop / URL-shortener links are a classic malware & phishing
  // vector in cold contact-form spam (e.g. a mega.nz link wrapped in an emotional
  // story to bait a click). Flag even a single one.
  if (/\b(?:mega\.nz|mega\.io|anonfiles|anonfile|mediafire|dropmefiles|gofile\.io|bit\.ly|tinyurl|cutt\.ly|is\.gd|grabify|iplogger|t\.me)\b/i.test(msg)) return true;
  // Obviously fake / throwaway sender addresses.
  if (/^(?:test|testing|admin|noreply|no-reply|spam|abuse|example)@/i.test(email)) return true;
  if (/@(?:mailinator\.com|guerrillamail\.\w+|10minutemail\.\w+|tempmail\.\w+|trashmail\.\w+|yopmail\.\w+|sharklasers\.com|example\.(?:com|org|net))$/i.test(email)) return true;
  return false;
}

router.post('/contact', async (req, res) => {
  const v = validateContact(req.body);
  if (v.error) return res.redirect(`/?error=${encodeURIComponent(v.error)}`);
  try {
    // Platform-inbox messages get the same spam screening as tenant messages,
    // so throwaway-email + file-drop-link bait lands in the spam folder instead
    // of the main inbox.
    const isSpam = classifySpam(req.body);
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, sender_phone, message, is_spam)
       VALUES (NULL, $1, $2, $3, $4, $5)`,
      [v.sender_name, v.sender_email, v.sender_phone, v.message, isSpam]
    );
    res.redirect('/?sent=1');
  } catch (err) {
    console.error('[POST /contact] db error:', err);
    res.redirect(`/?error=${encodeURIComponent('Could not send message. Please try again.')}`);
  }
});

router.post('/contact/:slug', async (req, res) => {
  const { slug } = req.params;
  const v = validateContact(req.body);
  if (v.error) return res.redirect(`${canonicalCompanyUrl(slug, req)}?error=${encodeURIComponent(v.error)}`);
  try {
    const companyResult = await pool.query(
      'SELECT id FROM companies WHERE slug = $1 AND is_active = true',
      [slug]
    );
    if (!companyResult.rows.length) {
      return res.status(404).render('404', { subdomain: slug });
    }
    const companyId = companyResult.rows[0].id;
    const isSpam = classifySpam(req.body);
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, sender_phone, message, is_spam)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [companyId, v.sender_name, v.sender_email, v.sender_phone, v.message, isSpam]
    );
    // Don't ping the owner for spam — it lands silently in the spam folder.
    if (!isSpam) {
      push.sendToCompany(companyId, {
        title: '📩 رسالة جديدة',
        body: `وصلتك رسالة جديدة من ${v.sender_name}`,
        url: '/company/messages',
      }, 'message').catch((e) => console.error('[push contact] error:', e.message));
    }
    // Always answer the sender the same way (don't reveal spam detection to bots).
    res.redirect(`${canonicalCompanyUrl(slug, req)}?sent=1`);
  } catch (err) {
    console.error('[POST /contact/:slug] db error:', err);
    res.redirect(`${canonicalCompanyUrl(slug, req)}?error=${encodeURIComponent('Could not send message. Please try again.')}`);
  }
});

// Per-tenant PWA manifest. Lets each subdomain ship its own install icon
// + name when a visitor adds the site to their phone's home screen.
router.get('/view/:slug/manifest.webmanifest', async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT slug, company_name, description, logo_url, theme_color FROM companies WHERE slug = $1 AND is_active = true',
      [req.params.slug]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'not found' });
    const c = r.rows[0];
    const startUrl = '/view/' + c.slug;
    const icon = c.logo_url || '/logo.png';
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json({
      name: c.company_name,
      short_name: c.company_name.slice(0, 12),
      description: c.description || c.company_name,
      start_url: startUrl,
      scope: startUrl,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: c.theme_color || '#1e3a8a',
      lang: 'ar',
      dir: 'rtl',
      icons: [
        { src: icon, sizes: 'any',     type: 'image/png', purpose: 'any' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: icon, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    });
  } catch (err) {
    console.error('[manifest]', err);
    res.status(500).json({ error: 'failed' });
  }
});

// Direct tenant preview: /view/:slug works on any host (Replit, localhost, etc.)
// On a production host (e.g. oscardevs.com) we 301 to the canonical subdomain URL.
router.get('/view/:slug', async (req, res) => {
  const { slug } = req.params;
  if (isProductionHost(req) && !('noredirect' in req.query)) {
    const qs = Object.keys(req.query).length
      ? '?' + new URLSearchParams(req.query).toString()
      : '';
    return res.redirect(301, `${canonicalCompanyUrl(slug, req)}${qs}`);
  }
  try {
    const companyResult = await pool.query(
      'SELECT * FROM companies WHERE slug = $1 AND is_active = true',
      [slug]
    );
    if (companyResult.rows.length === 0) {
      return res.status(404).render('404', { subdomain: slug });
    }
    const company = companyResult.rows[0];
    const adsResult = await pool.query(
      'SELECT * FROM banner_ads WHERE company_id = $1 AND is_active = true',
      [company.id]
    );
    const ads = adsResult.rows;

    let portfolio = [];
    try {
      const portfolioResult = await pool.query(
        'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
        [company.id]
      );
      portfolio = portfolioResult.rows;
    } catch (pErr) {
      console.error('Portfolio query skipped:', pErr.message);
    }

    let products = [];
    let categories = [];
    if (company.page_type === 'shop') {
      try {
        categories = (await pool.query(
          'SELECT * FROM product_categories WHERE company_id = $1 ORDER BY order_index, name',
          [company.id]
        )).rows;
        const filterCat = parseInt(req.query.category, 10);
        const q = (req.query.q || '').trim();
        const params = [company.id];
        let where = 'company_id = $1 AND is_active = true';
        if (Number.isFinite(filterCat)) { where += ' AND category_id = $' + (params.push(filterCat)); }
        if (q) { where += ' AND (name ILIKE $' + (params.push('%' + q + '%')) + ' OR description ILIKE $' + params.length + ')'; }
        const productsResult = await pool.query(
          `SELECT * FROM products WHERE ${where} ORDER BY created_at DESC`,
          params
        );
        products = productsResult.rows;
      } catch (pErr) { console.error('Products query skipped:', pErr.message); }
    }

    let banners = [];
    try {
      banners = (await pool.query(
        'SELECT * FROM banner_slides WHERE company_id = $1 AND is_active = true ORDER BY order_index, created_at',
        [company.id]
      )).rows;
    } catch (bErr) { console.error('Banners query skipped:', bErr.message); }

    const cart = (req.session.carts && req.session.carts[slug]) || {};
    const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);

    const view = company.page_type === 'shop' ? 'tenant_shop' : 'tenant';
    res.render(view, {
      company,
      topAd:     ads.find(a => a.position === 'top')     || null,
      sidebarAd: ads.find(a => a.position === 'sidebar') || null,
      footerAd:  ads.find(a => a.position === 'footer')  || null,
      portfolio,
      products,
      categories,
      banners,
      currentCategory: req.query.category || '',
      currentSearch: req.query.q || '',
      cartCount,
      sent: req.query.sent === '1',
      contactError: req.query.error || null,
    });
  } catch (err) {
    console.error('View route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
