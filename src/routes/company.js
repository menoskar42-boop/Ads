const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Pool } = require('pg');
const requireLogin = require('../middleware/auth');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const imageMimeRegex = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml)$/;

function makeUploader(prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}-${req.session.companyId}-${Date.now()}${ext}`);
    },
  });
  return multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (imageMimeRegex.test(file.mimetype)) cb(null, true);
      else cb(new Error('Only image files (PNG, JPEG, GIF, WEBP, SVG) are allowed.'));
    },
  });
}

const uploadLogo = makeUploader('logo').single('logo_file');
const uploadItemImage = makeUploader('item').single('image_file');
const uploadProductImage = makeUploader('product').single('image_file');

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

router.use(async (req, res, next) => {
  res.locals.unreadCount = 0;
  res.locals.pendingOrdersCount = 0;
  res.locals.companyPageType = 'portfolio';
  if (req.session.companyId) {
    try {
      const r = await pool.query(
        `SELECT
           (SELECT COUNT(*) FROM contact_messages WHERE company_id = $1 AND is_read = false) AS unread,
           (SELECT COUNT(*) FROM orders WHERE company_id = $1 AND status = 'pending') AS pending_orders,
           (SELECT page_type FROM companies WHERE id = $1) AS page_type`,
        [req.session.companyId]
      );
      res.locals.unreadCount = parseInt(r.rows[0].unread, 10);
      res.locals.pendingOrdersCount = parseInt(r.rows[0].pending_orders, 10);
      res.locals.companyPageType = r.rows[0].page_type || 'portfolio';
    } catch (e) { /* non-critical */ }
  }
  next();
});

async function requireShop(req, res, next) {
  if (!req.session.companyId) return res.redirect('/company/login');
  try {
    const r = await pool.query('SELECT page_type FROM companies WHERE id = $1', [req.session.companyId]);
    if (!r.rows.length || r.rows[0].page_type !== 'shop') {
      return res.status(404).render('404', { subdomain: null });
    }
    next();
  } catch (err) {
    console.error('requireShop error:', err);
    res.status(500).send('Error.');
  }
}

/* ─── LOGIN ─────────────────────────────────────────────── */
router.get('/login', (req, res) => {
  if (req.session.companyId) return res.redirect('/company/dashboard');
  res.render('company/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query(
      `SELECT cu.*, c.company_name, c.theme_color, c.slug
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.email = $1`,
      [email]
    );
    if (!result.rows.length) {
      return res.render('company/login', { error: 'Invalid email or password.' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.render('company/login', { error: 'Invalid email or password.' });
    }
    req.session.companyId = user.company_id;
    req.session.companyUserId = user.id;
    req.session.companyName = user.company_name;
    req.session.themeColor = user.theme_color;
    req.session.companySlug = user.slug;
    req.session.adminLang = user.lang || 'ar';
    res.redirect('/company/dashboard');
  } catch (err) {
    console.error('Login error:', err);
    res.render('company/login', { error: 'Something went wrong. Please try again.' });
  }
});

/* ─── LOGOUT ─────────────────────────────────────────────── */
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/company/login'));
});

/* ─── DASHBOARD ──────────────────────────────────────────── */
router.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    const portfolioCount = await pool.query(
      'SELECT COUNT(*) FROM portfolio_items WHERE company_id = $1', [req.session.companyId]
    );
    res.render('company/dashboard', {
      company: result.rows[0],
      portfolioCount: parseInt(portfolioCount.rows[0].count),
      session: req.session,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading dashboard.');
  }
});

/* ─── PROFILE ────────────────────────────────────────────── */
router.get('/profile', requireLogin, async (req, res) => {
  const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  res.render('company/profile', { company: result.rows[0], session: req.session, success: null, error: null });
});

router.post('/profile', requireLogin, (req, res) => {
  uploadLogo(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      try {
        const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
        return res.render('company/profile', {
          company: result.rows[0] || {},
          session: req.session,
          success: null,
          error: message,
        });
      } catch (renderErr) {
        console.error('[POST /profile] render fallback failed:', renderErr);
        return res.status(500).send(message);
      }
    };

    if (uploadErr) {
      console.error('[POST /profile] multer error:', uploadErr);
      return renderError(`Upload failed: ${uploadErr.message}`);
    }

    console.log('[POST /profile] file:', req.file?.filename, 'body:', Object.keys(req.body));
    const {
      company_name, description, theme_color, logo_url, currency,
      promo_text, hero_headline, hero_subtext, hero_cta_text,
      contact_phone, contact_whatsapp, contact_email, contact_address,
    } = req.body;
    const finalLogoUrl = req.file ? `/uploads/${req.file.filename}` : (logo_url || null);
    const clean = (v) => { const s = (v || '').trim(); return s || null; };
    const on = (v) => v === 'on' || v === 'true';
    const showTrustBar = on(req.body.show_trust_bar);
    const showPromoBar = on(req.body.show_promo_bar);
    const showHeroCards = on(req.body.show_hero_cards);
    const showBanners = on(req.body.show_banners);
    const showCategories = on(req.body.show_categories);
    const showContact = on(req.body.show_contact);

    try {
      await pool.query(
        `UPDATE companies SET
           company_name=$1, description=$2, theme_color=$3, logo_url=$4, currency=$5,
           promo_text=$6, hero_headline=$7, hero_subtext=$8, hero_cta_text=$9,
           contact_phone=$10, contact_whatsapp=$11, contact_email=$12, contact_address=$13,
           show_trust_bar=$14, show_promo_bar=$16, show_hero_cards=$17, show_banners=$18,
           show_categories=$19, show_contact=$20
         WHERE id=$15`,
        [
          company_name, description, theme_color, finalLogoUrl, clean(currency) || 'EGP',
          clean(promo_text), clean(hero_headline), clean(hero_subtext), clean(hero_cta_text),
          clean(contact_phone), clean(contact_whatsapp), clean(contact_email), clean(contact_address),
          showTrustBar, req.session.companyId,
          showPromoBar, showHeroCards, showBanners, showCategories, showContact,
        ]
      );
      req.session.companyName = company_name;
      req.session.themeColor = theme_color;
      const result = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
      console.log('[POST /profile] success');
      return res.render('company/profile', {
        company: result.rows[0],
        session: req.session,
        success: 'Profile updated successfully.',
        error: null,
      });
    } catch (dbErr) {
      console.error('[POST /profile] db error:', dbErr);
      return renderError(`Failed to update profile: ${dbErr.message}`);
    }
  });
});

/* ─── PORTFOLIO ──────────────────────────────────────────── */
router.get('/portfolio', requireLogin, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
    [req.session.companyId]
  );
  res.render('company/portfolio', { items: result.rows, session: req.session, error: null });
});

router.post('/portfolio/add', requireLogin, (req, res) => {
  uploadItemImage(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      try {
        const result = await pool.query(
          'SELECT * FROM portfolio_items WHERE company_id = $1 ORDER BY order_index, created_at DESC',
          [req.session.companyId]
        );
        return res.render('company/portfolio', {
          items: result.rows,
          session: req.session,
          error: message,
        });
      } catch (renderErr) {
        console.error('[POST /portfolio/add] render fallback failed:', renderErr);
        return res.status(500).send(message);
      }
    };

    if (uploadErr) {
      console.error('[POST /portfolio/add] multer error:', uploadErr);
      return renderError(`Upload failed: ${uploadErr.message}`);
    }

    console.log('[POST /portfolio/add] file:', req.file?.filename, 'body:', Object.keys(req.body));
    const { title, description, image_url, order_index } = req.body;
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : (image_url || null);

    try {
      await pool.query(
        `INSERT INTO portfolio_items (company_id, title, description, image_url, order_index)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.session.companyId, title, description, finalImageUrl, parseInt(order_index) || 0]
      );
      console.log('[POST /portfolio/add] success');
      return res.redirect('/company/portfolio');
    } catch (dbErr) {
      console.error('[POST /portfolio/add] db error:', dbErr);
      return renderError(`Failed to add item: ${dbErr.message}`);
    }
  });
});

router.post('/portfolio/delete/:id', requireLogin, async (req, res) => {
  await pool.query(
    'DELETE FROM portfolio_items WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/portfolio');
});

/* ─── MESSAGES ───────────────────────────────────────────── */
router.get('/messages', requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM contact_messages WHERE company_id = $1 ORDER BY created_at DESC',
      [req.session.companyId]
    );
    res.render('company/messages', { messages: result.rows, session: req.session });
  } catch (err) {
    console.error('[GET /messages] error:', err);
    res.status(500).send('Error loading messages.');
  }
});

router.post('/messages/:id/read', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE contact_messages SET is_read = true WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/messages');
});

router.post('/messages/:id/delete', requireLogin, async (req, res) => {
  await pool.query(
    'DELETE FROM contact_messages WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/messages');
});

async function fetchCategories(companyId) {
  const r = await pool.query(
    'SELECT * FROM product_categories WHERE company_id = $1 ORDER BY order_index, name',
    [companyId]
  );
  return r.rows;
}

/* ─── CATEGORIES (shop only) ─────────────────────────────── */
router.get('/categories', requireLogin, requireShop, async (req, res) => {
  const categories = await fetchCategories(req.session.companyId);
  res.render('company/categories', { categories, session: req.session, error: null });
});

router.post('/categories/add', requireLogin, requireShop, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.redirect('/company/categories');
  try {
    await pool.query(
      'INSERT INTO product_categories (company_id, name) VALUES ($1, $2)',
      [req.session.companyId, name]
    );
  } catch (err) { console.error('[POST /categories/add] error:', err); }
  res.redirect('/company/categories');
});

router.post('/categories/:id/rename', requireLogin, requireShop, async (req, res) => {
  const name = (req.body.name || '').trim();
  if (name) {
    await pool.query(
      'UPDATE product_categories SET name = $1 WHERE id = $2 AND company_id = $3',
      [name, req.params.id, req.session.companyId]
    );
  }
  res.redirect('/company/categories');
});

router.post('/categories/:id/delete', requireLogin, requireShop, async (req, res) => {
  // Orphan products in this category — set their category_id to NULL
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE products SET category_id = NULL WHERE category_id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    await client.query(
      'DELETE FROM product_categories WHERE id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /categories/:id/delete] error:', err);
  } finally { client.release(); }
  res.redirect('/company/categories');
});

/* ─── PRODUCTS (shop only) ───────────────────────────────── */
router.get('/products', requireLogin, requireShop, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id
       WHERE p.company_id = $1 ORDER BY p.created_at DESC`,
      [req.session.companyId]
    );
    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
    res.render('company/products', {
      products: result.rows,
      company: company.rows[0],
      session: req.session,
    });
  } catch (err) {
    console.error('[GET /products] error:', err);
    res.status(500).send('Error loading products.');
  }
});

router.get('/products/add', requireLogin, requireShop, async (req, res) => {
  const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  const categories = await fetchCategories(req.session.companyId);
  res.render('company/product_form', {
    product: null,
    company: company.rows[0],
    categories,
    images: [],
    session: req.session,
    error: null,
  });
});

router.post('/products/add', requireLogin, requireShop, (req, res) => {
  uploadProductImage(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
      const categories = await fetchCategories(req.session.companyId);
      return res.render('company/product_form', {
        product: req.body,
        company: company.rows[0],
        categories,
        images: [],
        session: req.session,
        error: message,
      });
    };
    if (uploadErr) return renderError(`Upload failed: ${uploadErr.message}`);
    const { name, description, price, stock, image_url } = req.body;
    if (!name || price === undefined) return renderError('Name and price are required.');
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) return renderError('Invalid price.');
    const stockNum = parseInt(stock, 10);
    if (isNaN(stockNum) || stockNum < 0) return renderError('Invalid stock.');
    let categoryId = parseInt(req.body.category_id, 10);
    if (!Number.isFinite(categoryId)) categoryId = null;
    if (categoryId !== null) {
      const c = await pool.query(
        'SELECT id FROM product_categories WHERE id = $1 AND company_id = $2',
        [categoryId, req.session.companyId]
      );
      if (!c.rows.length) categoryId = null;
    }
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : (image_url || null);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const name_ar = (req.body.name_ar || '').trim() || null;
      const name_en = (req.body.name_en || '').trim() || null;
      const description_ar = (req.body.description_ar || '').trim() || null;
      const description_en = (req.body.description_en || '').trim() || null;
      const finalName = name || name_ar || name_en || '';
      const ins = await client.query(
        `INSERT INTO products (company_id, name, description, price, image_url, stock, is_active, category_id, name_ar, name_en, description_ar, description_en)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11) RETURNING id`,
        [req.session.companyId, finalName, description || null, priceNum, finalImageUrl, stockNum, categoryId, name_ar, name_en, description_ar, description_en]
      );
      if (stockNum > 0) {
        await client.query(
          `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, notes)
           VALUES ($1, $2, $3, 'restock', 'Initial stock on creation')`,
          [ins.rows[0].id, req.session.companyId, stockNum]
        );
      }
      await client.query('COMMIT');
      res.redirect('/company/products');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[POST /products/add] db error:', err);
      return renderError(`Failed to add product: ${err.message}`);
    } finally { client.release(); }
  });
});

router.get('/products/:id/edit', requireLogin, requireShop, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM products WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  if (!result.rows.length) return res.redirect('/company/products');
  const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
  const categories = await fetchCategories(req.session.companyId);
  const images = await pool.query(
    'SELECT * FROM product_images WHERE product_id = $1 ORDER BY order_index, created_at',
    [req.params.id]
  );
  res.render('company/product_form', {
    product: result.rows[0],
    company: company.rows[0],
    categories,
    images: images.rows,
    session: req.session,
    error: null,
  });
});

router.post('/products/:id/edit', requireLogin, requireShop, (req, res) => {
  uploadProductImage(req, res, async (uploadErr) => {
    const renderError = async (message) => {
      const result = await pool.query(
        'SELECT * FROM products WHERE id = $1 AND company_id = $2',
        [req.params.id, req.session.companyId]
      );
      const company = await pool.query('SELECT * FROM companies WHERE id = $1', [req.session.companyId]);
      const categories = await fetchCategories(req.session.companyId);
      const images = await pool.query(
        'SELECT * FROM product_images WHERE product_id = $1 ORDER BY order_index, created_at',
        [req.params.id]
      );
      return res.render('company/product_form', {
        product: result.rows[0] || req.body,
        company: company.rows[0],
        categories,
        images: images.rows,
        session: req.session,
        error: message,
      });
    };
    if (uploadErr) return renderError(`Upload failed: ${uploadErr.message}`);
    const { name, description, price, stock, image_url } = req.body;
    if (!name || price === undefined) return renderError('Name and price are required.');
    const priceNum = parseFloat(price);
    const stockNum = parseInt(stock, 10);
    if (isNaN(priceNum) || priceNum < 0) return renderError('Invalid price.');
    if (isNaN(stockNum) || stockNum < 0) return renderError('Invalid stock.');
    let categoryId = parseInt(req.body.category_id, 10);
    if (!Number.isFinite(categoryId)) categoryId = null;
    if (categoryId !== null) {
      const c = await pool.query(
        'SELECT id FROM product_categories WHERE id = $1 AND company_id = $2',
        [categoryId, req.session.companyId]
      );
      if (!c.rows.length) categoryId = null;
    }
    const finalImageUrl = req.file ? `/uploads/${req.file.filename}` : (image_url || null);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const before = await client.query('SELECT stock FROM products WHERE id = $1 AND company_id = $2', [req.params.id, req.session.companyId]);
      const beforeStock = before.rows.length ? before.rows[0].stock : 0;
      const name_ar = (req.body.name_ar || '').trim() || null;
      const name_en = (req.body.name_en || '').trim() || null;
      const description_ar = (req.body.description_ar || '').trim() || null;
      const description_en = (req.body.description_en || '').trim() || null;
      const finalName = name || name_ar || name_en || '';
      await client.query(
        `UPDATE products SET name=$1, description=$2, price=$3, image_url=$4, stock=$5, category_id=$6,
         name_ar=$7, name_en=$8, description_ar=$9, description_en=$10
         WHERE id=$11 AND company_id=$12`,
        [finalName, description || null, priceNum, finalImageUrl, stockNum, categoryId,
         name_ar, name_en, description_ar, description_en, req.params.id, req.session.companyId]
      );
      const diff = stockNum - beforeStock;
      if (diff !== 0) {
        await client.query(
          `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, notes)
           VALUES ($1, $2, $3, 'adjustment', 'Adjusted via product edit')`,
          [req.params.id, req.session.companyId, diff]
        );
      }
      await client.query('COMMIT');
      res.redirect('/company/products');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[POST /products/:id/edit] db error:', err);
      return renderError(`Failed to update product: ${err.message}`);
    } finally { client.release(); }
  });
});

router.post('/products/:id/toggle-active', requireLogin, requireShop, async (req, res) => {
  await pool.query(
    'UPDATE products SET is_active = NOT is_active WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/products');
});

router.post('/products/:id/delete', requireLogin, requireShop, async (req, res) => {
  await pool.query(
    'DELETE FROM products WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/products');
});

/* ─── ORDERS (shop only) ─────────────────────────────────── */
router.get('/orders', requireLogin, requireShop, async (req, res) => {
  const status = req.query.status && ORDER_STATUSES.includes(req.query.status) ? req.query.status : null;
  const params = [req.session.companyId];
  let where = 'WHERE company_id = $1';
  if (status) { where += ' AND status = $2'; params.push(status); }
  const result = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC`,
    params
  );
  res.render('company/orders', {
    orders: result.rows,
    currentStatus: status || '',
    statuses: ORDER_STATUSES,
    session: req.session,
  });
});

router.get('/orders/:id', requireLogin, requireShop, async (req, res) => {
  const orderResult = await pool.query(
    'SELECT * FROM orders WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  if (!orderResult.rows.length) return res.redirect('/company/orders');
  const itemsResult = await pool.query(
    'SELECT * FROM order_items WHERE order_id = $1',
    [req.params.id]
  );
  res.render('company/order_detail', {
    order: orderResult.rows[0],
    items: itemsResult.rows,
    statuses: ORDER_STATUSES,
    session: req.session,
  });
});

router.post('/orders/:id/status', requireLogin, requireShop, async (req, res) => {
  const { status } = req.body;
  if (!ORDER_STATUSES.includes(status)) return res.redirect(`/company/orders/${req.params.id}`);
  await pool.query(
    'UPDATE orders SET status = $1 WHERE id = $2 AND company_id = $3',
    [status, req.params.id, req.session.companyId]
  );
  res.redirect(`/company/orders/${req.params.id}`);
});

/* ─── STOCK MOVEMENTS ────────────────────────────────────── */
router.get('/products/:id/stock', requireLogin, requireShop, async (req, res) => {
  const product = await pool.query(
    'SELECT * FROM products WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  if (!product.rows.length) return res.redirect('/company/products');
  const movements = await pool.query(
    'SELECT * FROM stock_movements WHERE product_id = $1 ORDER BY created_at DESC LIMIT 200',
    [req.params.id]
  );
  res.render('company/product_stock', {
    product: product.rows[0],
    movements: movements.rows,
    session: req.session,
    error: req.query.error || null,
  });
});

router.post('/products/:id/stock', requireLogin, requireShop, async (req, res) => {
  const change = parseInt(req.body.change_amount, 10);
  const reason = ['restock', 'adjustment', 'return'].includes(req.body.reason) ? req.body.reason : 'adjustment';
  if (!Number.isFinite(change) || change === 0) {
    return res.redirect(`/company/products/${req.params.id}/stock?error=${encodeURIComponent('Enter a non-zero change amount.')}`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE products SET stock = stock + $1
       WHERE id = $2 AND company_id = $3 AND (stock + $1) >= 0
       RETURNING stock`,
      [change, req.params.id, req.session.companyId]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.redirect(`/company/products/${req.params.id}/stock?error=${encodeURIComponent('Cannot apply change (stock would go negative or product not found).')}`);
    }
    await client.query(
      `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.params.id, req.session.companyId, change, reason, req.body.notes || null]
    );
    await client.query('COMMIT');
    res.redirect(`/company/products/${req.params.id}/stock`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /products/:id/stock] error:', err);
    res.redirect(`/company/products/${req.params.id}/stock?error=${encodeURIComponent(err.message)}`);
  } finally { client.release(); }
});

/* ─── PRODUCT IMAGES (gallery) ───────────────────────────── */
router.post('/products/:id/images/add', requireLogin, requireShop, (req, res) => {
  uploadProductImage(req, res, async (uploadErr) => {
    if (uploadErr) {
      return res.redirect(`/company/products/${req.params.id}/edit`);
    }
    const product = await pool.query(
      'SELECT id FROM products WHERE id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    if (!product.rows.length || !req.file) {
      return res.redirect(`/company/products/${req.params.id}/edit`);
    }
    await pool.query(
      `INSERT INTO product_images (product_id, image_url) VALUES ($1, $2)`,
      [req.params.id, `/uploads/${req.file.filename}`]
    );
    res.redirect(`/company/products/${req.params.id}/edit`);
  });
});

router.post('/products/:id/images/:imgId/delete', requireLogin, requireShop, async (req, res) => {
  await pool.query(
    `DELETE FROM product_images
     WHERE id = $1 AND product_id IN (SELECT id FROM products WHERE id = $2 AND company_id = $3)`,
    [req.params.imgId, req.params.id, req.session.companyId]
  );
  res.redirect(`/company/products/${req.params.id}/edit`);
});

/* ─── BANNERS (slider) — shop or portfolio ───────────────── */
router.get('/banners', requireLogin, async (req, res) => {
  const banners = await pool.query(
    'SELECT * FROM banner_slides WHERE company_id = $1 ORDER BY order_index, created_at',
    [req.session.companyId]
  );
  res.render('company/banners', { banners: banners.rows, session: req.session, error: null });
});

router.post('/banners/add', requireLogin, (req, res) => {
  uploadProductImage(req, res, async (uploadErr) => {
    if (uploadErr || !req.file) return res.redirect('/company/banners');
    const target_url = (req.body.target_url || '').trim() || null;
    const caption = (req.body.caption || '').trim() || null;
    const validSlots = ['section', 'hero1', 'hero2'];
    const slot = validSlots.includes(req.body.slot) ? req.body.slot : 'section';
    await pool.query(
      `INSERT INTO banner_slides (company_id, image_url, target_url, caption, slot, order_index)
       VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(order_index)+1 FROM banner_slides WHERE company_id = $1), 0))`,
      [req.session.companyId, `/uploads/${req.file.filename}`, target_url, caption, slot]
    );
    res.redirect('/company/banners');
  });
});

router.post('/banners/:id/delete', requireLogin, async (req, res) => {
  await pool.query(
    'DELETE FROM banner_slides WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/banners');
});

router.post('/banners/:id/toggle', requireLogin, async (req, res) => {
  await pool.query(
    'UPDATE banner_slides SET is_active = NOT is_active WHERE id = $1 AND company_id = $2',
    [req.params.id, req.session.companyId]
  );
  res.redirect('/company/banners');
});

router.post('/banners/:id/move', requireLogin, async (req, res) => {
  const direction = req.body.direction === 'up' ? 'up' : 'down';
  const op = direction === 'up' ? '<' : '>';
  const ord = direction === 'up' ? 'DESC' : 'ASC';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const me = await client.query(
      'SELECT id, order_index FROM banner_slides WHERE id = $1 AND company_id = $2',
      [req.params.id, req.session.companyId]
    );
    if (!me.rows.length) { await client.query('ROLLBACK'); return res.redirect('/company/banners'); }
    const neighbour = await client.query(
      `SELECT id, order_index FROM banner_slides
       WHERE company_id = $1 AND order_index ${op} $2
       ORDER BY order_index ${ord} LIMIT 1`,
      [req.session.companyId, me.rows[0].order_index]
    );
    if (neighbour.rows.length) {
      await client.query('UPDATE banner_slides SET order_index = $1 WHERE id = $2',
        [neighbour.rows[0].order_index, me.rows[0].id]);
      await client.query('UPDATE banner_slides SET order_index = $1 WHERE id = $2',
        [me.rows[0].order_index, neighbour.rows[0].id]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[banner move] error:', err);
  } finally { client.release(); }
  res.redirect('/company/banners');
});

/* ─── LANGUAGE TOGGLE ────────────────────────────────────── */
router.post('/lang/:lang', async (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'ar';
  if (req.session && req.session.companyUserId) {
    req.session.adminLang = lang;
    try {
      await pool.query('UPDATE company_users SET lang = $1 WHERE id = $2', [lang, req.session.companyUserId]);
    } catch (e) { console.error(e); }
  }
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.redirect(req.get('Referrer') || '/company/dashboard');
});

module.exports = router;
