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
      -- A reminder is usually a MOMENT, not a rhythm: «فكّرني الساعة ٥» is not
      -- «كل ٥ ساعات». Without this the only way to express it was a repeating
      -- task that keeps firing after the thing has passed.
      ALTER TABLE sokro_scheduled_tasks ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'recurring';
      ALTER TABLE sokro_scheduled_tasks ADD COLUMN IF NOT EXISTS title TEXT;
      ALTER TABLE sokro_scheduled_tasks ALTER COLUMN every_minutes DROP NOT NULL;

      -- ── Where a reminder actually lands ──────────────────────────────────
      -- The scheduler used to run the task and write the result into its own
      -- row. Nobody reads a row. A reminder nobody receives is not a reminder,
      -- so every run leaves something the app can show — and marks whether it
      -- has been seen.
      CREATE TABLE IF NOT EXISTS sokro_notifications (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        source     TEXT NOT NULL DEFAULT 'schedule',   -- schedule | task | system
        title      TEXT,
        body       TEXT,
        meta       JSONB,
        read_at    TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sokro_notif_unread_idx
        ON sokro_notifications(user_id, read_at, id DESC);

      -- ── Meeting agendas ──────────────────────────────────────────────────
      -- Points arrive one sentence at a time, over a whole conversation. Kept
      -- in the transcript they get re-read (and re-ordered, and occasionally
      -- lost) every turn; kept as rows they are simply the list.
      CREATE TABLE IF NOT EXISTS sokro_agendas (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL DEFAULT 'الأجندة',
        when_at    TIMESTAMPTZ,
        status     TEXT NOT NULL DEFAULT 'open',      -- open | closed
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sokro_agenda_items (
        id         SERIAL PRIMARY KEY,
        agenda_id  INTEGER NOT NULL REFERENCES sokro_agendas(id) ON DELETE CASCADE,
        user_id    INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        text       TEXT NOT NULL,
        item_key   TEXT NOT NULL,                     -- normalised, for "already there"
        position   INTEGER NOT NULL DEFAULT 1,
        done       BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- The same point cannot be on the same agenda twice. Two rows is how a
      -- list stops being trusted, and dedupe in code alone loses the race.
      CREATE UNIQUE INDEX IF NOT EXISTS sokro_agenda_item_once
        ON sokro_agenda_items(agenda_id, item_key);
      CREATE INDEX IF NOT EXISTS sokro_agenda_items_idx
        ON sokro_agenda_items(agenda_id, position);

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

      -- ── Bookings ─────────────────────────────────────────────────────────
      -- The DECISIONS behind a booking conversation. The messages table already
      -- keeps the words; re-reading them every turn is how a required detail
      -- gets asked twice and another one never gets asked at all. This row says
      -- what is known, and how far along the confirmation it is.
      --
      -- status: collecting → reviewing → ready_for_confirmation → confirmed →
      --         submitted, plus cancelled / failed.
      CREATE TABLE IF NOT EXISTS sokro_bookings (
        id              SERIAL PRIMARY KEY,
        user_id         INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        conversation_id INTEGER,
        kind            TEXT NOT NULL,            -- flight | train | hotel | restaurant | appointment
        status          TEXT NOT NULL DEFAULT 'collecting',
        fields          JSONB NOT NULL DEFAULT '{}'::jsonb,
        site            TEXT,
        -- The exact values the user said yes to. A booking is submitted only
        -- while this still matches its fields: editing after confirming voids
        -- the confirmation, because "the date I agreed to" IS the agreement.
        confirmed_fingerprint TEXT,
        confirmed_at    TIMESTAMPTZ,
        submitted_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- One open booking per conversation: two would mean an answer landing in
      -- the wrong one, which is the failure this table exists to prevent.
      CREATE UNIQUE INDEX IF NOT EXISTS sokro_one_open_booking
        ON sokro_bookings(user_id, conversation_id)
        WHERE status IN ('collecting','reviewing','ready_for_confirmation','confirmed');

      -- Opt-in business channels and phone calls. Provider credentials stay in
      -- environment/vault; these tables contain identifiers and delivery state.
      CREATE TABLE IF NOT EXISTS sokro_channel_accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(provider, external_id)
      );
      CREATE TABLE IF NOT EXISTS sokro_channel_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES sokro_users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_message_id TEXT UNIQUE NOT NULL,
        sender TEXT,
        body TEXT,
        direction TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sokro_phone_calls (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        external_id TEXT UNIQUE,
        to_number TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS sokro_consent_audit (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES sokro_users(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        task_id INTEGER REFERENCES sokro_tasks(id) ON DELETE SET NULL,
        permissions JSONB NOT NULL DEFAULT '[]',
        domains JSONB NOT NULL DEFAULT '[]',
        outcome TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sokro_consent_audit_user_idx ON sokro_consent_audit(user_id, id DESC);
    `);
    console.log('Sokro schema ready.');
  } finally {
    client.release();
    await pool.end();
  }
}

module.exports = { ensureSokroSchema };
