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

// Trust Cloudflare Worker proxy headers (X-Forwarded-Host, X-Forwarded-Proto)
// so req.hostname reflects the original tenant subdomain (e.g. delta.oscardevs.com).
app.set('trust proxy', true);

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
app.use(require('./src/middleware/urls'));

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
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS promo_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_headline TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_subtext TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS hero_cta_text TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_phone TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_whatsapp TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_address TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS show_trust_bar BOOLEAN DEFAULT true;
    `);

    // Demo catalog for the Delta showcase store (only seeded when it has no products,
    // so a real owner's products are never duplicated or overwritten).
    const deltaRes = await client.query("SELECT id, currency FROM companies WHERE slug = 'delta'");
    if (deltaRes.rows.length) {
      const deltaId = deltaRes.rows[0].id;
      if (!deltaRes.rows[0].currency) {
        await client.query('UPDATE companies SET currency = $1 WHERE id = $2', ['EGP', deltaId]);
      }
      const cnt = await client.query('SELECT COUNT(*)::int AS n FROM products WHERE company_id = $1', [deltaId]);
      if (cnt.rows[0].n === 0) {
        const addCat = async (ar, en, idx) => (await client.query(
          'INSERT INTO product_categories (company_id, name, name_ar, name_en, order_index) VALUES ($1,$2,$2,$3,$4) RETURNING id',
          [deltaId, ar, en, idx]
        )).rows[0].id;
        const catPhones = await addCat('موبايلات', 'Mobiles', 0);
        const catComp = await addCat('لابتوبات وكمبيوترات', 'Laptops & PCs', 1);
        const img = (tags, lock) => `https://loremflickr.com/600/600/${tags}?lock=${lock}`;
        const demo = [
          [catPhones, 'آيفون 15 برو ماكس 256GB', 'iPhone 15 Pro Max', 'هيكل تيتانيوم، شاشة 6.7 بوصة Super Retina XDR، شريحة A17 Pro، وكاميرا 48 ميجابكسل.', 84999, img('iphone', 11), 12],
          [catPhones, 'سامسونج جالاكسي S24 ألترا', 'Samsung Galaxy S24 Ultra', 'شاشة 6.8 بوصة Dynamic AMOLED، قلم S Pen، كاميرا 200 ميجابكسل ومعالج Snapdragon 8 Gen 3.', 72999, img('samsung,smartphone', 12), 9],
          [catPhones, 'جوجل بيكسل 8 برو', 'Google Pixel 8 Pro', 'أفضل كاميرا حوسبية، شريحة Tensor G3، وتحديثات أندرويد لمدة 7 سنوات.', 41999, img('smartphone,android', 13), 15],
          [catPhones, 'آيفون 14 128GB', 'iPhone 14', 'شاشة 6.1 بوصة، شريحة A15 Bionic، نظام كاميرا مزدوج وبطارية تدوم طوال اليوم.', 44999, img('iphone,phone', 14), 20],
          [catPhones, 'شاومي ريدمي نوت 13 برو', 'Xiaomi Redmi Note 13 Pro', 'شاشة AMOLED 120Hz، كاميرا 200 ميجابكسل، وشحن سريع 67 واط بسعر اقتصادي.', 18999, img('smartphone', 15), 30],
          [catComp, 'ماك بوك برو 16 M3 Pro', 'MacBook Pro 16 M3 Pro', 'شريحة M3 Pro، شاشة Liquid Retina XDR، 18GB رام و512GB SSD لأصحاب الأعمال الاحترافية.', 149999, img('macbook', 16), 6],
          [catComp, 'ماك بوك إير M2 13 بوصة', 'MacBook Air M2', 'تصميم نحيف بوزن 1.2 كجم، شريحة M2، وبطارية تدوم حتى 18 ساعة.', 64999, img('laptop,apple', 17), 11],
          [catComp, 'لابتوب Dell XPS 15', 'Dell XPS 15', 'معالج Intel Core i7، شاشة 15.6 بوصة OLED، 16GB رام وكرت RTX 4050.', 89999, img('laptop', 18), 8],
          [catComp, 'لابتوب ASUS ROG Gaming', 'ASUS ROG Gaming Laptop', 'للألعاب الثقيلة: RTX 4070، شاشة 165Hz، ومعالج Ryzen 9 وتبريد متقدم.', 99999, img('gaming,laptop', 19), 7],
          [catComp, 'كمبيوتر مكتبي للألعاب RGB', 'RGB Gaming Desktop PC', 'تجميعة قوية: RTX 4070 Ti، 32GB رام، SSD 1TB، وإضاءة RGB كاملة.', 79999, img('computer,gaming', 20), 5],
        ];
        for (const [cat, nameAr, nameEn, descAr, price, image, stock] of demo) {
          await client.query(
            `INSERT INTO products (company_id, category_id, name, description, price, image_url, stock, is_active, name_ar, name_en, description_ar)
             VALUES ($1,$2,$3,$4,$5,$6,$7,true,$3,$8,$4)`,
            [deltaId, cat, nameAr, descAr, price, image, stock, nameEn]
          );
        }
        console.log(`Delta demo catalog seeded (${demo.length} products).`);
      }
    }

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
