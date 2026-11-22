#!/usr/bin/env node
/**
 * Stand up a demo nutrition practice.
 *
 *   node scripts/enable-demo-nutrition.js            # slug "nutrition"
 *   node scripts/enable-demo-nutrition.js --dry-run  # show, write nothing
 *   node scripts/enable-demo-nutrition.js --no-seed  # company only
 *
 * Idempotent: a patient with the same name is left alone rather than added
 * again. Demo credentials are public in this file, so the seeded people are
 * invented — no real patient data goes in a demo tenant, ever.
 */
'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const DRY = process.argv.includes('--dry-run');
const NO_SEED = process.argv.includes('--no-seed');
const SLUG = 'nutrition';
const EMAIL = 'nutrition@demo.oscardevs.com';
// Same contract as every other demo script: --password= or the env vars, and
// NO default. The old version hashed whatever it got — including the empty
// string when the env was unset — which quietly created a login that accepted
// a BLANK password. bcrypt.compare('', hashOf('')) is true.
const _pwArg = process.argv.find((a) => a.startsWith('--password='));
const PASSWORD = (_pwArg ? _pwArg.slice(11) : '')
  || process.env.DEMO_NUTRITION_PASSWORD || process.env.DEMO_PASSWORD || '';

const say = (m) => console.log((DRY ? '[dry] ' : '') + m);

async function main() {
  let c = (await pool.query('SELECT * FROM companies WHERE slug=$1', [SLUG])).rows[0];

  // Refuse to convert a slug that belongs to another product. Flipping a live
  // shop into a nutrition practice would hide its data behind the wrong admin.
  if (c && c.page_type !== 'nutrition') {
    console.error(`✋ slug "${SLUG}" already exists as page_type="${c.page_type}". Refusing to convert it.`);
    process.exit(1);
  }

  if (!c) {
    say(`creating company "${SLUG}"`);
    if (!DRY) {
      c = (await pool.query(
        `INSERT INTO companies (slug, company_name, page_type, is_active, description)
         VALUES ($1,$2,'nutrition',true,$3) RETURNING *`,
        [SLUG, 'عيادة نيوتريو للتغذية', 'عيادة تغذية علاجية — متابعة وزن وخطط غذائية.'])).rows[0];
    }
  } else { say(`company "${SLUG}" already exists (id ${c.id})`); }
  if (DRY && !c) return;

  // With no password supplied, the demo tenant is still created — it just has
  // no login. A demo nobody can sign into is a small loss; a demo EVERYBODY
  // can sign into (empty password) is not.
  const hash = PASSWORD ? await bcrypt.hash(PASSWORD, 10) : null;
  if (!hash) say('no password supplied — login not created/updated');
  else say(`login ${EMAIL}`);
  if (!DRY && hash) {
    await pool.query(
      `INSERT INTO company_users (company_id, email, password_hash)
       VALUES ($1,$2,$3) ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
      [c.id, EMAIL, hash]);
    await pool.query(
      `INSERT INTO nutrition_settings (company_id, practice_name, about, phone, protein_per_kg, fat_percent)
       VALUES ($1,$2,$3,$4,1.8,25) ON CONFLICT (company_id) DO NOTHING`,
      [c.id, 'عيادة نيوتريو', 'متابعة تغذية علاجية وخطط غذائية مبنية على القياس.', '0882000000']);
  }

  if (NO_SEED) return say('skipping seed');

  const people = [
    ['منى س.', 'female', '1992-03-15', 165, 'moderate', 'loss', 72],
    ['كريم ح.', 'male', '1988-11-02', 178, 'light', 'gain', 80],
  ];
  for (const [name, gender, dob, h, act, goal, target] of people) {
    const exists = (await pool.query(
      'SELECT id FROM nutrition_patients WHERE company_id=$1 AND name=$2', [c.id, name])).rows[0];
    if (exists) { say(`patient "${name}" already there`); continue; }
    say(`+ patient ${name}`);
    if (DRY) continue;
    const p = (await pool.query(
      `INSERT INTO nutrition_patients (company_id, name, gender, birth_date, height_cm, activity, goal, target_weight_kg)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [c.id, name, gender, dob, h, act, goal, target])).rows[0];
    // Three readings a month apart, so the chart and the progress figures have
    // something real to draw rather than a single dot.
    const start = gender === 'female' ? 88.5 : 68.0;
    const step = gender === 'female' ? -2.2 : 1.1;
    for (let i = 0; i < 3; i += 1) {
      await pool.query(
        `INSERT INTO nutrition_measurements (company_id, patient_id, taken_on, weight_kg, source)
         VALUES ($1,$2, CURRENT_DATE - $3::int, $4, 'clinic')`,
        [c.id, p.id, (2 - i) * 30, (start + step * i).toFixed(1)]);
    }
  }
  say('done');
}

main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => pool.end());
