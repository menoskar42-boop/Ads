const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { canonicalCompanyUrl } = require('../lib/urls');
const push = require('../lib/push');
const reviews = require('../lib/reviews');
const recommendations = require('../lib/recommendations');
const shopFeatures = require('../lib/shop_features');
const deals = require('../lib/deals');
const shipping = require('../lib/shipping');
const { loadPaymentMethods } = require('../lib/payment_methods');
const { createGatewayPayment, loadPaySettings, gatewayReady } = require('../lib/gateways');
const paymob = require('../lib/gateways/paymob');

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
  if (i < 0) return { id: parseInt(s, 10), size: null, variantId: null };
  const seg = s.slice(i + 1);
  const m = /^v(\d+)$/.exec(seg); // variant key: "<productId>|v<variantId>"
  if (m) return { id: parseInt(s.slice(0, i), 10), size: null, variantId: parseInt(m[1], 10) };
  return { id: parseInt(s.slice(0, i), 10), size: seg, variantId: null };
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
    // Variant selection (phase 8): validate it belongs to the product + is active,
    // and check the VARIANT's own stock. Falls back to the legacy size label.
    const variantId = parseInt(req.body.variant_id, 10);
    let key, availStock = productResult.rows[0].stock;
    if (Number.isFinite(variantId)) {
      const v = (await pool.query(
        'SELECT id, stock FROM product_variants WHERE id=$1 AND product_id=$2 AND is_active=true',
        [variantId, productId]
      )).rows[0];
      if (!v) {
        if (wantsJson) return res.status(400).json({ ok: false, error: 'Invalid option.' });
        return res.redirect(canonicalCompanyUrl(slug, req));
      }
      key = `${productId}|v${variantId}`;
      availStock = v.stock;
    } else {
      const sizeSel = (req.body.size || '').toString().trim();
      key = sizeSel ? `${productId}|${sizeSel}` : String(productId);
    }
    const existing = cart[key] || 0;
    const requested = existing + quantity;
    if (requested > availStock) {
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

    const payment = await loadPaymentMethods(pool, company, res.locals.t);
    const zones = await shipping.getZones(company.id);
    res.render('shop/checkout', {
      company,
      prefill,
      payment,
      shippingZones: zones,
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
      const { id: productId, size, variantId } = parseCartKey(key);
      if (!Number.isFinite(productId)) continue;
      const qty = cart[key];
      // Always confirm the product exists/active + its base price.
      const prod = (await client.query(
        'SELECT id, name, price FROM products WHERE id=$1 AND company_id=$2 AND is_active=true', [productId, company.id]
      )).rows[0];
      if (!prod) { await client.query('ROLLBACK'); return res.redirect(`/shop/${slug}/checkout?error=${encodeURIComponent('One of the items is out of stock or unavailable.')}`); }

      let unitPrice = Number(prod.price);
      let itemName = prod.name;
      if (Number.isFinite(variantId)) {
        // Variant path: decrement the VARIANT's stock; price = base + price_delta.
        const vu = await client.query(
          `UPDATE product_variants SET stock = stock - $1
           WHERE id=$2 AND product_id=$3 AND is_active=true AND stock >= $1
           RETURNING label, price_delta`,
          [qty, variantId, productId]
        );
        if (!vu.rows.length) { await client.query('ROLLBACK'); return res.redirect(`/shop/${slug}/checkout?error=${encodeURIComponent('One of the items is out of stock or unavailable.')}`); }
        unitPrice = Number(prod.price) + Number(vu.rows[0].price_delta || 0);
        itemName = `${prod.name} (${vu.rows[0].label})`;
      } else {
        // Simple / size path: decrement the product's own stock.
        const upd = await client.query(
          `UPDATE products SET stock = stock - $1 WHERE id=$2 AND company_id=$3 AND stock >= $1 AND is_active=true RETURNING id`,
          [qty, productId, company.id]
        );
        if (!upd.rows.length) { await client.query('ROLLBACK'); return res.redirect(`/shop/${slug}/checkout?error=${encodeURIComponent('One of the items is out of stock or unavailable.')}`); }
        if (size) itemName = `${prod.name} (مقاس: ${size})`;
      }
      // Apply an active deal discount (phase 10) to the effective unit price.
      const deal = await deals.dealForProduct(company.id, prod.id);
      if (deal) unitPrice = deals.applyPct(unitPrice, deal.discount_pct);
      items.push({ product_id: prod.id, variant_id: Number.isFinite(variantId) ? variantId : null, product_name: itemName, unit_price: unitPrice, quantity: qty });
      total += unitPrice * qty;
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

    // Coupon (phase 11): validate + apply against the item subtotal. Atomic
    // used_count increment inside the transaction prevents over-use.
    let discountAmount = 0, appliedCode = null;
    const couponCode = String((req.body.coupon_code || '')).trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
    if (couponCode) {
      const cpn = (await client.query(
        `SELECT * FROM coupons WHERE company_id=$1 AND code=$2 AND is_active=true
           AND (expires_at IS NULL OR expires_at > now())
           AND (max_uses IS NULL OR used_count < max_uses)
         FOR UPDATE`,
        [company.id, couponCode]
      )).rows[0];
      if (cpn && total >= Number(cpn.min_order_amount || 0)) {
        discountAmount = cpn.discount_type === 'fixed'
          ? Math.min(total, Number(cpn.discount_value))
          : +(total * Number(cpn.discount_value) / 100).toFixed(2);
        discountAmount = Math.max(0, Math.min(total, discountAmount));
        appliedCode = cpn.code;
        await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE id=$1', [cpn.id]);
      }
    }
    const afterDiscount = Math.max(0, +(total - discountAmount).toFixed(2));
    // Shipping (phase 12): cost by governorate, free over threshold.
    const govr = String(req.body.shipping_zone || '').trim().slice(0, 60);
    let shipCost = 0, shipZoneName = null;
    if (govr) {
      const zone = await shipping.zoneFor(company.id, govr);
      if (zone) { shipCost = shipping.costFor(zone, afterDiscount); shipZoneName = zone.governorate; }
    }
    const finalTotal = +(afterDiscount + shipCost).toFixed(2);

    const orderInsert = await client.query(
      `INSERT INTO orders (company_id, customer_id, customer_name, customer_phone, customer_email,
                           shipping_address, total_amount, status, notes, coupon_code, discount_amount, shipping_cost, shipping_zone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, $10, $11, $12) RETURNING id`,
      [company.id, customerId, customer_name, customer_phone, customer_email || null,
       shipping_address, finalTotal, notes || null, appliedCode, discountAmount, shipCost, shipZoneName]
    );
    const orderId = orderInsert.rows[0].id;

    for (const it of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, variant_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderId, it.product_id, it.product_name, it.unit_price, it.quantity, it.variant_id || null]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, company_id, change_amount, reason, order_id)
         VALUES ($1, $2, $3, 'sale', $4)`,
        [it.product_id, company.id, -it.quantity, orderId]
      );
    }

    await client.query('COMMIT');

    push.sendToCompany(company.id, {
      title: '🛒 أوردر جديد',
      body: `طلب جديد من ${customer_name} بإجمالي ${Number(finalTotal).toFixed(2)} ${company.currency || 'EGP'}`,
      url: '/company/orders',
    }, 'order').catch((e) => console.error('[push order] error:', e.message));

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

// Initiate an online payment for an existing order via the merchant's gateway.
// Redirects the buyer to the hosted payment page (Paymob iframe).
router.get('/:slug/pay/:orderId', async (req, res) => {
  const { slug } = req.params;
  const orderId = parseInt(req.params.orderId, 10);
  const placed = req.session.placedOrders || [];
  try {
    const company = await loadShopCompany(slug);
    if (!company) return res.status(404).render('404', { subdomain: slug });
    const o = (await pool.query('SELECT * FROM orders WHERE id=$1 AND company_id=$2', [orderId, company.id])).rows[0];
    if (!o) return res.status(404).send('Not found.');
    if (!placed.includes(orderId) && o.customer_id !== req.session.customerId) return res.status(403).send('Forbidden.');
    if (o.payment_status === 'paid') return res.redirect(`/shop/${slug}/order/${orderId}`);

    const nameParts = String(o.customer_name || '').trim().split(/\s+/);
    const out = await createGatewayPayment(pool, company, {
      amountCents: Math.round(Number(o.total_amount) * 100),
      currency: company.currency || 'EGP',
      merchantOrderId: `shop-${orderId}`,
      billing: {
        first_name: nameParts[0] || 'Customer', last_name: nameParts.slice(1).join(' ') || 'NA',
        email: o.customer_email || 'na@na.com', phone: o.customer_phone || 'NA', street: o.shipping_address || 'NA',
      },
    });
    await pool.query("UPDATE orders SET payment_status='pending', payment_ref=$1 WHERE id=$2", [String(out.orderId || ''), orderId]);
    res.redirect(out.url);
  } catch (err) {
    console.error('[shop pay initiate]', err.message);
    res.redirect(`/shop/${slug}/order/${orderId}?payerror=1`);
  }
});

// Buyer return page (informational — do NOT trust query params to mark paid).
router.get('/pay/return', (req, res) => {
  const ok = String(req.query.success) === 'true';
  res.render('shop/pay_return', { ok });
});

// Server-to-server webhook from Paymob. HMAC-verified with the MERCHANT'S secret
// before marking the order paid. This is the only trusted source of truth.
router.post('/pay/paymob/callback', async (req, res) => {
  try {
    const obj = (req.body && req.body.obj) || {};
    const providedHmac = req.query.hmac || (req.body && req.body.hmac);
    const merchantOrderId = obj.order && obj.order.merchant_order_id;
    const m = /^shop-(\d+)$/.exec(String(merchantOrderId || ''));
    if (!m) return res.status(200).send('ignored');
    const orderId = parseInt(m[1], 10);
    const o = (await pool.query('SELECT company_id FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!o) return res.status(200).send('no order');
    const settings = (await pool.query('SELECT gateway_hmac FROM payment_settings WHERE company_id=$1', [o.company_id])).rows[0];
    const hmacSecret = settings && settings.gateway_hmac;
    if (!paymob.verifyCallbackHmac(obj, hmacSecret, providedHmac)) {
      console.error('[paymob callback] HMAC mismatch for order', orderId);
      return res.status(403).send('bad hmac');
    }
    if (obj.success === true || obj.success === 'true') {
      await pool.query("UPDATE orders SET payment_status='paid', payment_ref=$1 WHERE id=$2 AND payment_status <> 'paid'", [String(obj.id || ''), orderId]);
      push.sendToCompany(o.company_id, { title: '💳 دفع أونلاين', body: `تم دفع الطلب #${orderId} أونلاين`, url: '/company/orders' }, 'order').catch(() => {});
    }
    res.status(200).send('ok');
  } catch (err) {
    console.error('[paymob callback]', err.message);
    res.status(200).send('err');
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
    // Keep thin shops' product pages out of the index too (same gate as the
    // shop landing page: fewer than 3 active products = thin → noindex + no ads).
    const thin = (await pool.query(
      'SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1 AND is_active = true', [company.id]
    )).rows[0].n < 3;
    // Reviews (phase 4): list + breakdown, and whether the logged-in customer
    // bought this product (and hasn't reviewed it yet) → may leave a review.
    const productId = productResult.rows[0].id;
    const rv = await reviews.forProduct(productId, 30);
    let canReview = false;
    if (req.session.customerId) {
      const bought = await reviews.hasPurchased(req.session.customerId, productId);
      const already = await reviews.existingReview(req.session.customerId, productId);
      canReview = !!bought && !already;
    }
    const recommended = await recommendations.forProduct(productResult.rows[0], 6);
    const variants = (await pool.query(
      'SELECT id, label, price_delta, stock, image_url, attributes FROM product_variants WHERE product_id=$1 AND is_active=true ORDER BY sort_order, id',
      [productId]
    )).rows;
    const feat = await shopFeatures.getFeatures(company.id);
    const deal = feat.deals === false ? null : await deals.dealForProduct(company.id, productId);
    res.render('shop/product', {
      company,
      product: productResult.rows[0],
      gallery: images.rows,
      variants: feat.variants === false ? [] : variants,
      deal,
      feat,
      cartCount,
      reviews: rv.reviews,
      reviewBreakdown: rv.breakdown,
      canReview,
      reviewSent: req.query.reviewed === '1',
      recommended,
      noindex: thin,
      showAds: !thin, // product detail is content — but no ads on thin/noindex pages
    });
  } catch (err) {
    console.error('[GET /shop/:slug/product/:id] error:', err);
    res.status(500).send('Error.');
  }
});

// Submit a product review (phase 4). Only a logged-in customer who purchased
// the product, and hasn't reviewed it yet. Verified + recomputes the aggregate.
router.post('/:slug/product/:id/review', async (req, res) => {
  const { slug, id } = req.params;
  const productId = parseInt(id, 10);
  const back = '/shop/' + encodeURIComponent(slug) + '/product/' + productId;
  try {
    if (!req.session.customerId) return res.redirect('/customer/login');
    const company = await loadShopCompany(slug);
    if (!company) return res.status(404).render('404', { subdomain: slug });
    const prod = (await pool.query('SELECT id FROM products WHERE id=$1 AND company_id=$2 AND is_active=true', [productId, company.id])).rows[0];
    if (!prod) return res.redirect(back);
    const orderId = await reviews.hasPurchased(req.session.customerId, productId);
    const already = await reviews.existingReview(req.session.customerId, productId);
    const rating = Math.max(1, Math.min(5, parseInt(req.body.rating, 10) || 0));
    if (!orderId || already || !rating) return res.redirect(back);
    await pool.query(
      `INSERT INTO product_reviews (product_id, company_id, customer_id, order_id, rating, title, body, is_verified, is_approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,true)
       ON CONFLICT (product_id, customer_id) WHERE customer_id IS NOT NULL DO NOTHING`,
      [productId, company.id, req.session.customerId, orderId, rating,
        String(req.body.title || '').trim().slice(0, 120) || null,
        String(req.body.body || '').trim().slice(0, 1500) || null]
    );
    await reviews.recompute(productId);
    res.redirect(back + '?reviewed=1#reviews');
  } catch (e) { console.error('[review submit]', e.message); res.redirect(back); }
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
    // Offer online payment only if the merchant configured a ready gateway and
    // the order isn't already paid.
    const paySettings = await loadPaySettings(pool, company.id);
    const canPayOnline = gatewayReady(paySettings) && order.payment_status !== 'paid';
    res.render('shop/success', { company, order, items: items.rows, canPayOnline });
  } catch (err) {
    console.error('[GET /shop/:slug/order/:id] error:', err);
    res.status(500).send('Error.');
  }
});

module.exports = router;
