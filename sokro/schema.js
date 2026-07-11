'use strict';

// Sokro schema — namespaced `sokro_` so it never touches the merchant/tenant
// tables (same isolation approach as kakeibo's `kkb_`). Additive + idempotent:
// safe to run on every boot.
const { Pool } = require('pg');

async function ensureSokroSchema() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`
      -- Accounts (email + password). Mobile & web both authenticate here.
      CREATE TABLE IF NOT EXISTS sokro_users (
        id            SERIAL PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name  TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Per-user encrypted credential vault. We store ONLY AES-256-GCM
      -- ciphertext (iv:tag:data) — never plaintext, and the value is decrypted
      -- solely at action run-time. It is NEVER placed in an AI prompt.
      CREATE TABLE IF NOT EXISTS sokro_secrets (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,            -- e.g. 'facebook', 'slndr', 'gmail'
        ciphertext TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, name)
      );
    `);
    console.log('Sokro schema ready.');
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { ensureSokroSchema };
