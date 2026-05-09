require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const i18nMiddleware = require('./src/middleware/i18n');
const tenantMiddleware = require('./src/middleware/tenant');
const indexRouter = require('./src/routes/index');
const tenantRouter = require('./src/routes/tenant');
const companyRouter = require('./src/routes/company');
const adminRouter = require('./src/routes/admin');
const shopRouter = require('./src/routes/shop');
const customerRouter = require('./src/routes/customer');

const app = express();
const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'oscardevs-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(i18nMiddleware);

// Company dashboard must be before tenant middleware
app.use('/company', companyRouter);

// Super admin panel must be before tenant middleware too
app.use('/admin', adminRouter);

// Shop and customer routers — also before tenant middleware
app.use('/shop', shopRouter);
app.use('/customer', customerRouter);

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
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
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
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        sender_name TEXT NOT NULL,
        sender_email TEXT,
        sender_phone TEXT,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS sender_phone TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS page_type TEXT DEFAULT 'portfolio';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EGP';
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name TEXT NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL,
        image_url TEXT,
        stock INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        phone TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        customer_id INTEGER REFERENCES customers(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        shipping_address TEXT NOT NULL,
        total_amount NUMERIC(10,2) NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id),
        product_name TEXT NOT NULL,
        unit_price NUMERIC(10,2) NOT NULL,
        quantity INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS product_categories (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        name TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS product_images (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        image_url TEXT NOT NULL,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
        company_id INTEGER REFERENCES companies(id),
        change_amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        notes TEXT,
        order_id INTEGER REFERENCES orders(id),
        created_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS banner_slides (
        id SERIAL PRIMARY KEY,
        company_id INTEGER REFERENCES companies(id),
        image_url TEXT NOT NULL,
        target_url TEXT,
        caption TEXT,
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now()
      );
      ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES product_categories(id);
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_top TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_sidebar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS adsense_bottom TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT;
      ALTER TABLE customers ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE admins ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE company_users ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ar';
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS content_i18n BOOLEAN DEFAULT false;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name_ar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_name_en TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS description_ar TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS description_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS name_ar TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS name_en TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS description_ar TEXT;
      ALTER TABLE products ADD COLUMN IF NOT EXISTS description_en TEXT;
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_ar TEXT;
      ALTER TABLE product_categories ADD COLUMN IF NOT EXISTS name_en TEXT;
    `);
    console.log('Database tables ready.');
  } catch (err) {
    console.error('DB init warning:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

// Start immediately so Replit can detect the open port
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Oscardevs Ads running on http://0.0.0.0:${PORT}`);
});

// Run schema migration in background — does not block startup
initDb().catch(err => console.error('DB init warning:', err.message));
