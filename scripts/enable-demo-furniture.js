#!/usr/bin/env node
/**
 * Set up a demo furniture showroom so the whole system can be seen in one place.
 *
 * Unlike enable-demo-clinic.js this also CREATES the company if it is missing,
 * because a furniture business has no other way into the database yet — nothing
 * has been sold through /apply. It switches every section on, fills in the
 * business settings, and seeds a little master data so the screens show what
 * they look like in use rather than five empty tables.
 *
 *   node scripts/enable-demo-furniture.js                  # slug "mobilia"
 *   node scripts/enable-demo-furniture.js --slug=demo-furn
 *   node scripts/enable-demo-furniture.js --password=...   # set the login
 *   node scripts/enable-demo-furniture.js --dry-run
 *   node scripts/enable-demo-furniture.js --no-seed        # company + flags only
 */
'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { OPTIONAL_KEYS } = require('../src/furniture/flags');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const noSeed = process.argv.includes('--no-seed');
const slug = arg('slug', 'mobilia');
const email = arg('email', `${slug}@demo.oscardevs.com`);
// Public demo credentials by design — never put real customer data in here.
const password = arg('password', 'mobilia123');

const SEED = {
  suppliers: [
    ['مصنع الأخشاب المستوردة', '01000000001', 'دمياط'],
    ['التوحيد للدهانات', '01000000002', 'أسيوط'],
  ],
  customers: [
    ['محمد عبد الرحمن', '01000000010', 'أسيوط — الوليدية'],
    ['شركة النيل للمفروشات', '01000000011', 'القاهرة'],
  ],
  // name, unit, qty, min_qty, last price. The first is deliberately below its
  // minimum so the low-stock badge is visible on the demo.
  materials: [
    ['خشب زان 18مم', 'متر', 4, 10, 320],
    ['دهان لاكيه', 'لتر', 40, 5, 180],
    ['مفصلات', 'قطعة', 500, 100, 12],
  ],
  workers: [
    ['سيد نجار', 'نجار', 'piece', 250],
    ['رمضان', 'دهّان', 'daily', 300],
    ['أم محمد', 'تشطيب', 'weekly', 1200],
  ],
  products: [
    ['غرفة نوم كلاسيك', 'غرف نوم', 42000, 26000],
    ['سفرة ٨ كراسي', 'سفر', 28000, 17000],
  ],
};

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set — run this inside the deployment shell.');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let c = (await pool.query('SELECT id, company_name, page_type FROM companies WHERE slug=$1', [slug])).rows[0];

    // Refuse to convert an existing page of another type — that would strip a
    // real business of its admin without warning.
    if (c && c.page_type !== 'furniture') {
      console.error(`"${slug}" is a ${c.page_type} page, not a furniture showroom — refusing to touch it.`);
      process.exit(1);
    }

    console.log(c ? `found: ${c.company_name} (#${c.id}, /${slug})` : `will create company /${slug}`);
    console.log(`sections to enable: ${OPTIONAL_KEYS.join(', ')} (+ master, always on)`);
    console.log(`login: ${email}`);
    console.log(noSeed ? 'seed: skipped (--no-seed)' : `seed: ${Object.entries(SEED).map(([k, v]) => `${v.length} ${k}`).join(', ')}`);
    if (dryRun) { console.log('\n(dry run — nothing written)'); return; }

    if (!c) {
      const ins = await pool.query(
        `INSERT INTO companies (slug, company_name, description, page_type, theme_color, is_active)
         VALUES ($1,$2,$3,'furniture','#C17F3F', true) RETURNING id`,
        [slug, 'موبيليا الأمانة — معرض وورشة نموذجية',
          'معرض وورشة موبيليا نموذجية لتجربة نظام إدارة المعارض من OscarDevs: خامات ومشتريات، مكوّنات القطعة، فواتير بالتقسيط، وحضور ومرتّبات.']
      );
      c = { id: ins.rows[0].id };
      console.log(`  → company created (#${c.id})`);
    }

    const hasUser = await pool.query('SELECT 1 FROM company_users WHERE company_id=$1 LIMIT 1', [c.id]);
    if (!hasUser.rows.length) {
      await pool.query(
        'INSERT INTO company_users (company_id, email, password_hash) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING',
        [c.id, email, await bcrypt.hash(password, 10)]
      );
      console.log(`  → login created: ${email} / ${password}`);
    } else {
      console.log('  → login already exists, left alone');
    }

    for (const key of OPTIONAL_KEYS) {
      await pool.query(
        `INSERT INTO furniture_flags (company_id, flag_key, enabled, updated_at)
         VALUES ($1,$2,true, now())
         ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=true, updated_at=now()`,
        [c.id, key]
      );
    }
    console.log(`  → ${OPTIONAL_KEYS.length} sections on`);

    await pool.query(
      `INSERT INTO furniture_settings (company_id, business_name, address, phone, whatsapp, currency, tax_percent, updated_at)
       VALUES ($1,$2,$3,$4,$5,'EGP',14, now())
       ON CONFLICT (company_id) DO UPDATE SET
         business_name=EXCLUDED.business_name, address=EXCLUDED.address,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, updated_at=now()`,
      [c.id, 'موبيليا الأمانة', '٥ ش العادلي، أسيوط', '0882000000', '201000000000']
    );
    console.log('  → settings saved');

    if (!noSeed) await seed(pool, c.id);

    console.log(`\nOpen /furniture after signing in at /company/login as ${email}`);
  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Idempotent: re-running must not create a second copy of every row, so each
// insert is skipped when a record of the same name is already there.
async function seed(pool, cid) {
  const once = async (table, name, sql, params) => {
    const hit = await pool.query(`SELECT 1 FROM ${table} WHERE company_id=$1 AND name=$2`, [cid, name]);
    if (hit.rows.length) return false;
    await pool.query(sql, params);
    return true;
  };
  let n = 0;
  for (const [name, phone, address] of SEED.suppliers) {
    if (await once('furniture_suppliers', name,
      'INSERT INTO furniture_suppliers (company_id,name,phone,address) VALUES ($1,$2,$3,$4)', [cid, name, phone, address])) n++;
  }
  for (const [name, phone, address] of SEED.customers) {
    if (await once('furniture_customers', name,
      'INSERT INTO furniture_customers (company_id,name,phone,address) VALUES ($1,$2,$3,$4)', [cid, name, phone, address])) n++;
  }
  for (const [name, unit, qty, min, price] of SEED.materials) {
    if (await once('furniture_materials', name,
      `INSERT INTO furniture_materials (company_id,name,unit,qty,min_qty,last_purchase_price,avg_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$6)`, [cid, name, unit, qty, min, price])) n++;
  }
  for (const [name, job, payType, rate] of SEED.workers) {
    if (await once('furniture_workers', name,
      'INSERT INTO furniture_workers (company_id,name,job_title,pay_type,pay_rate) VALUES ($1,$2,$3,$4,$5)',
      [cid, name, job, payType, rate])) n++;
  }
  for (const [name, cat, price, cost] of SEED.products) {
    if (await once('furniture_products', name,
      'INSERT INTO furniture_products (company_id,name,category,selling_price,estimated_cost) VALUES ($1,$2,$3,$4,$5)',
      [cid, name, cat, price, cost])) n++;
  }
  console.log(`  → seeded ${n} new record(s) (existing ones left alone)`);
}

main();
