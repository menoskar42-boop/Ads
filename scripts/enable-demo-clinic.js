#!/usr/bin/env node
/**
 * Turn everything on for the demo clinic so the whole feature set can be seen
 * in one place.
 *
 * Modules are off by default — sensible for a real clinic, useless for a demo
 * that is meant to show what the product does. This switches on every module
 * plus the paid add-ons (with a small quota, since those cost real money on
 * every call), and points the clinic at a specialty so the specialty-driven
 * fields are visible too.
 *
 *   node scripts/enable-demo-clinic.js                 # slug "clinic"
 *   node scripts/enable-demo-clinic.js --slug=demo     # another clinic
 *   node scripts/enable-demo-clinic.js --specialty=dentistry
 *   node scripts/enable-demo-clinic.js --dry-run
 */
'use strict';
const { Pool } = require('pg');
const { MODULE_KEYS } = require('../src/clinic/modules');
const { ADDONS, cairoMonth } = require('../src/clinic/addons');
const { getSpecialty } = require('../src/clinic/specialties');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const slug = arg('slug', 'clinic');
// Dentistry by default: it is the specialty with the most to show, and it also
// demonstrates a specialty switching its own module on.
const specialty = arg('specialty', 'dentistry');
const quota = parseInt(arg('quota', '50'), 10) || 50;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — run this inside the deployment shell.');
    process.exit(1);
  }
  if (!getSpecialty(specialty)) {
    console.error(`Unknown specialty "${specialty}" — see src/clinic/specialties.js`);
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const c = (await pool.query(
      'SELECT id, company_name, page_type FROM companies WHERE slug = $1', [slug]
    )).rows[0];
    if (!c) {
      console.error(`No company with slug "${slug}".`);
      process.exit(1);
    }
    if (c.page_type !== 'clinic') {
      console.error(`"${slug}" is a ${c.page_type} page, not a clinic — refusing to touch it.`);
      process.exit(1);
    }
    console.log(`clinic: ${c.company_name} (#${c.id}, /${slug})`);
    console.log(`modules to enable: ${MODULE_KEYS.join(', ')}`);
    console.log(`add-ons to enable: ${ADDONS.map((a) => a.key).join(', ')} (quota ${quota}/month)`);
    console.log(`specialty: ${specialty}`);
    if (dryRun) { console.log('\n(dry run — nothing written)'); return; }

    for (const key of MODULE_KEYS) {
      await pool.query(
        `INSERT INTO clinic_modules (company_id, module_key, enabled, updated_at)
         VALUES ($1,$2,true, now())
         ON CONFLICT (company_id, module_key) DO UPDATE SET enabled = true, updated_at = now()`,
        [c.id, key]
      );
    }
    // Enabling every module is not the same as the clinic seeing every module:
    // a clinical module outside the chosen specialty stays hidden. Say which
    // ones, so a tester counting tabs is not left hunting for a bug.
    const { modulesForSpecialty } = require('../src/clinic/modules');
    const visible = modulesForSpecialty(specialty).map((m) => m.key);
    const hidden = MODULE_KEYS.filter((k) => !visible.includes(k));
    console.log(`  → ${MODULE_KEYS.length} modules on, ${visible.length} visible for "${specialty}"`);
    if (hidden.length) {
      console.log(`  → hidden by specialty (enabled but not shown): ${hidden.join(', ')}`);
    }

    for (const a of ADDONS) {
      await pool.query(
        `INSERT INTO clinic_addons (company_id, addon_key, enabled, monthly_quota, quota_month, used_this_month, updated_at)
         VALUES ($1,$2,true,$3,$4,0, now())
         ON CONFLICT (company_id, addon_key)
         DO UPDATE SET enabled = true, monthly_quota = EXCLUDED.monthly_quota, updated_at = now()`,
        [c.id, a.key, quota, cairoMonth()]
      );
    }
    console.log(`  → ${ADDONS.length} add-on(s) on`);

    // clinic_settings may not have a row yet for a clinic that never opened
    // its settings page, so upsert rather than update.
    await pool.query(
      `INSERT INTO clinic_settings (company_id, specialty, updated_at)
       VALUES ($1,$2, now())
       ON CONFLICT (company_id) DO UPDATE SET specialty = EXCLUDED.specialty, updated_at = now()`,
      [c.id, specialty]
    );
    console.log(`  → specialty set to ${specialty}`);

    console.log(`\ndone — open https://oscardevs.com/clinic after logging in as this clinic`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('failed:', err.message);
  process.exit(1);
});
