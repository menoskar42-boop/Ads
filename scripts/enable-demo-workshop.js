#!/usr/bin/env node
/**
 * Set up a demo car workshop so the whole system can be seen in one place.
 *
 * Creates the company if missing, switches every section on, fills in the
 * settings, and seeds a little data — a technician, some parts, two vehicles
 * and a finished job — so the screens show what they look like in use rather
 * than eight empty tables.
 *
 *   node scripts/enable-demo-workshop.js
 *   node scripts/enable-demo-workshop.js --slug=demo-wsh
 *   node scripts/enable-demo-workshop.js --password=...
 *   node scripts/enable-demo-workshop.js --dry-run
 *   node scripts/enable-demo-workshop.js --no-seed
 */
'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { OPTIONAL_KEYS } = require('../src/workshop/flags');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const noSeed = process.argv.includes('--no-seed');
// slug === page_type, matching every other back-office demo: that is the URL
// the home page's "live demo" link points at, and both tenant.js and the
// sitemap skip exactly that slug so a demo never reaches the index.
const slug = arg('slug', 'workshop');
const email = arg('email', 'workshop@demo.oscardevs.com');
// No default. A literal here would be a working login published in a
// public repository — exactly how the four vertical demos ended up with
// admin panels anybody could sign into.
const password = arg('password', process.env.DEMO_PASSWORD || '');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Everything here is invented. A demo tenant is public — no real customer,
// vehicle or phone number ever goes in one.
const SETTINGS = {
  business_name: 'ورشة الأمانة لصيانة السيارات',
  address: 'شارع الجمهورية، أسيوط',
  phone: '01000000000',
  whatsapp: '201000000000',
  hours: 'السبت–الخميس ٩ص–٨م',
  about: 'ورشة صيانة وإصلاح سيارات في أسيوط. بنستلم العربية بأمر شغل مكتوب فيه '
    + 'شكوتك بالحرف، وبنقولك التكلفة قبل ما نبدأ، وبنسلّم بضمان بيبدأ يوم ما '
    + 'تستلم العربية. وبنفكّرك بميعاد الصيانة الجاية بالكيلومترات وبالشهور.',
  labour_rate: 120,
  service_km: 5000,
  service_months: 6,
  tax_percent: 0,
};

async function main() {
  const client = await pool.connect();
  try {
    let c = (await client.query('SELECT * FROM companies WHERE slug=$1', [slug])).rows[0];
    if (!c) {
      if (dryRun) { console.log('would create company', slug); return; }
      c = (await client.query(
        `INSERT INTO companies (slug, company_name, description, page_type, is_active)
         VALUES ($1,$2,$3,'workshop',true) RETURNING *`,
        [slug, SETTINGS.business_name, SETTINGS.about]
      )).rows[0];
      console.log('created company', slug);
    } else if (c.page_type !== 'workshop') {
      await client.query("UPDATE companies SET page_type='workshop' WHERE id=$1", [c.id]);
      console.log('switched', slug, 'to page_type=workshop');
    }
    const cid = c.id;
    if (dryRun) { console.log('dry run — nothing else written'); return; }

    // With no password supplied, the demo tenant is still created — it just
    // has no login. A demo nobody can sign into is a small loss; a demo
    // everybody can sign into is not.
    const hash = password ? await bcrypt.hash(password, 10) : null;
    if (hash) await client.query(
      `INSERT INTO company_users (company_id, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
      [cid, email, hash]
    );

    await client.query(
      `INSERT INTO workshop_settings
         (company_id, business_name, address, phone, whatsapp, hours, about,
          labour_rate, service_km, service_months, tax_percent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (company_id) DO UPDATE SET
         business_name=EXCLUDED.business_name, address=EXCLUDED.address,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, hours=EXCLUDED.hours,
         about=EXCLUDED.about, labour_rate=EXCLUDED.labour_rate,
         service_km=EXCLUDED.service_km, service_months=EXCLUDED.service_months,
         tax_percent=EXCLUDED.tax_percent`,
      [cid, SETTINGS.business_name, SETTINGS.address, SETTINGS.phone, SETTINGS.whatsapp,
       SETTINGS.hours, SETTINGS.about, SETTINGS.labour_rate, SETTINGS.service_km,
       SETTINGS.service_months, SETTINGS.tax_percent]
    );

    // Every optional section on, so the demo shows the whole product.
    for (const key of OPTIONAL_KEYS) {
      await client.query(
        `INSERT INTO workshop_flags (company_id, flag_key, enabled) VALUES ($1,$2,true)
         ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=true`, [cid, key]);
    }
    console.log('settings + all', OPTIONAL_KEYS.length, 'sections enabled');

    if (noSeed) { console.log('--no-seed: skipping sample data'); return; }

    const already = (await client.query(
      'SELECT COUNT(*)::int n FROM workshop_vehicles WHERE company_id=$1', [cid])).rows[0].n;
    if (already) { console.log('sample data already present — left alone'); return; }

    const tech = (await client.query(
      `INSERT INTO workshop_technicians (company_id, name, speciality, pay_type, pay_rate)
       VALUES ($1,'أسطى محمود','ميكانيكا ومحركات','daily',450) RETURNING id`, [cid])).rows[0];
    await client.query(
      `INSERT INTO workshop_technicians (company_id, name, speciality, pay_type, commission_pct)
       VALUES ($1,'أسطى عادل','كهربا وتشخيص كمبيوتر','job',30)`, [cid]);

    const parts = [
      ['فلتر زيت', 'OF-2200', 'هيونداي إلنترا / أكسنت', 24, 5, 110, 175],
      ['فلتر هواء', 'AF-1180', 'معظم الموديلات اليابانية', 16, 4, 95, 160],
      ['تيل فرامل أمامي', 'BP-4410', 'كيا سيراتو', 6, 4, 620, 940],
      ['بوجيهات (طقم)', 'SP-0904', 'أربع سلندر', 9, 3, 380, 590],
      ['زيت محرك 5W-30 (4 لتر)', 'OL-5304', 'بنزين', 12, 6, 720, 1050],
    ];
    for (const [name, pn, fits, qty, min, cost, price] of parts) {
      await client.query(
        `INSERT INTO workshop_parts (company_id, name, part_number, fits, qty, min_qty, avg_cost, sell_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [cid, name, pn, fits, qty, min, cost, price]);
    }

    const cust = (await client.query(
      `INSERT INTO workshop_customers (company_id, name, phone, whatsapp)
       VALUES ($1,'محمد سيد','01000000001','201000000001') RETURNING id`, [cid])).rows[0];
    const cust2 = (await client.query(
      `INSERT INTO workshop_customers (company_id, name, phone)
       VALUES ($1,'شركة النيل للنقل','01000000002') RETURNING id`, [cid])).rows[0];

    const v1 = (await client.query(
      `INSERT INTO workshop_vehicles (company_id, customer_id, plate, make, model, model_year, colour, odometer, odometer_at)
       VALUES ($1,$2,'ر ن ص 4821','هيونداي','إلنترا',2019,'أبيض',68400, now()) RETURNING id`,
      [cid, cust.id])).rows[0];
    const v2 = (await client.query(
      `INSERT INTO workshop_vehicles (company_id, customer_id, plate, make, model, model_year, colour, odometer, odometer_at, service_km)
       VALUES ($1,$2,'ط ع ه 1195','تويوتا','هايس',2017,'أزرق',214000, now(), 8000) RETURNING id`,
      [cid, cust2.id])).rows[0];

    // One finished job, so the history, the invoice and the warranty screens
    // all have something real in them rather than an empty state.
    const job = (await client.query(
      `INSERT INTO workshop_jobs
         (company_id, vehicle_id, customer_id, technician_id, status, complaint, diagnosis,
          odometer_in, received_at, started_at, done_at, delivered_at, approved_at, approved_by,
          quote_total, warranty_months, paid)
       VALUES ($1,$2,$3,$4,'delivered','صوت من الفرامل الأمامية وأنا بفرمل',
         'تيل الفرامل الأمامي منتهي — اتغيّر وتم تنظيف الهوبات وفحص الديسك.',
         68400, now() - interval '9 days', now() - interval '9 days',
         now() - interval '8 days', now() - interval '8 days',
         now() - interval '9 days', 'محمد سيد', 1580, 3, 1580) RETURNING id`,
      [cid, v1.id, cust.id, tech.id])).rows[0];
    await client.query(
      `INSERT INTO workshop_job_parts (company_id, job_id, name, qty, unit_cost, unit_price)
       VALUES ($1,$2,'تيل فرامل أمامي',1,620,940)`, [cid, job.id]);
    await client.query(
      `INSERT INTO workshop_job_labour (company_id, job_id, technician_id, description, hours, rate, amount)
       VALUES ($1,$2,$3,'تغيير تيل الفرامل وتنظيف الهوبات',4,160,640)`, [cid, job.id, tech.id]);
    await client.query(
      `INSERT INTO workshop_payments (company_id, job_id, customer_id, amount, method, paid_at)
       VALUES ($1,$2,$3,1580,'cash', now() - interval '8 days')`, [cid, job.id, cust.id]);

    // A reminder already due, and one still ahead — so the reminders screen
    // shows both halves of what it is for.
    await client.query(
      `INSERT INTO workshop_reminders (company_id, vehicle_id, job_id, kind, due_on, due_odometer)
       VALUES ($1,$2,$3,'service', CURRENT_DATE - 4, 73400)`, [cid, v1.id, job.id]);
    await client.query(
      `INSERT INTO workshop_reminders (company_id, vehicle_id, kind, due_on, due_odometer)
       VALUES ($1,$2,'service', CURRENT_DATE + 26, 222000)`, [cid, v2.id]);

    await client.query(
      `INSERT INTO workshop_expenses (company_id, category, description, amount, spent_on)
       VALUES ($1,'إيجار','إيجار الورشة',6000, CURRENT_DATE - 5),
              ($1,'كهربا','فاتورة الكهربا',1450, CURRENT_DATE - 3)`, [cid]);

    console.log('seeded 2 technicians, 5 parts, 2 customers, 2 vehicles, 1 finished job, 2 reminders');
    console.log('\ndone — sign in at /company/login as ' + email);
    console.log('then open /workshop, and the public page at https://' + slug + '.oscardevs.com');
  } catch (e) {
    console.error('[enable-demo-workshop]', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
