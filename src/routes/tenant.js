const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (req, res) => {
  const company = req.tenant;
  const ads = req.tenantAds || [];

  let portfolio = [];
  try {
    const portfolioResult = await pool.query(
      'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
      [company.id]
    );
    portfolio = portfolioResult.rows;
  } catch (err) {
    console.error('Portfolio query error:', err.message);
  }

  let products = [];
  if (company.page_type === 'shop') {
    try {
      const productsResult = await pool.query(
        'SELECT * FROM products WHERE company_id = $1 AND is_active = true ORDER BY created_at DESC',
        [company.id]
      );
      products = productsResult.rows;
    } catch (err) { console.error('Products query error:', err.message); }
  }

  const cart = (req.session.carts && req.session.carts[company.slug]) || {};
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);

  const view = company.page_type === 'shop' ? 'tenant_shop' : 'tenant';
  res.render(view, {
    company,
    topAd:     ads.find(a => a.position === 'top')     || null,
    sidebarAd: ads.find(a => a.position === 'sidebar') || null,
    footerAd:  ads.find(a => a.position === 'footer')  || null,
    portfolio,
    products,
    cartCount,
    sent: req.query.sent === '1',
    contactError: req.query.error || null,
  });
});

module.exports = router;
