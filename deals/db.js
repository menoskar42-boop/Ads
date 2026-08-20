'use strict';

const { Pool } = require('pg');

const connectionString = process.env.DEALS_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('DEALS_DATABASE_URL or DATABASE_URL is required');

const pool = new Pool({ connectionString });

async function initDealsDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS deals_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      site_name TEXT NOT NULL DEFAULT 'Deals',
      site_description TEXT NOT NULL DEFAULT 'اختيارات شراء موصى بها',
      logo_url TEXT,
      theme_color TEXT NOT NULL DEFAULT '#0f766e',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO deals_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

    CREATE TABLE IF NOT EXISTS deals_categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      is_published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deals_catalog_products (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'MANUAL'
        CHECK (source IN ('MANUAL','AMAZON_API','ALIEXPRESS_API','ALIBABA_API','EBAY_API','NOON_API')),
      external_id TEXT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      short_description TEXT,
      full_description TEXT,
      brand TEXT,
      category_id INTEGER REFERENCES deals_categories(id) ON DELETE SET NULL,
      image_url TEXT,
      current_price NUMERIC(10,2),
      currency TEXT NOT NULL DEFAULT 'EGP',
      original_price NUMERIC(10,2),
      amazon_product_url TEXT,
      affiliate_url TEXT NOT NULL,
      rating NUMERIC(2,1),
      review_count INTEGER,
      availability TEXT,
      is_featured BOOLEAN NOT NULL DEFAULT false,
      is_published BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_deals_catalog_public
      ON deals_catalog_products (is_published, is_featured, created_at DESC);

    CREATE TABLE IF NOT EXISTS deals_articles (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT,
      body TEXT NOT NULL,
      cover_image_url TEXT,
      is_published BOOLEAN NOT NULL DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS deals_admin_users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

module.exports = { pool, initDealsDb };