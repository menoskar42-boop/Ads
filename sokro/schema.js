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

      -- ── Memory ───────────────────────────────────────────────────────────
      -- Conversations + their messages (short-term context window for the LLM).
      CREATE TABLE IF NOT EXISTS sokro_conversations (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        title      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sokro_messages (
        id              SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES sokro_conversations(id) ON DELETE CASCADE,
        role            TEXT NOT NULL,          -- user | assistant | system | tool
        content         TEXT NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sokro_messages_conv_idx ON sokro_messages(conversation_id, id);

      -- Durable per-user context / long-term memory (JSONB → future-proof).
      CREATE TABLE IF NOT EXISTS sokro_user_context (
        user_id    INTEGER PRIMARY KEY REFERENCES sokro_users(id) ON DELETE CASCADE,
        data       JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- High-level tasks (a run) + their per-step execution history.
      CREATE TABLE IF NOT EXISTS sokro_tasks (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        conversation_id INTEGER REFERENCES sokro_conversations(id) ON DELETE SET NULL,
        goal            TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|failed
        plan            JSONB,
        result          JSONB,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sokro_execution_history (
        id         SERIAL PRIMARY KEY,
        task_id    INTEGER NOT NULL REFERENCES sokro_tasks(id) ON DELETE CASCADE,
        step       INTEGER NOT NULL DEFAULT 0,
        action     TEXT,
        status     TEXT NOT NULL,               -- ok | error | retry
        input      JSONB,
        output     JSONB,
        error      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- Scheduler / watchers: recurring goals executed by a periodic cron ping
      -- (no queues/workers). Sensitive plans are skipped on auto-runs.
      CREATE TABLE IF NOT EXISTS sokro_scheduled_tasks (
        id            SERIAL PRIMARY KEY,
        user_id       INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        goal          TEXT NOT NULL,
        every_minutes INTEGER NOT NULL DEFAULT 60,
        next_run_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_run_at   TIMESTAMPTZ,
        last_result   JSONB,
        active        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sokro_sched_due_idx ON sokro_scheduled_tasks(active, next_run_at);

      -- Browser-extension bridge: commands the server enqueues for the user's
      -- Chrome extension to run in their LIVE browser (logged-in sessions), plus
      -- the result the extension posts back. Avoids server-side Chromium.
      CREATE TABLE IF NOT EXISTS sokro_ext_commands (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        kind       TEXT NOT NULL,                 -- browse | extract_table | click | fill
        input      JSONB,
        status     TEXT NOT NULL DEFAULT 'pending', -- pending | running | done | error
        output     JSONB,
        error      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sokro_ext_pending_idx ON sokro_ext_commands(user_id, status, id);

      -- Operator learning memory: successful action sequences per site, a
      -- structural fingerprint of the site's start page (to detect big layout
      -- changes over time), and usage frequency (to learn the user's favorite
      -- sites). Lets a later run reuse a path that worked and warn when a site
      -- changed shape. Namespaced + additive.
      CREATE TABLE IF NOT EXISTS sokro_operate_memory (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        host        TEXT NOT NULL,
        goal        TEXT,
        fingerprint TEXT,
        trail       JSONB,
        uses        INTEGER NOT NULL DEFAULT 1,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sokro_operate_mem_idx ON sokro_operate_memory(user_id, host, updated_at DESC);
    `);
    console.log('Sokro schema ready.');
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { ensureSokroSchema };
