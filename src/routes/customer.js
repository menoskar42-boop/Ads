const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function requireCustomer(req, res, next) {
  if (req.session && req.session.customerId) return next();
  res.redirect('/customer/login');
}

router.get('/login', (req, res) => {
  if (req.session.customerId) return res.redirect('/customer/orders');
  res.render('customer/login', { error: null });
});

const { loginLimiter } = require('../middleware/rateLimit');
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
    if (!r.rows.length) return res.render('customer/login', { error: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.render('customer/login', { error: 'Invalid email or password.' });
    req.session.customerId = r.rows[0].id;
    req.session.customerEmail = r.rows[0].email;
    req.session.customerLang = r.rows[0].lang || 'ar';
    res.redirect('/customer/orders');
  } catch (err) {
    console.error('[POST /customer/login] error:', err);
    res.render('customer/login', { error: 'Something went wrong.' });
  }
});

router.get('/register', (req, res) => {
  res.render('customer/register', { error: null, form: {} });
});

router.post('/register', async (req, res) => {
  const { email, password, full_name, phone, address } = req.body;
  if (!email || !password || password.length < 6) {
    return res.render('customer/register', { error: 'Email and password (min 6 chars) are required.', form: req.body });
  }
  try {
    const dup = await pool.query('SELECT id FROM customers WHERE email = $1', [email]);
    if (dup.rows.length) return res.render('customer/register', { error: 'Email already in use.', form: req.body });
    const hash = await bcrypt.hash(password, 10);
    const ins = await pool.query(
      `INSERT INTO customers (email, password_hash, full_name, phone, address) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [email, hash, full_name || null, phone || null, address || null]
    );
    req.session.customerId = ins.rows[0].id;
    req.session.customerEmail = email;
    res.redirect('/customer/orders');
  } catch (err) {
    console.error('[POST /customer/register] error:', err);
    res.render('customer/register', { error: 'Could not register: ' + err.message, form: req.body });
  }
});

router.post('/logout', (req, res) => {
  delete req.session.customerId;
  delete req.session.customerEmail;
  res.redirect('/');
});

router.get('/orders', requireCustomer, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, c.company_name, c.slug
       FROM orders o JOIN companies c ON c.id = o.company_id
       WHERE o.customer_id = $1
       ORDER BY o.created_at DESC`,
      [req.session.customerId]
    );
    res.render('customer/orders', { orders: r.rows, session: req.session });
  } catch (err) {
    console.error('[GET /customer/orders] error:', err);
    res.status(500).send('Error.');
  }
});

/* ─── WISHLIST (phase 6) ─────────────────────────────────── */
// Toggle a product in the wishlist. JSON: { product_id } → { ok, added, count }.
router.post('/wishlist/toggle', async (req, res) => {
  if (!req.session || !req.session.customerId) return res.status(401).json({ ok: false, error: 'login' });
  const pid = parseInt((req.body && req.body.product_id) || req.query.product_id, 10);
  if (!pid) return res.status(400).json({ ok: false });
  const cid = req.session.customerId;
  try {
    const exists = (await pool.query('SELECT 1 FROM wishlist_items WHERE customer_id=$1 AND product_id=$2', [cid, pid])).rowCount;
    let added;
    if (exists) { await pool.query('DELETE FROM wishlist_items WHERE customer_id=$1 AND product_id=$2', [cid, pid]); added = false; }
    else { await pool.query('INSERT INTO wishlist_items (customer_id, product_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cid, pid]); added = true; }
    const count = (await pool.query('SELECT COUNT(*)::int n FROM wishlist_items WHERE customer_id=$1', [cid])).rows[0].n;
    res.json({ ok: true, added, count });
  } catch (e) { console.error('[wishlist toggle]', e.message); res.status(500).json({ ok: false }); }
});

// The customer's wishlist product ids (for painting hearts on the storefront).
router.get('/wishlist/ids', async (req, res) => {
  if (!req.session || !req.session.customerId) return res.json({ ids: [], count: 0 });
  try {
    const r = await pool.query('SELECT product_id FROM wishlist_items WHERE customer_id=$1', [req.session.customerId]);
    const ids = r.rows.map((x) => x.product_id);
    res.json({ ids, count: ids.length });
  } catch (e) { res.json({ ids: [], count: 0 }); }
});

router.get('/wishlist', requireCustomer, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.name, p.name_ar, p.price, p.image_url, p.stock, c.slug AS company_slug, c.company_name
       FROM wishlist_items w
       JOIN products p ON p.id = w.product_id
       JOIN companies c ON c.id = p.company_id
       WHERE w.customer_id = $1 AND p.is_active = true
       ORDER BY w.added_at DESC`,
      [req.session.customerId]
    );
    res.render('customer/wishlist', { items: r.rows, session: req.session });
  } catch (err) {
    console.error('[GET /customer/wishlist] error:', err);
    res.status(500).send('Error.');
  }
});

/* ─── ORDER TRACKING (phase 15) ──────────────────────────── */
router.get('/orders/:id', requireCustomer, async (req, res) => {
  const oid = parseInt(req.params.id, 10);
  try {
    const order = (await pool.query(
      `SELECT o.*, c.company_name, c.slug FROM orders o JOIN companies c ON c.id=o.company_id
       WHERE o.id=$1 AND o.customer_id=$2`, [oid, req.session.customerId]
    )).rows[0];
    if (!order) return res.redirect('/customer/orders');
    const [items, history, ret] = await Promise.all([
      pool.query('SELECT * FROM order_items WHERE order_id=$1 ORDER BY id', [oid]),
      pool.query('SELECT status, note, created_at FROM order_status_history WHERE order_id=$1 ORDER BY created_at', [oid]),
      pool.query("SELECT status FROM return_requests WHERE order_id=$1 ORDER BY id DESC LIMIT 1", [oid]),
    ]);
    res.render('customer/order_track', { order, items: items.rows, history: history.rows, returnStatus: ret.rows[0] ? ret.rows[0].status : null, session: req.session });
  } catch (e) { console.error('[order track]', e.message); res.status(500).send('Error.'); }
});

/* ─── SAVED ADDRESSES (phase 13) ─────────────────────────── */
router.get('/addresses', requireCustomer, async (req, res) => {
  try {
    const rows = (await pool.query('SELECT * FROM customer_addresses WHERE customer_id=$1 ORDER BY is_default DESC, id DESC', [req.session.customerId])).rows;
    res.render('customer/addresses', { addresses: rows, session: req.session });
  } catch (e) { console.error('[addresses]', e.message); res.status(500).send('Error.'); }
});
router.post('/addresses/add', requireCustomer, async (req, res) => {
  const b = req.body || {};
  const s = (v, n) => String(v || '').trim().slice(0, n) || null;
  const cid = req.session.customerId;
  try {
    const makeDefault = String(b.is_default) === '1';
    if (makeDefault) await pool.query('UPDATE customer_addresses SET is_default=false WHERE customer_id=$1', [cid]);
    const cnt = (await pool.query('SELECT COUNT(*)::int n FROM customer_addresses WHERE customer_id=$1', [cid])).rows[0].n;
    await pool.query(
      `INSERT INTO customer_addresses (customer_id, label, recipient_name, phone, governorate, city, street, apartment, notes, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [cid, s(b.label, 40), s(b.recipient_name, 100), s(b.phone, 30), s(b.governorate, 60), s(b.city, 60), s(b.street, 200), s(b.apartment, 60), s(b.notes, 300), makeDefault || cnt === 0]
    );
  } catch (e) { console.error('[address add]', e.message); }
  res.redirect('/customer/addresses');
});
router.post('/addresses/:id/default', requireCustomer, async (req, res) => {
  const cid = req.session.customerId;
  try {
    await pool.query('UPDATE customer_addresses SET is_default=false WHERE customer_id=$1', [cid]);
    await pool.query('UPDATE customer_addresses SET is_default=true WHERE id=$1 AND customer_id=$2', [parseInt(req.params.id, 10), cid]);
  } catch (e) { console.error(e.message); }
  res.redirect('/customer/addresses');
});
router.post('/addresses/:id/delete', requireCustomer, async (req, res) => {
  try { await pool.query('DELETE FROM customer_addresses WHERE id=$1 AND customer_id=$2', [parseInt(req.params.id, 10), req.session.customerId]); } catch (e) { console.error(e.message); }
  res.redirect('/customer/addresses');
});

/* ─── LOYALTY POINTS (phase 19) ──────────────────────────── */
router.get('/points', requireCustomer, async (req, res) => {
  try {
    const c = (await pool.query('SELECT loyalty_points, wallet_balance FROM customers WHERE id=$1', [req.session.customerId])).rows[0] || { loyalty_points: 0, wallet_balance: 0 };
    const orders = (await pool.query('SELECT id, points_earned, points_redeemed, total_amount, created_at FROM orders WHERE customer_id=$1 AND (points_earned>0 OR points_redeemed>0) ORDER BY id DESC LIMIT 50', [req.session.customerId])).rows;
    res.render('customer/points', {
      points: c.loyalty_points,
      wallet: Number(c.wallet_balance || 0),
      orders,
      session: req.session,
      giftSaved: req.query.gift === '1',
      giftError: req.query.gifterror || null,
    });
  } catch (e) { console.error('[points]', e.message); res.status(500).send('Error.'); }
});

/* ─── GIFT-CARD REDEEM → WALLET (phase 31) ───────────────── */
// A logged-in customer enters a gift-card code; if valid + unredeemed the card's
// value is credited to their wallet_balance (atomic, one-time). The wallet is
// then usable as payment at any of that store's checkouts.
router.post('/wallet/redeem', requireCustomer, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 24);
  if (!code) return res.redirect('/customer/points?gifterror=' + encodeURIComponent('أدخلي كود صحيح'));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock the card row; only redeem if active and not already redeemed.
    const card = (await client.query(
      `SELECT id, amount FROM gift_cards
        WHERE code=$1 AND is_active=true AND redeemed_by IS NULL
        FOR UPDATE`,
      [code]
    )).rows[0];
    if (!card) {
      await client.query('ROLLBACK');
      return res.redirect('/customer/points?gifterror=' + encodeURIComponent('الكود غير صالح أو مستخدم بالفعل'));
    }
    await client.query('UPDATE gift_cards SET redeemed_by=$1, redeemed_at=now() WHERE id=$2', [req.session.customerId, card.id]);
    await client.query('UPDATE customers SET wallet_balance = wallet_balance + $1 WHERE id=$2', [card.amount, req.session.customerId]);
    await client.query('COMMIT');
    res.redirect('/customer/points?gift=1');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[wallet redeem]', e.message);
    res.redirect('/customer/points?gifterror=' + encodeURIComponent('تعذّر تفعيل الكرت'));
  } finally {
    client.release();
  }
});

/* ─── SUBSCRIPTIONS (phase 32) ───────────────────────────── */
router.get('/subscriptions', requireCustomer, async (req, res) => {
  try {
    const subs = (await pool.query(
      `SELECT s.*, p.name AS product_name, p.image_url, c.company_name, c.slug
         FROM subscriptions s
         JOIN products p ON p.id = s.product_id
         JOIN companies c ON c.id = s.company_id
        WHERE s.customer_id=$1 ORDER BY (s.status='active') DESC, s.next_renewal`,
      [req.session.customerId]
    )).rows;
    res.render('customer/subscriptions', { subs, session: req.session, created: req.query.created === '1' });
  } catch (e) { console.error('[subscriptions]', e.message); res.status(500).send('Error.'); }
});
router.post('/subscriptions/:id/cancel', requireCustomer, async (req, res) => {
  try {
    await pool.query("UPDATE subscriptions SET status='cancelled' WHERE id=$1 AND customer_id=$2", [parseInt(req.params.id, 10), req.session.customerId]);
  } catch (e) { console.error('[sub cancel]', e.message); }
  res.redirect('/customer/subscriptions');
});

/* ─── RETURN REQUESTS (phase 20) ─────────────────────────── */
router.post('/orders/:id/return', requireCustomer, async (req, res) => {
  const oid = parseInt(req.params.id, 10);
  try {
    const o = (await pool.query('SELECT id, company_id FROM orders WHERE id=$1 AND customer_id=$2', [oid, req.session.customerId])).rows[0];
    if (o) {
      const dup = (await pool.query("SELECT 1 FROM return_requests WHERE order_id=$1 AND status IN ('pending','approved')", [oid])).rowCount;
      if (!dup) await pool.query(
        'INSERT INTO return_requests (order_id, company_id, customer_id, reason, notes) VALUES ($1,$2,$3,$4,$5)',
        [oid, o.company_id, req.session.customerId, String(req.body.reason || '').slice(0, 120) || null, String(req.body.notes || '').slice(0, 500) || null]
      );
    }
  } catch (e) { console.error('[return]', e.message); }
  res.redirect('/customer/orders');
});

/* ─── LANGUAGE TOGGLE ────────────────────────────────────── */
router.post('/lang/:lang', async (req, res) => {
  const lang = req.params.lang === 'en' ? 'en' : 'ar';
  if (req.session && req.session.customerId) {
    req.session.customerLang = lang;
    try { await pool.query('UPDATE customers SET lang = $1 WHERE id = $2', [lang, req.session.customerId]); } catch (e) { console.error(e); }
  }
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.redirect(req.get('Referrer') || '/customer/orders');
});

module.exports = router;
