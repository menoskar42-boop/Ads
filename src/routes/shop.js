const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { canonicalCompanyUrl } = require('../lib/urls');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function loadShopCompany(slug) {
  const r = await pool.query(
    "SELECT * FROM companies WHERE slug = $1 AND is_active = true AND page_type = 'shop'",
    [slug]
  );
  return r.rows[0] || null;
}

function getCart(req, slug) {
  if (!req.session.carts) req.session.carts = {};
  if (!req.session.carts[slug]) req.session.carts[slug] = {};
  return req.session.carts[slug];
}

// Cart keys are "<productId>" or "<productId>|<size>" (size variants).
function parseCartKey(k) {
  const s = String(k);
  const i = s.indexOf('|');
  return i < 0 ? { id: parseInt(s, 10), size: null } : { id: parseInt(s.slice(0, i), 10), size: s.slice(i + 1) };
}

/* ─── CART ───────────────────────────────────────────────── */
router.post('/:slug/cart/add', async (req, res) => {
  const { slug } = req.params;
  const wantsJson = req.xhr || (req.headers.accept || '').includes('application/json');
  const productId = parseInt(req.body.product_id, 10);
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  if (!Number.isFinite(productId)) {
    if (wantsJson) return res.status(400).json({ ok: false, error: 'Invalid product.' });
    return res.redirect(canonicalCompanyUrl(slug, req));
  }
  try {
    const company = await loadShopCompany(slug);
    if (!company) {
      if (wantsJson) return res.status(404).json({ ok: false, error: 'Shop not found.' });
      return res.status(404).render('404', { subdomain: slug });
    }
    const productResult = await pool.query(
      'SELECT id, stock FROM products WHERE id = $1 AND company_id = $2 AND is_active = true',
      [productId, company.id]
    );
    if (!productResult.rows.length) {
      if (wantsJson) return res.status(404).json({ ok: false, error: 'Product not found.' });
      return res.redirect(canonicalCompanyUrl(slug, req));
    }
    const cart = getCart(req, slug);
    const sizeSel = (req.body.size || '').toString().trim();
    const key = sizeSel ? `${productId}|${sizeSel}` : String(productId);
    const existing = cart[key] || 0;
    const requested = existing + quantity;
    if (requested > productResult.rows[0].stock) {
      if (wantsJson) return res.status(400).json({ ok: false, error: 'Not enough stock for the requested quantity.' });
      return res.redirect(`/shop/${slug}/cart?error=${encodeURIComponent('Not enough stock for the requested quantity.')}`);
    }
    cart[key] = requested;
    if (wantsJson) {
      const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
      return res.json({ ok: true, cartCount });
    }
    res.redirect(`/shop/${slug}/cart`);
  } catch (err) {
    console.error('[POST /shop/:slug/cart/add] error:', err);
    if (wantsJson) return res.status(500).json({ ok: false, error: 'Could not add to cart.' });
    res.redirect(`${canonicalCompanyUrl(slug, req)}?error=${encodeURIComponent('Could not add to cart.')}`);
  }
});

router.get('/:slug/cart', async (req, res) => {
  const { slug } = req.params;
  try {
    const company = await loadShopCompany(slug);
    if (!company) return res.status(404).render('404', { subdomain: slug });
    const cart = getCart(req, slug);
    const keys = Object.keys(cart);
    const ids = [...new Set(keys.map(k => parseCartKey(k).id).filter(Number.isFinite))];
    let lines = [];
    let total = 0;
    if (ids.length) {
      const r = await pool.query(
        `SELECT id, name, price, image_url, stock FROM products WHERE id = ANY($1::int[]) AND company_id = $2`,
        [ids, company.id]
      );
      const byId = Object.fromEntries(r.rows.map(p => [p.id, p]));
      lines = keys.map(k => {
        const { id, size } = parseCartKey(k);
        const p = byId[id];
        if (!p) return null;
        const qty = cart[k] || 0;
        const lineTotal = Number(p.price) * qty;
        total += lineTotal;
        return { ...p, key: k, size, quantity: qty, lineTotal };
      }).filter(Boolean);
    }
    res.render('shop/cart', {
      company,
      lines,
      total,
      cartCount: lines.reduce((s, l) => s + l.quantity, 0),
      error: req.query.error || null,
      customerId: req.session.customerId || null,
    });
  } catch (err) {
    console.error('[GET /shop/:slug/cart] error:', err);
    res.status(500).send('Error loading cart.');
  }
});

router.post('/:slug/cart/update', async (req, res) => {
  const { slug } = req.params;
  const cart = getCart(req, slug);
  for (const field of Object.keys(req.body)) {
    const m = field.match(/^q_(\d+)$/);
    if (!m) continue;
    const key = req.body['k_' + m[1]];
    if (!key) continue;
    const qty = parseInt(req.body[field], 10);
    if (!Number.isFinite(qty) || qty <= 0) delete cart[key];
    else cart[key] = qty;
  }
  res.redirect(`/shop/${slug}/cart`);
});

router.post('/:slug/cart/remove', (req, res) => {
  const { slug } = req.params;
  const cart = getCart(req, slug);
  if (req.body.key != null) delete cart[req.body.key];
  res.redirect(`/shop/${slug}/cart`);
});

router.post('/:slug/cart/clear', (req, res) => {
  const { slug } = req.params;
  if (req.session.carts) req.session.carts[slug] = {};
  res.redirect(`/shop/${slug}/cart`);
});

/* ─── CHECKOUT ───────────────────────────────────────────── */
router.get('/:slug/checkout', async (req, res) => {
  const { slug } = req.params;
  try {
    const company = await loadShopCompany(slug);
    if (!company) return res.status(404).render('404', { subdomain: slug });
    const cart = getCart(req, slug);
    if (!Object.keys(cart).length) return res.redirect(`/shop/${slug}/cart`);

    let prefill = {};
    if (req.session.customerId) {
      const c = await pool.query('SELECT email, full_name, phone, address FROM customers WHERE id = $1', [req.session.customerId]);
      if (c.rows.length) prefill = { ...c.rows[0] };
    }

    res.render('shop/checkout', {
      company,
      prefill,
      customerId: req.session.customerId || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('[GET /shop/:slug/checkout] error:', err);
    res.status(500).send('Error loading checkout.');
  }
});

router.post('/:slug/checkout', async (req, res) => {
  const { slug } = req.params;
  const { customer_name, customer_phone, customer_email, shipping_address, notes, register_account, password } = req.body;
  if (!customer_name || !customer_phone || !shipping_address) {
    return res.redirect(`/shop/${slug}/checkout?error=${encodeURIComponent('Name, phone and address are required.')}`);
  }

  let company;
  try {
    company = await loadShopCompany(slug);
    if (!company) return res.status(404).render('404', { subdomain: slug });
  } catch (e) { return res.status(500).send('Error.'); }

  const cart = getCart(req, slug);
  const keys = Object.keys(cart);
  if (!keys.length) return res.redirect(`/shop/${slug}/cart`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const items = [];
    let total = 0;
    for (const key of keys) {
      const { id: productId, size } = parseCartKey(key);
      if (!Number.isFinite(productId)) continue;
      const qty = cart[key];
      const upd = await client.query(
        `UPDATE products SET stock = stock - $1
         WHERE id = $2 AND company_id = $3 AND stock >= $1 AND is_active = true
         RETURNING id, name, price`,
        [qty, productId, company.id]
      );
      if (!upd.rows.length) {
        await client.query('ROLLBACK');
        return res.redirect(`/shop/${slug}/checkout?error=${encodeURIComponent('One of the items is out of stock or unavailable.')}`);
      }
      const p = upd.rows[0];
      const nameWithSize = size ? `${p.name} (مقاس: ${size})` : p.name;
      items.push({ product_id: p.id, product_name: nameWithSize, unit_price: Number(p.price), quantity: qty });
      total += Number(p.price) * qty;
    }

    let customerId = req.session.customerId || null;
    if (!customerId && register_account === 'on' && customer_email && password && password.length >= 6) {
      const dup = await client.query('SELECT id FROM customers WHERE email = $1', [customer_email]);
      if (!dup.rows.length) {
        const hash = await bcrypt.hash(password, 10);
        const ins = await client.query(
          `INSERT INTO customers (email, password_hash, full_name, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
          [customer_email, hash, customer_name, customer_phone]
        );
        customerId = ins.rows[0].id;
      }
    }

    const orderInsert = await client.query(
      `INSERT INTO orders (company_id, customer_id, customer_name, customer_phone, customer_email,
                           shipping_address, total_amount, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8) RETURNING id`,
      [company.id, customerId, customer_name, customer_phone, customer_email || null,
       shipping_address, total, notes || null]
    );
    const orderId = orderInsert.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, it.product_id, it.product_name, it.unit_price, it.quantity]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, order_id)
         VALUES ($1, $2, $3, 'sale', $4)`,
        [it.product_id, company.id, -it.quantity, orderId]
      );
    }

    await client.query('COMMIT');

    if (customerId && !req.session.customerId) req.session.customerId = customerId;

    if (!req.session.placedOrders) req.session.placedOrders = [];
    req.session.placedOrders.push(orderId);
    req.session.carts[slug] = {};

    res.redirect(`/shop/${slug}/order/${orderId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /shop/:slug/checkout] error:', err);
    res.redirect(`/shop/${slug}/checkout?error=${encodeURIComponent('Could not place order: ' + err.message)}`);
  } finally {
    client.release();
  }
});

router.get('/:slug/product/:id', async (req, res) => {
  const { slug, id } = req.params;
  try {
    const company = await loadShopCompany(slug);
    if (!company) return res.status(404).render('404', { subdomain: slug });
    const productResult = await pool.query(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN product_categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.company_id = $2 AND p.is_active = true`,
      [parseInt(id, 10), company.id]
    );
    if (!productResult.rows.length) return res.status(404).render('404', { subdomain: slug });
    const images = await pool.query(
      'SELECT * FROM product_images WHERE product_id = $1 ORDER BY order_index, created_at',
      [productResult.rows[0].id]
    );
    const cart = (req.session.carts && req.session.carts[slug]) || {};
    const cartCount = Object.values(cart).reduce((s, q) => s + q, 0);
    res.render('shop/product', {
      company,
      product: productResult.rows[0],
      gallery: images.rows,
      cartCount,
      showAds: true, // product detail is content
    });
  } catch (err) {
    console.error('[GET /shop/:slug/product/:id] error:', err);
    res.status(500).send('Error.');
  }
});

router.get('/:slug/order/:id', async (req, res) => {
  const { slug, id } = req.params;
  const orderId = parseInt(id, 10);
  const placed = req.session.placedOrders || [];
  const isCustomerOrder = req.session.customerId !== undefined;
  if (!placed.includes(orderId) && !isCustomerOrder) {
    return res.status(403).send('Forbidden.');
  }
  try {
    const company = await loadShopCompany(slug);
    if (!company) return res.status(404).render('404', { subdomain: slug });
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1 AND company_id = $2',
      [orderId, company.id]
    );
    if (!orderResult.rows.length) return res.status(404).send('Not found.');
    const order = orderResult.rows[0];
    if (req.session.customerId && order.customer_id !== req.session.customerId && !placed.includes(orderId)) {
      return res.status(403).send('Forbidden.');
    }
    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
    res.render('shop/success', { company, order, items: items.rows });
  } catch (err) {
    console.error('[GET /shop/:slug/order/:id] error:', err);
    res.status(500).send('Error.');
  }
});

module.exports = router;
