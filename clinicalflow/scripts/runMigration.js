/**
 * One-time migration script — run manually only.
 * Usage:  node scripts/runMigration.js
 *
 * Uses the Supabase Management API to execute raw SQL.
 * Do NOT import or call this from any server startup file.
 */

const supabaseUrl    = process.env.SUPABASE_URL;
const accessToken    = process.env.SUPABASE_ACCESS_TOKEN;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('[migration] ERROR: SUPABASE_URL must be set.');
  process.exit(1);
}

if (!accessToken && !serviceRoleKey) {
  console.error('[migration] ERROR: SUPABASE_ACCESS_TOKEN or SUPABASE_SERVICE_ROLE_KEY must be set.');
  process.exit(1);
}

// Extract project ref:  https://<ref>.supabase.co  →  <ref>
const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

// ── SQL steps ────────────────────────────────────────────────────────────────
const steps = [
  {
    label: 'visits → add column priority',
    sql: `ALTER TABLE visits ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal'`,
  },
  {
    label: 'visits → add column is_urgent',
    sql: `ALTER TABLE visits ADD COLUMN IF NOT EXISTS is_urgent boolean DEFAULT false`,
  },
  {
    label: 'invoices → add column discount_type',
    sql: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type text`,
  },
  {
    label: 'invoices → add column discount_value',
    sql: `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value numeric DEFAULT 0`,
  },
  {
    label: 'create table modules',
    sql: `
      CREATE TABLE IF NOT EXISTS modules (
        id          SERIAL PRIMARY KEY,
        name        text UNIQUE,
        description text
      )
    `,
  },
  {
    label: 'seed modules rows',
    sql: `
      INSERT INTO modules (name, description)
      VALUES
        ('finance',   'Finance & Accounting'),
        ('inventory', 'Inventory & Pharmacy'),
        ('ai',        'AI Copilot'),
        ('insurance', 'Insurance System'),
        ('reports',   'Analytics & BI')
      ON CONFLICT (name) DO NOTHING
    `,
  },
  {
    label: 'create table clinic_modules',
    sql: `
      CREATE TABLE IF NOT EXISTS clinic_modules (
        id          SERIAL PRIMARY KEY,
        clinic_id   uuid,
        module_name text,
        is_enabled  boolean DEFAULT true
      )
    `,
  },
  {
    label: 'clinic_modules → unique constraint (unique_clinic_module)',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'unique_clinic_module'
        ) THEN
          ALTER TABLE clinic_modules
            ADD CONSTRAINT unique_clinic_module UNIQUE (clinic_id, module_name);
        END IF;
      END$$
    `,
  },
];

// ── Execute SQL via Supabase Management API ──────────────────────────────────
async function runSql(sql) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken || serviceRoleKey}`,
    },
    body: JSON.stringify({ query: sql.trim() }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    throw new Error(
      typeof data === 'object' && data.message
        ? data.message
        : `HTTP ${res.status}: ${text.slice(0, 200)}`
    );
  }

  return data;
}

// ── Runner ───────────────────────────────────────────────────────────────────
async function runMigration() {
  console.log(`[migration] Project: ${projectRef}`);
  console.log(`[migration] Running ${steps.length} migration steps…\n`);

  let passed = 0;
  let failed = 0;

  for (const step of steps) {
    process.stdout.write(`  ▶ ${step.label} … `);
    try {
      await runSql(step.sql);
      console.log('OK');
      passed++;
    } catch (err) {
      console.log('FAILED');
      console.error(`    └─ ${err.message}`);
      failed++;
      // Continue — do not abort remaining steps
    }
  }

  console.log(`\n[migration] Done. ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runMigration();
