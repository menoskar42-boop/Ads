const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { canonicalCompanyUrl, isProductionHost } = require('../lib/urls');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', (req, res) => {
  res.render('home', {
    sent: req.query.sent === '1',
    contactError: req.query.error || null,
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

router.post('/contact', async (req, res) => {
  const v = validateContact(req.body);
  if (v.error) return res.redirect(`/?error=${encodeURIComponent(v.error)}`);
  try {
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, sender_phone, message)
       VALUES (NULL, $1, $2, $3, $4)`,
      [v.sender_name, v.sender_email, v.sender_phone, v.message]
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
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, sender_phone, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [companyResult.rows[0].id, v.sender_name, v.sender_email, v.sender_phone, v.message]
    );
    res.redirect(`${canonicalCompanyUrl(slug, req)}?sent=1`);
  } catch (err) {
    console.error('[POST /contact/:slug] db error:', err);
    res.redirect(`${canonicalCompanyUrl(slug, req)}?error=${encodeURIComponent('Could not send message. Please try again.')}`);
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
