const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', (req, res) => {
  res.render('index', {
    sent: req.query.sent === '1',
    contactError: req.query.error || null,
  });
});

const MAX_MESSAGE_LEN = 5000;

function validateContact(body) {
  const sender_name = (body.sender_name || '').trim();
  const sender_email = (body.sender_email || '').trim();
  const message = (body.message || '').trim();
  if (!sender_name) return { error: 'Name is required.' };
  if (!message) return { error: 'Message is required.' };
  if (message.length > MAX_MESSAGE_LEN) return { error: 'Message is too long.' };
  if (sender_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sender_email)) {
    return { error: 'Invalid email address.' };
  }
  return { sender_name, sender_email: sender_email || null, message };
}

router.post('/contact', async (req, res) => {
  const v = validateContact(req.body);
  if (v.error) return res.redirect(`/?error=${encodeURIComponent(v.error)}`);
  try {
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, message)
       VALUES (NULL, $1, $2, $3)`,
      [v.sender_name, v.sender_email, v.message]
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
  if (v.error) return res.redirect(`/view/${encodeURIComponent(slug)}?error=${encodeURIComponent(v.error)}`);
  try {
    const companyResult = await pool.query(
      'SELECT id FROM companies WHERE slug = $1 AND is_active = true',
      [slug]
    );
    if (!companyResult.rows.length) {
      return res.status(404).render('404', { subdomain: slug });
    }
    await pool.query(
      `INSERT INTO contact_messages (company_id, sender_name, sender_email, message)
       VALUES ($1, $2, $3, $4)`,
      [companyResult.rows[0].id, v.sender_name, v.sender_email, v.message]
    );
    res.redirect(`/view/${encodeURIComponent(slug)}?sent=1`);
  } catch (err) {
    console.error('[POST /contact/:slug] db error:', err);
    res.redirect(`/view/${encodeURIComponent(slug)}?error=${encodeURIComponent('Could not send message. Please try again.')}`);
  }
});

// Direct tenant preview: /view/:slug works on any host (Replit, localhost, etc.)
router.get('/view/:slug', async (req, res) => {
  const { slug } = req.params;
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

    res.render('tenant', {
      company,
      topAd:     ads.find(a => a.position === 'top')     || null,
      sidebarAd: ads.find(a => a.position === 'sidebar') || null,
      footerAd:  ads.find(a => a.position === 'footer')  || null,
      portfolio,
      sent: req.query.sent === '1',
      contactError: req.query.error || null,
    });
  } catch (err) {
    console.error('View route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
