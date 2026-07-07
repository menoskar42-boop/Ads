const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const crypto = require('crypto');
const { getPreset } = require('../lib/portfolio_presets');
const stock = require('../pharmacy/stock');
const push = require('../lib/push');
const aiAssistant = require('../lib/ai_order_assistant');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Load a merchant's paid AI subscription (or null). The site is free; the AI
// order assistant only runs for merchants with an active, unexpired sub that
// still has monthly quota left.
async function loadAiSub(companyId) {
  try {
    return (await pool.query('SELECT * FROM food_ai_subscriptions WHERE company_id = $1', [companyId])).rows[0] || null;
  } catch (e) { return null; }
}
// Active = status 'active', not past expiry, and quota not exhausted.
function aiSubActive(sub) {
  if (!sub || sub.status !== 'active') return false;
  if (sub.expires_at && new Date(sub.expires_at).getTime() < Date.now()) return false;
  return true;
}
function aiQuotaLeft(sub) {
  const quota = Number(sub.monthly_quota) || 0;
  const used = Number(sub.used_this_period) || 0;
  return quota > 0 && used < quota;
}
// Very light per-tenant+IP rate limit for the AI endpoint (cost guard).
const aiRate = new Map();
function aiRateOk(key, maxPerMin) {
  const now = Date.now();
  const arr = (aiRate.get(key) || []).filter((t) => now - t < 60000);
  if (arr.length >= maxPerMin) { aiRate.set(key, arr); return false; }
  arr.push(now); aiRate.set(key, arr);
  if (aiRate.size > 5000) aiRate.clear();
  return true;
}

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
                pi.min_qty, pi.image_url, pi.description,
                GREATEST(pi.qty - pi.reserved_qty, 0) AS available_qty,
                m.name_ar, m.name_en, m.form, m.manufacturer, m.scientific_name
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

  // Orders tenant (restaurant / supermarket): load active outlets with their
  // categories + available items for the menu.
  let foodOutlets = [];
  let foodItemCount = 0;
  let aiAssistantOn = false;
  if (company.page_type === 'orders') {
    try {
      foodOutlets = (await pool.query(
        'SELECT * FROM food_outlets WHERE company_id = $1 AND is_active = true ORDER BY vertical', [company.id]
      )).rows;
      for (const o of foodOutlets) {
        o.categories = (await pool.query(
          'SELECT * FROM food_categories WHERE outlet_id = $1 ORDER BY sort_order, id', [o.id]
        )).rows;
        o.items = (await pool.query(
          'SELECT * FROM food_items WHERE outlet_id = $1 AND is_available = true ORDER BY sort_order, id', [o.id]
        )).rows;
        o.rating = (await pool.query(
          'SELECT ROUND(AVG(rating), 1) AS avg, COUNT(*)::int AS n FROM food_reviews WHERE outlet_id = $1', [o.id]
        )).rows[0];
        foodItemCount += o.items.length;
      }
      // Paid AI assistant: only surface the chat widget when the merchant has an
      // active, unexpired subscription with quota left (the site itself is free).
      const sub = await loadAiSub(company.id);
      aiAssistantOn = aiSubActive(sub) && aiQuotaLeft(sub);
    } catch (err) { console.error('Food query error:', err.message); }
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
  else if (company.page_type === 'orders') view = 'tenant_orders';
  else view = 'tenant_portfolio';

  // Indexing quality gate: keep thin tenant pages out of the index (and away
  // from AdSense review) until they hold real content, then let them in
  // automatically. noindex,follow so links are still crawled. A filtered or
  // search view is never the canonical page, so it's also kept out.
  const descLen = (company.description || '').trim().length;
  const hasFilter = Boolean((req.query.q || '').trim()) || Number.isFinite(parseInt(req.query.category, 10));
  let indexable;
  if (company.page_type === 'shop') indexable = activeProductCount >= 3;
  // The demo pharmacy (slug 'pharmacy') is a sample, not a real business —
  // keep it out of the index; real customer pharmacies index once they have stock.
  else if (company.page_type === 'pharmacy') indexable = pharmacyStockCount >= 3 && company.slug !== 'pharmacy';
  // Demo orders merchant (slug 'orders') stays out of the index like the demo pharmacy.
  else if (company.page_type === 'orders') indexable = foodItemCount >= 3 && company.slug !== 'orders';
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
    foodOutlets,
    foodItemCount,
    aiAssistantOn,
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
    const token = crypto.randomBytes(9).toString('hex');
    const ord = (await client.query(
      `INSERT INTO pharmacy_orders (company_id, customer_name, customer_phone, customer_address, total_amount, status, track_token)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
      [company.id, name, phone, address || null, total, token]
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
      order: { id: ord.id, name: inv.name_ar, qty, total, token },
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

// Create a MULTI-medicine order from the client cart. The customer enters their
// contact details once and checks out the whole cart (COD). Prices/availability
// are re-read from the DB per item and stock is reserved for all of them.
router.post('/order/cart', pharmacyOrderGuard, async (req, res) => {
  const company = req.tenant;
  const b = req.body || {};
  const langQ = res.locals.lang === 'en' ? '?lang=en' : '';
  let cart;
  try { cart = JSON.parse(b.cart || '[]'); } catch (e) { cart = []; }
  cart = (Array.isArray(cart) ? cart : [])
    .map((x) => ({ id: parseInt(x.id, 10), q: Math.max(1, parseInt(x.q, 10) || 1) }))
    .filter((x) => x.id);
  const name = String(b.customer_name || '').trim().slice(0, 100);
  const phone = String(b.customer_phone || '').trim().slice(0, 30);
  const address = String(b.customer_address || '').trim().slice(0, 300);
  if (!cart.length || !name || phone.length < 6) return res.redirect('/' + langQ);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lines = [];
    let itemsTotal = 0;
    for (const c of cart) {
      const inv = (await client.query(
        `SELECT pi.price, GREATEST(pi.qty - pi.reserved_qty,0) AS available, m.name_ar
         FROM pharmacy_inventory pi JOIN medicines m ON m.id = pi.medicine_id
         WHERE pi.company_id = $1 AND pi.medicine_id = $2 FOR UPDATE`, [company.id, c.id]
      )).rows[0];
      if (!inv || Number(inv.available) < c.q) { await client.query('ROLLBACK'); return res.redirect('/' + langQ); }
      const price = Number(inv.price) || 0;
      itemsTotal += price * c.q;
      lines.push({ medicine_id: c.id, name: inv.name_ar, qty: c.q, price });
    }
    // Flat delivery fee (if the pharmacy enabled delivery with a fee).
    const s = req.pharmacySettings || {};
    const deliveryFee = (s.delivery_enabled && Number(s.delivery_fee) > 0) ? Number(s.delivery_fee) : 0;
    const total = itemsTotal + deliveryFee;
    const token = crypto.randomBytes(9).toString('hex');
    const ord = (await client.query(
      `INSERT INTO pharmacy_orders (company_id, customer_name, customer_phone, customer_address, total_amount, status, track_token)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
      [company.id, name, phone, address || null, total, token]
    )).rows[0];
    for (const ln of lines) {
      await client.query(
        `INSERT INTO pharmacy_order_items (order_id, medicine_id, name, qty, price) VALUES ($1,$2,$3,$4,$5)`,
        [ord.id, ln.medicine_id, ln.name, ln.qty, ln.price]
      );
    }
    await stock.reserve(client, company.id, lines.map((l) => ({ medicine_id: l.medicine_id, qty: l.qty })));
    await client.query('COMMIT');
    push.sendToCompany(company.id, {
      title: '🧾 طلب صيدلية جديد',
      body: `طلب جديد من ${name}: ${lines.length} صنف`,
      url: '/pharmacy/orders',
    }, 'order').catch((e) => console.error('[push pharmacy cart order] error:', e.message));
    return res.redirect('/order/track/' + token + langQ);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('cart order create error:', e.message);
    return res.redirect('/' + langQ);
  } finally {
    client.release();
  }
});

// ── Customer order tracking (Talabat-style) ──
// Public, keyed by the order's unguessable token. Shows live status and lets
// the customer enable push so the pharmacy's status updates reach their phone.
async function loadTrackedOrder(req) {
  const company = req.tenant;
  if (!company || company.page_type !== 'pharmacy') return null;
  const token = String(req.params.token || '').trim();
  if (!token) return null;
  const o = (await pool.query(
    'SELECT * FROM pharmacy_orders WHERE track_token = $1 AND company_id = $2', [token, company.id]
  )).rows[0];
  return o || null;
}

router.get('/order/track/:token', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.redirect('/');
    const items = (await pool.query(
      `SELECT oi.name, oi.qty, oi.price, m.name_en AS med_en
       FROM pharmacy_order_items oi LEFT JOIN medicines m ON m.id = oi.medicine_id
       WHERE oi.order_id = $1`, [order.id]
    )).rows;
    res.render('tenant_pharmacy_track', {
      company: req.tenant, order, items, noindex: true,
      pushKey: push.publicKey(),
      canonical: 'https://' + req.tenant.slug + '.oscardevs.com/',
    });
  } catch (e) { console.error('track error:', e.message); res.status(500).send('Error.'); }
});

router.get('/order/track/:token/status', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.status(404).json({});
    res.json({ status: order.status });
  } catch (e) { res.status(500).json({}); }
});

// Customer poll for the delivery driver's live location (only while the order
// is out for delivery).
router.get('/order/track/:token/location', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.status(404).json({});
    if (order.status !== 'out_for_delivery' || order.driver_lat == null) return res.json({});
    res.json({ lat: Number(order.driver_lat), lng: Number(order.driver_lng), at: order.driver_loc_at });
  } catch (e) { res.status(500).json({}); }
});

router.post('/order/track/:token/subscribe', async (req, res) => {
  try {
    const order = await loadTrackedOrder(req);
    if (!order) return res.status(404).json({ ok: false });
    const ok = await push.saveOrderSubscription(order.id, req.body && req.body.subscription);
    res.json({ ok: !!ok });
  } catch (e) { console.error('track subscribe error:', e.message); res.status(500).json({ ok: false }); }
});

/* ─── Orders (restaurant/supermarket) checkout ──────────── */
async function foodOrderGuard(req, res, next) {
  const company = req.tenant;
  if (!company || company.page_type !== 'orders') {
    return res.status(404).render('404', { subdomain: company ? company.slug : null });
  }
  next();
}

// Validate a coupon for a company against a subtotal. Returns { ok, discount,
// coupon } — discount is 0 when invalid. Never throws.
async function validateFoodCoupon(db, companyId, code, subtotal) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return { ok: false, discount: 0 };
  try {
    const c = (await db.query('SELECT * FROM food_coupons WHERE company_id=$1 AND code=$2', [companyId, code])).rows[0];
    if (!c || !c.is_active) return { ok: false, discount: 0 };
    if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) return { ok: false, discount: 0 };
    if (c.usage_limit && Number(c.usage_limit) > 0 && Number(c.used_count) >= Number(c.usage_limit)) return { ok: false, discount: 0 };
    if (c.min_order && subtotal < Number(c.min_order)) return { ok: false, discount: 0 };
    let discount = subtotal * (Number(c.discount_percent) || 0) / 100;
    if (c.max_discount && Number(c.max_discount) > 0) discount = Math.min(discount, Number(c.max_discount));
    discount = Math.round(discount * 100) / 100;
    return { ok: discount > 0, discount, coupon: c };
  } catch (e) { console.error('coupon validate error:', e.message); return { ok: false, discount: 0 }; }
}

// Live coupon check for the cart drawer.
router.get('/order/coupon-check', foodOrderGuard, async (req, res) => {
  const subtotal = Number(req.query.subtotal) || 0;
  const r = await validateFoodCoupon(pool, req.tenant.id, req.query.code, subtotal);
  res.json({ ok: r.ok, discount: r.discount, percent: r.coupon ? Number(r.coupon.discount_percent) : 0 });
});

// AI order assistant (PAID). Gated by an active subscription + monthly quota.
// The model only ever sees THIS merchant's menu, and every returned item id is
// re-validated against the DB inside the assistant lib.
router.post('/order/food/ai', foodOrderGuard, async (req, res) => {
  const company = req.tenant;
  const lang = (res.locals.lang === 'en') ? 'en' : 'ar';
  const say = (ar, en) => (lang === 'en' ? en : ar);

  const sub = await loadAiSub(company.id);
  if (!aiSubActive(sub)) {
    return res.status(403).json({ ok: false, error: say('المساعد الذكي غير مُفعّل لهذا المتجر.', 'The AI assistant is not enabled for this shop.') });
  }
  if (!aiQuotaLeft(sub)) {
    return res.status(429).json({ ok: false, error: say('تم تجاوز حصّة الباقة لهذا الشهر.', 'This month\'s plan quota has been used up.') });
  }
  if (!aiAssistant.isEnabled()) {
    return res.status(503).json({ ok: false, error: say('خدمة المساعد غير متاحة حالياً.', 'The assistant service is temporarily unavailable.') });
  }

  // Input sanitization + length cap.
  const message = String((req.body && req.body.message) || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  if (!message) return res.status(400).json({ ok: false, error: say('اكتب رسالتك.', 'Type your message.') });

  // Rate limit: 12 messages/min per (tenant, ip).
  const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
  if (!aiRateOk(company.id + '|' + ip, 12)) {
    return res.status(429).json({ ok: false, error: say('محاولات كتير بسرعة، استنى شوية.', 'Too many messages, please slow down.') });
  }

  // Accept a short prior history from the client (text only).
  let history = [];
  try {
    const h = req.body && req.body.history;
    if (Array.isArray(h)) history = h.slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 500) }));
  } catch (e) { history = []; }

  try {
    // Load the merchant's active menu (same shape the storefront uses).
    const outlets = (await pool.query(
      'SELECT * FROM food_outlets WHERE company_id = $1 AND is_active = true ORDER BY vertical', [company.id]
    )).rows;
    for (const o of outlets) {
      o.categories = (await pool.query('SELECT * FROM food_categories WHERE outlet_id = $1 ORDER BY sort_order, id', [o.id])).rows;
      o.items = (await pool.query('SELECT * FROM food_items WHERE outlet_id = $1 AND is_available = true ORDER BY sort_order, id', [o.id])).rows;
    }

    const out = await aiAssistant.runAssistant({
      outlets, history, message, lang,
      cur: (res.locals.t ? res.locals.t('pharmacy.currency') : 'ج.م'),
      merchantName: company.company_name || company.slug,
    });

    // Cost tracking + quota accounting.
    try {
      await pool.query('INSERT INTO food_ai_messages (company_id, role, content, tokens) VALUES ($1,$2,$3,$4)', [company.id, 'user', message, 0]);
      await pool.query('INSERT INTO food_ai_messages (company_id, role, content, tokens) VALUES ($1,$2,$3,$4)', [company.id, 'assistant', out.reply, out.tokens || 0]);
      await pool.query('UPDATE food_ai_subscriptions SET used_this_period = used_this_period + 1 WHERE company_id = $1', [company.id]);
    } catch (e) { console.error('[ai log]', e.message); }

    res.json({ ok: true, reply: out.reply, cart: out.cart });
  } catch (e) {
    console.error('[ai assistant]', e.message);
    res.status(502).json({ ok: false, error: say('حصل خطأ مؤقت، جرّب تاني.', 'A temporary error occurred, please try again.') });
  }
});

// Create a food order from the client cart (COD). Prices are re-read from the
// DB (never trusted from the client) and min-order is enforced per outlet.
router.post('/order/food', foodOrderGuard, async (req, res) => {
  const company = req.tenant;
  let cart;
  try { cart = JSON.parse(req.body.cart || '[]'); } catch (e) { cart = []; }
  cart = (Array.isArray(cart) ? cart : [])
    .map(x => ({ id: parseInt(x.id, 10), q: Math.max(1, parseInt(x.q, 10) || 1) }))
    .filter(x => x.id);
  const name = String(req.body.customer_name || '').trim().slice(0, 100);
  const phone = String(req.body.phone || '').trim().slice(0, 30);
  const address = String(req.body.address || '').trim().slice(0, 300);
  const notes = String(req.body.notes || '').trim().slice(0, 500);
  if (!cart.length || !name || phone.length < 6) return res.redirect('/?err=order');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ids = cart.map(i => i.id);
    const rows = (await client.query(
      `SELECT fi.id, fi.name, fi.name_ar, fi.price, fi.outlet_id, fo.delivery_fee, fo.min_order
       FROM food_items fi JOIN food_outlets fo ON fo.id = fi.outlet_id
       WHERE fi.id = ANY($1) AND fo.company_id = $2 AND fi.is_available = true AND fo.is_active = true`,
      [ids, company.id]
    )).rows;
    const byId = {}; rows.forEach(r => { byId[r.id] = r; });

    let subtotal = 0; const outSub = {}; const outFee = {}; const lineItems = [];
    for (const it of cart) {
      const r = byId[it.id]; if (!r) continue;
      const line = Number(r.price) * it.q; subtotal += line;
      outSub[r.outlet_id] = (outSub[r.outlet_id] || 0) + line;
      outFee[r.outlet_id] = Number(r.delivery_fee) || 0;
      lineItems.push({ id: r.id, name: (r.name_ar || r.name), qty: it.q, price: Number(r.price), outlet: r.outlet_id });
    }
    if (!lineItems.length) { await client.query('ROLLBACK'); return res.redirect('/?err=order'); }
    for (const oid of Object.keys(outSub)) {
      const r = rows.find(x => String(x.outlet_id) === String(oid));
      if (r && Number(r.min_order) > 0 && outSub[oid] < Number(r.min_order)) {
        await client.query('ROLLBACK'); return res.redirect('/?err=minorder');
      }
    }
    const deliveryFee = Object.keys(outFee).reduce((s, k) => s + outFee[k], 0);
    const cp = await validateFoodCoupon(client, company.id, req.body.coupon, subtotal);
    const discount = cp.ok ? cp.discount : 0;
    const total = Math.max(0, subtotal + deliveryFee - discount);
    const token = crypto.randomBytes(9).toString('hex');
    const ord = (await client.query(
      `INSERT INTO food_orders (company_id, outlet_id, customer_name, status, total, delivery_fee, delivery_address, phone, notes, coupon_code, discount_amount, track_token)
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [company.id, lineItems[0].outlet, name, total, deliveryFee, address || null, phone, notes || null,
       cp.ok ? cp.coupon.code : null, discount, token]
    )).rows[0];
    if (cp.ok) await client.query('UPDATE food_coupons SET used_count = used_count + 1 WHERE id = $1', [cp.coupon.id]);
    for (const li of lineItems) {
      await client.query(
        `INSERT INTO food_order_items (order_id, item_id, name_snapshot, quantity, price) VALUES ($1,$2,$3,$4,$5)`,
        [ord.id, li.id, li.name, li.qty, li.price]
      );
    }
    await client.query(`INSERT INTO food_order_events (order_id, status, note) VALUES ($1,'pending','created')`, [ord.id]);
    await client.query('COMMIT');
    push.sendToCompany(company.id, { title: '🛎️ طلب جديد', body: 'طلب جديد من ' + name, url: '/food' }, 'order')
      .catch(e => console.error('[food order push] ' + e.message));
    res.redirect('/order/food/' + token);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('food order error:', e.message);
    res.redirect('/?err=order');
  } finally { client.release(); }
});

// Order confirmation page.
router.get('/order/food/:token', foodOrderGuard, async (req, res) => {
  const company = req.tenant;
  try {
    const ord = (await pool.query(
      'SELECT * FROM food_orders WHERE track_token = $1 AND company_id = $2', [req.params.token, company.id]
    )).rows[0];
    if (!ord) return res.redirect('/');
    const items = (await pool.query('SELECT * FROM food_order_items WHERE order_id = $1', [ord.id])).rows;
    const reviewed = (await pool.query('SELECT 1 FROM food_reviews WHERE order_id = $1 LIMIT 1', [ord.id])).rows.length > 0;
    res.render('orders/confirm', { company, order: ord, items, noindex: true, reviewed: reviewed || req.query.reviewed === '1' });
  } catch (e) { console.error('food confirm error:', e.message); res.status(500).send('Error.'); }
});

// Live status for the customer tracking page (polled).
router.get('/order/food/:token/status', foodOrderGuard, async (req, res) => {
  try {
    const ord = (await pool.query(
      'SELECT status FROM food_orders WHERE track_token = $1 AND company_id = $2', [req.params.token, req.tenant.id]
    )).rows[0];
    if (!ord) return res.status(404).json({ ok: false });
    res.json({ ok: true, status: ord.status });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// Customer rating for a delivered order (one review per order).
router.post('/order/food/:token/review', foodOrderGuard, async (req, res) => {
  try {
    const ord = (await pool.query(
      'SELECT id, outlet_id FROM food_orders WHERE track_token = $1 AND company_id = $2', [req.params.token, req.tenant.id]
    )).rows[0];
    if (!ord) return res.redirect('/');
    const rating = Math.min(5, Math.max(1, parseInt(req.body.rating, 10) || 0));
    if (rating >= 1) {
      const ex = await pool.query('SELECT 1 FROM food_reviews WHERE order_id = $1 LIMIT 1', [ord.id]);
      if (!ex.rows.length) {
        await pool.query('INSERT INTO food_reviews (outlet_id, order_id, rating, comment) VALUES ($1,$2,$3,$4)',
          [ord.outlet_id, ord.id, rating, (req.body.comment || '').trim().slice(0, 500) || null]);
      }
    }
    res.redirect('/order/food/' + req.params.token + '?reviewed=1');
  } catch (e) { console.error('food review error:', e.message); res.redirect('/order/food/' + req.params.token); }
});

module.exports = router;
