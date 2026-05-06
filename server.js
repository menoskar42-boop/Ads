require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const tenantMiddleware = require('./src/middleware/tenant');
const indexRouter = require('./src/routes/index');
const tenantRouter = require('./src/routes/tenant');
const companyRouter = require('./src/routes/company');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'oscardevs-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));

// Company dashboard must be before tenant middleware
app.use('/company', companyRouter);

// Tenant detection: runs on every non-company request
app.use(tenantMiddleware);

// If req.tenant is set, render the tenant page
app.use((req, res, next) => {
  if (req.tenant) {
    return tenantRouter(req, res, next);
  }
  next();
});

// Main platform homepage
app.use('/', indexRouter);

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { subdomain: null });
});

async function initDb() {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        slug TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        description TEXT,
        logo_url TEXT,
        theme_color TEXT DEFAULT '#2563eb',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS banner_ads (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        position TEXT, image_url TEXT, target_url TEXT,
        is_active BOOLEAN DEFAULT true
      );
      CREATE TABLE IF NOT EXISTS company_users (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS portfolio_items (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        title TEXT, description TEXT, image_url TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
    `);
    console.log('Database tables ready.');
  } catch (err) {
    console.error('DB init warning:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

initDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Oscardevs Ads running on http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to init DB:', err.message);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Oscardevs Ads running (DB init skipped) on http://0.0.0.0:${PORT}`);
  });
});
