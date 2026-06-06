const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { getPreset } = require('../lib/portfolio_presets');

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
    } catch (err) { console.error('Products query error:', err.message); }
  }

  let banners = [];
  try {
    banners = (await pool.query(
      'SELECT * FROM banner_slides WHERE company_id = $1 AND is_active = true ORDER BY order_index, created_at',
      [company.id]
    )).rows;
  } catch (bErr) { console.error('Banners query error:', bErr.message); }

  const cart = (req.session.carts && req.session.carts[company.slug]) || {};
  const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);

  // Portfolio tenants use the new premium template, EXCEPT 'petra' which
  // keeps its original full design as a reference.
  let view;
  if (company.page_type === 'shop') view = 'tenant_shop';
  else if (company.slug === 'petra') view = 'tenant';
  else view = 'tenant_portfolio';

  res.render(view, {
    company,
    preset: getPreset(company.profession),
    pageContent: company.page_content || {},
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
});

module.exports = router;
