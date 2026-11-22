// «مراقب السرعة» للأساطيل — Speed Guard Fleet (المالك ٢٠٢٦-١٠-٠٩).
//
// تطبيق أندرويد على شاشة العربية بيقيس السرعة بالـGPS ويدّى إنذار صوتى للسواق لما يعدّى
// الحد. والنسخة دى للشركات اللى عندها أسطول: صاحب الشركة بيحدد الحد، والتطبيق بيبعتله
// كل تجاوز (مين السواق، إمتى، أقصى سرعة، المدة، المكان) — تقرير مخالفات لكل سواق.
//
// منفصل تماماً عن باقى الموقع: مش نوع نشاط، مالوش صفحة عامة، مش فى السايت‌ماب ولا
// llms.txt، وكل صفحاته noindex — لحد ما المالك يجرّب ويقول «كويس» (scripts/check-fleet.js).
//
// ثلاث جداول:
//   fleet_accounts   — الشركة: اسم + كود انضمام للسواقين + كلمة سر المالك + حد السرعة.
//   fleet_drivers    — كل جهاز انضم بالكود: اسم السواق + توكن سرّى للجهاز (مش الـid).
//   fleet_violations — كل تجاوز: من/لحد، أقصى سرعة، الحد وقتها، المدة، أول مكان.
//                      client_uuid بيمنع التكرار لو التطبيق بعت نفس التجاوز مرتين (نت ضعيف).
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function ensureFleetSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS fleet_accounts (
        id             SERIAL PRIMARY KEY,
        name           TEXT NOT NULL,
        join_code      TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        speed_limit    INTEGER NOT NULL DEFAULT 90,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS fleet_drivers (
        id            SERIAL PRIMARY KEY,
        fleet_id      INTEGER NOT NULL REFERENCES fleet_accounts(id) ON DELETE CASCADE,
        name          TEXT NOT NULL,
        device_id     TEXT NOT NULL,
        token         TEXT NOT NULL UNIQUE,
        active        BOOLEAN NOT NULL DEFAULT true,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at  TIMESTAMPTZ,
        UNIQUE (fleet_id, device_id)
      )`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS fleet_violations (
        id           SERIAL PRIMARY KEY,
        fleet_id     INTEGER NOT NULL REFERENCES fleet_accounts(id) ON DELETE CASCADE,
        driver_id    INTEGER NOT NULL REFERENCES fleet_drivers(id) ON DELETE CASCADE,
        client_uuid  TEXT NOT NULL,
        started_at   TIMESTAMPTZ NOT NULL,
        ended_at     TIMESTAMPTZ NOT NULL,
        max_speed    NUMERIC(6,1) NOT NULL,
        speed_limit  INTEGER NOT NULL,
        duration_s   INTEGER NOT NULL,
        lat          DOUBLE PRECISION,
        lng          DOUBLE PRECISION,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (driver_id, client_uuid)
      )`);
    await client.query(`CREATE INDEX IF NOT EXISTS fleet_violations_fleet_time_idx
                          ON fleet_violations (fleet_id, started_at DESC)`);
  } finally {
    client.release();
  }
}

module.exports = { ensureFleetSchema, pool };
