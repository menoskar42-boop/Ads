const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { getPreset } = require('../lib/portfolio_presets');
const stock = require('../pharmacy/stock');
const push = require('../lib/push');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Guard for the public pharmacy order routes: tenant must be a pharmacy whose
// online store is enabled. Loads the settings row onto req.
async function pharmacyOrderGuard(req, res, next) {
  const company = req.tenant;
  if (!company || company.page_type !== 'pharmacy') {
    return res.status(404).render('404', { subdomain: company ? company.slug : null });
  }
  try {
    const s = (await pool.query('SELECT * FROM pharmacy_settings WHERE company_id = $1', [company.id])).rows[0] || {};
    if (!s.online_store_enabled) return res.redirect('/');
    req.pharmacySettings = s;
    next();
  } catch (e) { console.error('order guard error:', e.message); res.status(500).send('Error.'); }
}

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
  let activeProductCount = 0;
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
      // Total active catalogue size (independent of category/search filters)
      // drives the indexing quality gate below.
      activeProductCount = (await pool.query(
        'SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1 AND is_active = true',
        [company.id]
      )).rows[0].n;
    } catch (err) { console.error('Products query error:', err.message); }
  }

  // Pharmacy tenants load their live inventory (joined to the shared medicine
  // catalog) plus their settings. available_qty = qty - reserved so items held
  // for an online order don't read as sellable at the counter.
  let pharmacyItems = [];
  let pharmacySettings = null;
  let pharmacyStockCount = 0;
  if (company.page_type === 'pharmacy') {
    try {
      const q = (req.query.q || '').trim();
      const params = [company.id];
      let where = 'pi.company_id = $1';
      if (q) {
        where += ' AND (m.name_ar ILIKE $' + (params.push('%' + q + '%')) +
                 ' OR m.name_en ILIKE $' + params.length +
                 ' OR pi.barcode = $' + (params.push(q)) +
                 ' OR m.barcode = $' + params.length + ')';
      }
      pharmacyItems = (await pool.query(
        `SELECT pi.id, pi.medicine_id, pi.qty, pi.reserved_qty, pi.price, pi.expiry,
                GREATEST(pi.qty - pi.reserved_qty, 0) AS available_qty,
                m.name_ar, m.name_en, m.form, m.manufacturer
         FROM pharmacy_inventory pi
         JOIN medicines m ON m.id = pi.medicine_id
         WHERE ${where}
         ORDER BY m.name_ar`,
        params
      )).rows;
      pharmacyStockCount = (await pool.query(
        'SELECT COUNT(*)::int AS n FROM pharmacy_inventory WHERE company_id = $1',
        [company.id]
      )).rows[0].n;
      pharmacySettings = (await pool.query(
        'SELECT * FROM pharmacy_settings WHERE company_id = $1',
        [company.id]
      )).rows[0] || null;
    } catch (err) { console.error('Pharmacy query error:', err.message); }
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

  let view;
  if (company.page_type === 'shop') view = 'tenant_shop';
  else if (company.page_type === 'pharmacy') view = 'tenant_pharmacy';
  else view = 'tenant_portfolio';

  // Indexing quality gate: keep thin tenant pages out of the index (and away
  // from AdSense review) until they hold real content, then let them in
  // automatically. noindex,follow so links are still crawled. A filtered or
  // search view is never the canonical page, so it's also kept out.
  const descLen = (company.description || '').trim().length;
  const hasFilter = Boolean((req.query.q || '').trim()) || Number.isFinite(parseInt(req.query.category, 10));
  let indexable;
  if (company.page_type === 'shop') indexable = activeProductCount >= 3;
  else if (company.page_type === 'pharmacy') indexable = pharmacyStockCount >= 3;
  else indexable = portfolio.length >= 2 || descLen >= 120;
  const noindex = !indexable || hasFilter;
  // AdSense: never show ads on genuinely thin pages (filtered views still have
  // real content, so only true thinness suppresses ads).
  if (!indexable) res.locals.showAds = false;
  // Pharmacy pages carry no ads at all for now (owner's decision to keep the
  // pharmacy vertical clear of AdSense while the account is under review).
  if (company.page_type === 'pharmacy') res.locals.showAds = false;

  const preset = getPreset(company.profession);
  const pc = company.page_content || {};
  const pick = (k) => (Array.isArray(pc[k]) && pc[k].length ? pc[k] : preset[k]);
  const content = {
    stats: pick('stats'),
    testimonials: pick('testimonials'),
    process: pick('process'),
    faq: pick('faq'),
  };

  res.render(view, {
    company,
    noindex,
    preset,
    pageContent: pc,
    content,
    topAd:     ads.find(a => a.position === 'top')     || null,
    sidebarAd: ads.find(a => a.position === 'sidebar') || null,
    footerAd:  ads.find(a => a.position === 'footer')  || null,
    portfolio,
    products,
    categories,
    banners,
    pharmacyItems,
    pharmacySettings,
    pharmacyStockCount,
    currentCategory: req.query.category || '',
    currentSearch: req.query.q || '',
    cartCount,
    sent: req.query.sent === '1',
    contactError: req.query.error || null,
  });
});

// Public order form for one medicine (?m=<medicine_id>).
router.get('/order', pharmacyOrderGuard, async (req, res) => {
  const company = req.tenant;
  const mid = parseInt(req.query.m, 10);
  try {
    const item = (await pool.query(
      `SELECT pi.medicine_id, pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available,
              m.name_ar, m.name_en, m.form
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE pi.company_id = $1 AND pi.medicine_id = $2`, [company.id, mid]
    )).rows[0];
    if (!item || Number(item.available) <= 0) return res.redirect('/');
    res.render('tenant_pharmacy_order', {
      company, item, settings: req.pharmacySettings, noindex: true, done: false, order: null,
      error: req.query.e || null,
      canonical: 'https://' + company.slug + '.oscardevs.com/',
    });
  } catch (e) { console.error('order form error:', e.message); res.status(500).send('Error.'); }
});

// Create the order + reserve stock (owner rule #14: reserved so it isn't sold
// at the counter). Single-item quick order.
router.post('/order', pharmacyOrderGuard, async (req, res) => {
  const company = req.tenant;
  const b = req.body || {};
  const mid = parseInt(b.medicine_id, 10);
  const qty = Math.max(1, parseInt(b.qty, 10) || 1);
  const name = String(b.customer_name || '').trim().slice(0, 100);
  const phone = String(b.customer_phone || '').trim().slice(0, 30);
  const address = String(b.customer_address || '').trim().slice(0, 300);
  if (!mid || !name || !phone) return res.redirect('/order?m=' + mid + '&e=1');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = (await client.query(
      `SELECT pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available, m.name_ar
       FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
       WHERE pi.company_id = $1 AND pi.medicine_id = $2 FOR UPDATE`, [company.id, mid]
    )).rows[0];
    if (!inv || Number(inv.available) < qty) { await client.query('ROLLBACK'); return res.redirect('/order?m=' + mid + '&e=2'); }
    const price = Number(inv.price) || 0;
    const total = price * qty;
    const ord = (await client.query(
      `INSERT INTO pharmacy_orders (company_id, customer_name, customer_phone, customer_address, total_amount, status)
       VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id`,
      [company.id, name, phone, address || null, total]
    )).rows[0];
    await client.query(
      `INSERT INTO pharmacy_order_items (order_id, medicine_id, name, qty, price) VALUES ($1,$2,$3,$4,$5)`,
      [ord.id, mid, inv.name_ar, qty, price]
    );
    await stock.reserve(client, company.id, [{ medicine_id: mid, qty }]);
    await client.query('COMMIT');
    // Mobile push to the pharmacy owner — same channel as shop orders/messages.
    push.sendToCompany(company.id, {
      title: '🧾 طلب صيدلية جديد',
      body: `طلب جديد من ${name}: ${inv.name_ar} × ${qty}`,
      url: '/pharmacy/orders',
    }, 'order').catch((e) => console.error('[push pharmacy order] error:', e.message));
    res.render('tenant_pharmacy_order', {
      company, item: null, settings: req.pharmacySettings, noindex: true, done: true,
      order: { id: ord.id, name: inv.name_ar, qty, total },
      canonical: 'https://' + company.slug + '.oscardevs.com/',
    });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('order create error:', e.message);
    res.redirect('/order?m=' + mid + '&e=3');
  } finally {
    client.release();
  }
});

module.exports = router;
