#!/usr/bin/env node
/**
 * One-off backfill for the referral loop.
 *
 * Referral codes and free_until are set when an application is approved, so
 * companies that existed before that code shipped have neither: their dashboard
 * shows no invite link and nothing records when their free period ends. This
 * gives every existing company both, and is safe to re-run — it only touches
 * rows where the value is still NULL.
 *
 *   node scripts/backfill-referrals.js            # apply
 *   node scripts/backfill-referrals.js --dry-run  # show what would change
 */
'use strict';
const { Pool } = require('pg');

const FREE_TRIAL_MONTHS = 6;
// Same alphabet as the approval path: no O/0, I/1 or S/5, because these codes
// get typed by hand and read out over the phone.
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

const dryRun = process.argv.includes('--dry-run');

function randomCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return code;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — run this inside the deployment shell.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // The columns are normally created by schema.js at server boot, but this
    // script is run from a shell where that hasn't happened yet — so create
    // them here too rather than failing on a missing column. Same statements,
    // all IF NOT EXISTS, so running both ways is harmless.
    await pool.query(`
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS free_until DATE;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS referral_code TEXT;
      ALTER TABLE companies ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES companies(id);
      CREATE UNIQUE INDEX IF NOT EXISTS companies_referral_code_idx
        ON companies (referral_code) WHERE referral_code IS NOT NULL;
    `);

    // 1) Free period — date it from when the company was actually created, so a
    //    client onboarded four months ago keeps two months, not a fresh six.
    const missingFree = await pool.query(
      'SELECT COUNT(*)::int AS n FROM companies WHERE free_until IS NULL'
    );
    console.log(`companies without free_until: ${missingFree.rows[0].n}`);
    if (!dryRun && missingFree.rows[0].n > 0) {
      const r = await pool.query(
        `UPDATE companies
            SET free_until = (created_at + INTERVAL '${FREE_TRIAL_MONTHS} months')::date
          WHERE free_until IS NULL`
      );
      console.log(`  → set free_until on ${r.rowCount} companies`);
    }

    // 2) Referral codes — one at a time so a collision retries that row only.
    const need = await pool.query(
      'SELECT id, company_name FROM companies WHERE referral_code IS NULL ORDER BY id'
    );
    console.log(`companies without a referral code: ${need.rows.length}`);
    if (dryRun) {
      console.log('\n(dry run — nothing written)');
      return;
    }

    let done = 0;
    for (const company of need.rows) {
      let assigned = null;
      for (let attempt = 0; attempt < 12 && !assigned; attempt += 1) {
        const code = randomCode();
        try {
          // The unique index is the real guard — a concurrent insert that takes
          // the same code makes this throw, and we simply try another.
          const r = await pool.query(
            'UPDATE companies SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL',
            [code, company.id]
          );
          if (r.rowCount === 1) assigned = code;
        } catch (err) {
          if (err.code !== '23505') throw err; // not a uniqueness collision
        }
      }
      if (assigned) {
        done += 1;
        console.log(`  ${company.company_name}: ${assigned}`);
      } else {
        console.warn(`  ${company.company_name}: could not allocate a code — skipped`);
      }
    }
    console.log(`\ndone — ${done} code(s) assigned`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('backfill failed:', err.message);
  process.exit(1);
});
