// Egyptian e-invoicing (ETA), as a per-merchant opt-in add-on.
//
// Two decisions shape this whole module, both the owner's:
//
//   1. EVERY merchant has their OWN credentials. OscarDevs never holds one
//      central account and never submits on anyone's behalf — a submission is
//      made with the taxpayer's own credentials or it is not made at all.
//
//   2. It is OPTIONAL. A merchant who never configures it sees nothing change:
//      no extra screens, no warnings, no half-working feature. The whole system
//      is inert until somebody switches it on for themselves.
//
// The tables are deliberately vertical-agnostic. A shop invoice, a pharmacy
// sale, a clinic bill, a furniture invoice and a workshop job card are all just
// "a document with lines" as far as the tax authority is concerned, so this
// stores a source_kind + source_id rather than growing a column per vertical.
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureEinvoiceSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- One row per merchant who has turned this on. No row means off, which is
      -- why nothing here is NOT NULL beyond the key: a half-filled form must be
      -- storable so the merchant can come back to it.
      CREATE TABLE IF NOT EXISTS einvoice_settings (
        company_id      INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        enabled         BOOLEAN NOT NULL DEFAULT false,
        -- 'preprod' until the merchant has passed testing. Kept per merchant
        -- because one shop being live must never move another shop's traffic to
        -- the production tax environment.
        environment     TEXT NOT NULL DEFAULT 'preprod',
        -- Taxpayer identity as the authority knows it.
        tax_id          TEXT,
        activity_code   TEXT,
        branch_code     TEXT DEFAULT '0',
        issuer_name     TEXT,
        issuer_country  TEXT DEFAULT 'EG',
        issuer_governate TEXT,
        issuer_city     TEXT,
        issuer_street   TEXT,
        issuer_building TEXT,
        -- AES-256-GCM blobs. Never selected into a view, never logged.
        client_id_enc     TEXT,
        client_secret_enc TEXT,
        -- Signing cannot happen on our servers: the authority requires the
        -- document to be signed with the taxpayer's own certificate, held on
        -- their HSM/token. So the merchant tells us where to send a built
        -- document to be signed, and we never see the private key.
        --   'none'   → documents are built and held, nothing is submitted
        --   'local'  → the merchant runs the authority's signer on their PC
        --   'remote' → a signing service the merchant configured
        signing_mode    TEXT NOT NULL DEFAULT 'none',
        signer_url      TEXT,
        signer_token_enc TEXT,
        last_check_at   TIMESTAMPTZ,
        last_check_ok   BOOLEAN,
        last_check_note TEXT,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- One row per document we have built. The queue, the audit trail and the
      -- "what have we not sent" report are all this table.
      --
      -- status: draft → ready → signed → submitted → accepted | rejected | failed
      -- 'cancelled' is reachable when the merchant voids the source invoice.
      CREATE TABLE IF NOT EXISTS einvoice_documents (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        -- Which vertical the source lives in, and its id there. No foreign key:
        -- the source tables differ per vertical and a hard reference would make
        -- this module depend on all of them.
        source_kind   TEXT NOT NULL,
        source_id     INTEGER NOT NULL,
        internal_id   TEXT,
        doc_type      TEXT NOT NULL DEFAULT 'I',
        status        TEXT NOT NULL DEFAULT 'draft',
        -- The built document, exactly as it will be signed. Kept so a rejection
        -- can be read back and understood months later.
        payload       JSONB,
        total_amount  NUMERIC(14,5),
        issued_at     TIMESTAMPTZ,
        -- What the authority gave back.
        submission_uuid TEXT,
        long_id       TEXT,
        eta_status    TEXT,
        error_code    TEXT,
        error_message TEXT,
        attempts      INTEGER NOT NULL DEFAULT 0,
        last_attempt_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- One document per source record: rebuilding an invoice must update the
      -- row, never create a second one that could be submitted twice.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_einv_doc_source
        ON einvoice_documents (company_id, source_kind, source_id);
      CREATE INDEX IF NOT EXISTS idx_einv_doc_status
        ON einvoice_documents (company_id, status, created_at DESC);

      -- Every attempt, kept even when it succeeded. "It was rejected and we
      -- fixed it" is a question somebody asks six months later, and a status
      -- column alone cannot answer it.
      CREATE TABLE IF NOT EXISTS einvoice_attempts (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        document_id INTEGER NOT NULL REFERENCES einvoice_documents(id) ON DELETE CASCADE,
        phase       TEXT NOT NULL,
        ok          BOOLEAN NOT NULL DEFAULT false,
        code        TEXT,
        message     TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_einv_attempts
        ON einvoice_attempts (company_id, document_id, created_at DESC);

      -- The merchant's own item codes. The authority wants every line coded (GS1 or
      -- the authority's own EGS list), and a workshop's "brake pads" is not a
      -- code. Mapping lives here so the merchant fills it in once.
      CREATE TABLE IF NOT EXISTS einvoice_item_codes (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        code_type   TEXT NOT NULL DEFAULT 'EGS',
        item_code   TEXT NOT NULL,
        unit_type   TEXT NOT NULL DEFAULT 'EA',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_einv_item_label
        ON einvoice_item_codes (company_id, lower(label));
    `);
    console.log('E-invoice schema ready.');
  } catch (err) {
    console.error('[einvoice schema]', err.message);
  } finally {
    client.release();
  }
}

module.exports = { ensureEinvoiceSchema };
