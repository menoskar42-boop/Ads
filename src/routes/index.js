const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', (req, res) => {
  res.render('index');
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
    });
  } catch (err) {
    console.error('View route error:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
