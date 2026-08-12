// Radiology (OncoScan) vertical schema — a non-diagnostic imaging decision-support
// tool rebuilt inside the OscarDevs Node app (own doctor login, own tables).
// DICOM heavy-lifting happens in the browser; the server only stores bytes +
// metadata and talks to the vision model, so RAM stays light.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureRadiologySchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Doctors (dedicated login for the radiology platform; medical data stays
      -- scoped per doctor).
      CREATE TABLE IF NOT EXISTS rad_doctors (
        id            SERIAL PRIMARY KEY,
        email         TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name          TEXT,
        specialty     TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login    TIMESTAMPTZ
      );
      -- A radiology study (CT/MRI series) owned by one doctor.
      CREATE TABLE IF NOT EXISTS rad_studies (
        id               SERIAL PRIMARY KEY,
        doctor_id        INTEGER NOT NULL REFERENCES rad_doctors(id) ON DELETE CASCADE,
        patient_ref      TEXT,                 -- a non-name reference (e.g. MRN/code)
        modality         TEXT NOT NULL DEFAULT 'CT',
        description      TEXT,
        clinical_context TEXT,
        num_slices       INTEGER NOT NULL DEFAULT 0,
        status           TEXT NOT NULL DEFAULT 'uploaded', -- uploaded|analyzed
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_rad_studies_doctor ON rad_studies (doctor_id, created_at DESC);
      -- Which identifying tags were emptied out of this study's headers on
      -- upload. Shown to the doctor, so "the name is gone" is a statement they
      -- can check rather than a promise on a marketing page.
      ALTER TABLE rad_studies ADD COLUMN IF NOT EXISTS deidentified TEXT;
      -- Original DICOM file bytes per slice (near-zero ingestion memory; decoded
      -- on demand in the browser).
      CREATE TABLE IF NOT EXISTS rad_slices (
        id           SERIAL PRIMARY KEY,
        study_id     INTEGER NOT NULL REFERENCES rad_studies(id) ON DELETE CASCADE,
        slice_index  INTEGER NOT NULL DEFAULT 0,
        filename     TEXT,
        dicom_bytes  BYTEA NOT NULL,
        byte_size    INTEGER NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_rad_slices_study ON rad_slices (study_id, slice_index);
      -- AI reports over a study.
      CREATE TABLE IF NOT EXISTS rad_reports (
        id           SERIAL PRIMARY KEY,
        study_id     INTEGER NOT NULL REFERENCES rad_studies(id) ON DELETE CASCADE,
        model_name   TEXT,
        focus        TEXT,
        custom_task  TEXT,
        report_text  TEXT,
        cost_usd     NUMERIC(10,4) NOT NULL DEFAULT 0,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_rad_reports_study ON rad_reports (study_id, created_at DESC);
    `);
  } catch (e) {
    console.error('[radiology schema]', e.message);
  } finally {
    client.release();
  }
}

module.exports = { ensureRadiologySchema };
