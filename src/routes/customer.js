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

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const r = await pool.query('SELECT * FROM customers WHERE email = $1', [email]);
    if (!r.rows.length) return res.render('customer/login', { error: 'Invalid email or password.' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.render('customer/login', { error: 'Invalid email or password.' });
    req.session.customerId = r.rows[0].id;
    req.session.customerEmail = r.rows[0].email;
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

module.exports = router;
