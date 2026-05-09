require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function createSchema() {
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
        position TEXT,
        image_url TEXT,
        target_url TEXT,
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
        title TEXT,
        description TEXT,
        image_url TEXT,
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
    `);
    console.log('Schema created successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

createSchema().catch(err => {
  console.error('Schema creation failed:', err);
  process.exit(1);
});
