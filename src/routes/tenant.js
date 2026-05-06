const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (req, res) => {
  const company = req.tenant;
  const ads = req.tenantAds || [];

  const portfolioResult = await pool.query(
    'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
    [company.id]
  );

  res.render('tenant', {
    company,
    topAd:     ads.find(a => a.position === 'top')     || null,
    sidebarAd: ads.find(a => a.position === 'sidebar') || null,
    footerAd:  ads.find(a => a.position === 'footer')  || null,
    portfolio: portfolioResult.rows,
  });
});

module.exports = router;
