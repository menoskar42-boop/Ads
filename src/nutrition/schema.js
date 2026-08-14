// Nutrition practice vertical.
//
// Reuses the multi-tenant `companies` table with page_type = 'nutrition', so
// every dietitian gets their own slug.oscardevs.com page, admin and
// subscription. EVERY table carries company_id: one practice must never be one
// JOIN away from another practice's patient list.
//
// This holds health data about named people. Two rules follow from that and are
// enforced here rather than left to the routes:
//   - patients are ARCHIVED, never deleted, so a measurement history cannot be
//     orphaned or silently rewritten;
//   - the patient's own login lives in its own table with its own password
//     hash, so a practice account being compromised does not hand over every
//     patient account with it.
//
// All statements are additive and idempotent. Ordering matters: an ALTER that
// precedes its CREATE aborts every statement after it in the same string —
// see scripts/check-schema-order.js.
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureNutritionSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS nutrition_settings (
        company_id     INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
        practice_name  TEXT,
        about          TEXT,
        address        TEXT,
        phone          TEXT,
        whatsapp       TEXT,
        hours          TEXT,
        booking_enabled BOOLEAN NOT NULL DEFAULT true,
        -- The dietitian's own default split. Overridable per patient, because
        -- a clinician who disagrees with the default must be able to say so
        -- rather than work around the software.
        protein_per_kg NUMERIC(5,2) NOT NULL DEFAULT 1.8,
        fat_percent    NUMERIC(5,2) NOT NULL DEFAULT 25,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      -- The practice's own staff: an assistant with a scale, somebody on the
      -- phone. Small practices, which is exactly why this matters — the
      -- assistant used to sign in as the dietitian, so a blood panel was one
      -- click from the front desk. Roles live in src/nutrition/perms.js.
      CREATE TABLE IF NOT EXISTS nutrition_staff (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        username      TEXT,
        password_hash TEXT,
        perm_role     TEXT NOT NULL DEFAULT 'reception',
        phone         TEXT,
        login_enabled BOOLEAN NOT NULL DEFAULT false,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nutri_staff_company ON nutrition_staff (company_id);
      -- Partial: a name on the rota with no login is a perfectly normal row.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nutri_staff_username
        ON nutrition_staff (lower(username)) WHERE username IS NOT NULL;

      CREATE TABLE IF NOT EXISTS nutrition_patients (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        phone         TEXT,
        email         TEXT,
        gender        TEXT,                      -- male | female
        birth_date    DATE,
        height_cm     NUMERIC(5,1),
        activity      TEXT NOT NULL DEFAULT 'light',
        goal          TEXT NOT NULL DEFAULT 'maintain',   -- loss | gain | maintain
        -- Per-patient overrides of the practice defaults. NULL means "use the
        -- practice setting", which is different from a stored copy of it: the
        -- copy would stop following the setting the day it changed.
        protein_per_kg NUMERIC(5,2),
        fat_percent    NUMERIC(5,2),
        target_weight_kg NUMERIC(5,1),
        notes         TEXT,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_patients ON nutrition_patients (company_id, is_active, name);

      -- The history the whole system is for. Never updated in place: a
      -- corrected weight is a new reading with its own date, because a curve
      -- that can be edited backwards is not evidence of progress.
      CREATE TABLE IF NOT EXISTS nutrition_measurements (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id   INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        taken_on     DATE NOT NULL DEFAULT CURRENT_DATE,
        weight_kg    NUMERIC(5,1),
        body_fat_pct NUMERIC(4,1),
        waist_cm     NUMERIC(5,1),
        muscle_kg    NUMERIC(5,1),
        -- Who wrote it. A reading the patient logged from their phone and one
        -- the dietitian took on a clinic scale are not the same evidence.
        source       TEXT NOT NULL DEFAULT 'clinic',   -- clinic | patient
        notes        TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_meas ON nutrition_measurements (patient_id, taken_on DESC);

      CREATE TABLE IF NOT EXISTS nutrition_labs (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        taken_on   DATE NOT NULL DEFAULT CURRENT_DATE,
        title      TEXT NOT NULL,
        value      TEXT,
        unit       TEXT,
        notes      TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_labs ON nutrition_labs (patient_id, taken_on DESC);
    `);

    await client.query(`
      -- Foods are per practice. A shared global table sounds tidier until two
      -- dietitians disagree about the calories in a local dish and one of them
      -- silently edits the other's plans.
      CREATE TABLE IF NOT EXISTS nutrition_foods (
        id           SERIAL PRIMARY KEY,
        company_id   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        -- Everything is stored PER 100g and converted at use. Storing "per
        -- serving" would make every number depend on a serving size that gets
        -- edited later, silently restating plans already given to patients.
        kcal         NUMERIC(7,2) NOT NULL DEFAULT 0,
        protein_g    NUMERIC(6,2) NOT NULL DEFAULT 0,
        carbs_g      NUMERIC(6,2) NOT NULL DEFAULT 0,
        fat_g        NUMERIC(6,2) NOT NULL DEFAULT 0,
        serving_desc TEXT,
        serving_g    NUMERIC(7,2),
        category     TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_foods ON nutrition_foods (company_id, is_active, name);

      CREATE TABLE IF NOT EXISTS nutrition_plans (
        id             SERIAL PRIMARY KEY,
        company_id     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id     INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        title          TEXT,
        -- The targets are FROZEN onto the plan when it is written. The engine
        -- recomputes as the patient's weight changes, but the plan the patient
        -- is following was built for the numbers of that day, and a plan whose
        -- targets move underneath it cannot be reviewed.
        target_kcal    INTEGER,
        target_protein INTEGER,
        target_carbs   INTEGER,
        target_fat     INTEGER,
        start_date     DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date       DATE,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_plans ON nutrition_plans (patient_id, is_active);
      -- One active plan per patient, enforced by the database rather than by
      -- the order of two statements. "Deactivate the old one, then insert the
      -- new one" is correct until two tabs do it at once, and then the patient
      -- portal has two plans to choose between and picks wrong.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_one_active_plan
        ON nutrition_plans (patient_id) WHERE is_active;

      CREATE TABLE IF NOT EXISTS nutrition_plan_items (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        plan_id    INTEGER NOT NULL REFERENCES nutrition_plans(id) ON DELETE CASCADE,
        food_id    INTEGER REFERENCES nutrition_foods(id) ON DELETE SET NULL,
        meal       TEXT NOT NULL DEFAULT 'breakfast',
        -- The food's name and its per-100g figures are copied onto the line.
        -- A food edited or archived next month must not silently restate a plan
        -- the patient is already eating from.
        food_name  TEXT,
        grams      NUMERIC(7,2) NOT NULL DEFAULT 100,
        kcal       NUMERIC(7,2) NOT NULL DEFAULT 0,
        protein_g  NUMERIC(6,2) NOT NULL DEFAULT 0,
        carbs_g    NUMERIC(6,2) NOT NULL DEFAULT 0,
        fat_g      NUMERIC(6,2) NOT NULL DEFAULT 0,
        note       TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_nut_plan_items ON nutrition_plan_items (plan_id, meal, sort_order);
    `);

    await client.query(`
      -- The patient's own login. Separate table, separate hash: a compromised
      -- practice account must not hand over every patient account with it.
      CREATE TABLE IF NOT EXISTS nutrition_patient_users (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id    INTEGER NOT NULL UNIQUE REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        login         TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        is_active     BOOLEAN NOT NULL DEFAULT true,
        last_login_at TIMESTAMPTZ,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      -- Unique per practice, not globally: two dietitians may each have a
      -- patient whose phone number is the login, and neither should block the
      -- other.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_pu_login ON nutrition_patient_users (company_id, lower(login));

      -- What the patient actually ate, against the plan. Logged by the patient,
      -- so it is kept apart from the plan itself: the plan is what was
      -- prescribed, this is what happened, and merging them loses the gap that
      -- the whole follow-up is about.
      CREATE TABLE IF NOT EXISTS nutrition_diary (
        id         SERIAL PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        patient_id INTEGER NOT NULL REFERENCES nutrition_patients(id) ON DELETE CASCADE,
        on_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        meal       TEXT NOT NULL DEFAULT 'breakfast',
        item_id    INTEGER REFERENCES nutrition_plan_items(id) ON DELETE SET NULL,
        done       BOOLEAN NOT NULL DEFAULT true,
        note       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_nut_diary ON nutrition_diary (patient_id, on_date);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nut_diary_one ON nutrition_diary (patient_id, on_date, item_id);
    `);
  } finally {
    client.release();
  }
}

module.exports = { ensureNutritionSchema };
