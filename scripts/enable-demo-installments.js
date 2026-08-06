#!/usr/bin/env node
/**
 * Set up a demo قسّطلي shop so the whole system can be seen in one place.
 *
 * The seed is built to show the argument, not to look tidy: one customer is
 * paid up, one is a month behind, one is three months behind and has a
 * guarantor, and one has already finished. A demo where everybody has paid
 * demonstrates nothing.
 *
 *   node scripts/enable-demo-installments.js
 *   node scripts/enable-demo-installments.js --slug=demo-qastly
 *   node scripts/enable-demo-installments.js --password=...
 *   node scripts/enable-demo-installments.js --dry-run
 *   node scripts/enable-demo-installments.js --no-seed
 */
'use strict';
const { Pool } = require('pg');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { OPTIONAL_KEYS } = require('../src/installments/flags');
const P = require('../src/installments/plan');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const noSeed = process.argv.includes('--no-seed');
// slug === page_type like every other demo, so tenant.js and the sitemap both
// skip it and a demo can never reach the index.
const slug = arg('slug', 'installments');
const email = arg('email', 'qastly@demo.oscardevs.com');
// No default — a literal here would be a working login in a public repository.
const password = arg('password', process.env.DEMO_PASSWORD || '');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Everything below is invented. A demo tenant is public: no real customer,
// national id or phone number ever goes in one.
const SETTINGS = {
  business_name: 'معرض الأمل للأجهزة الكهربائية',
  activity: 'أجهزة كهربائية ومنزلية',
  address: 'شارع الجمهورية، أسيوط',
  phone: '01000000000',
  whatsapp: '201000000000',
  about: 'معرض أجهزة كهربائية ومنزلية في أسيوط، بنبيع كاش وبالتقسيط. التقسيط عندنا '
    + 'بجدول مكتوب: بتعرف كل قسط بتاريخه ومبلغه من أول يوم، وبيوصلك لينك كشف حسابك '
    + 'تفتحه أي وقت تشوف دفعت كام وباقي عليك كام. وبنفكّرك قبل كل قسط بيومين عشان '
    + 'الميعاد ما يعديش وإنت مش واخد بالك.',
  remind_before: 2,
  grace_days: 0,
};

const CUSTOMERS = [
  { name: 'محمود عبد الفتاح', phone: '01000000001', job: 'موظف',
    guarantor: ['سيد عبد الفتاح', '01000000021'],
    item: 'تلاجة ١٦ قدم', total: 24000, down: 6000, count: 6, startMonths: -5, paid: 6 },
  { name: 'إيمان صابر', phone: '01000000002', job: 'مدرّسة',
    guarantor: ['صابر إبراهيم', '01000000022'],
    item: 'غسّالة أوتوماتيك', total: 15000, down: 3000, count: 6, startMonths: -4, paid: 4 },
  { name: 'كريم لطفي', phone: '01000000003', job: 'سائق',
    guarantor: ['لطفي كامل', '01000000023'],
    item: 'تكييف ١.٥ حصان', total: 21000, down: 3000, count: 8, startMonths: -5, paid: 3 },
  { name: 'داليا حسن', phone: '01000000004', job: 'محاسبة',
    guarantor: null,
    item: 'بوتاجاز ٥ شعلة', total: 9000, down: 2000, count: 4, startMonths: -1, paid: 1 },
  { name: 'أشرف زكي', phone: '01000000005', job: 'صاحب محل',
    guarantor: ['زكي أشرف', '01000000025'],
    item: 'شاشة ٥٥ بوصة', total: 18000, down: 4000, count: 5, startMonths: -2, paid: 2 },
];

async function main() {
  const client = await pool.connect();
  try {
    let c = (await client.query('SELECT * FROM companies WHERE slug=$1', [slug])).rows[0];
    if (!c) {
      if (dryRun) { console.log('would create company', slug); return; }
      c = (await client.query(
        `INSERT INTO companies (slug, company_name, description, page_type, is_active)
         VALUES ($1,$2,$3,'installments',true) RETURNING *`,
        [slug, SETTINGS.business_name, SETTINGS.about]
      )).rows[0];
      console.log('created company', slug);
    } else if (c.page_type !== 'installments') {
      await client.query("UPDATE companies SET page_type='installments' WHERE id=$1", [c.id]);
      console.log('switched', slug, 'to page_type=installments');
    }
    const cid = c.id;
    if (dryRun) { console.log('dry run — nothing else written'); return; }

    const hash = password ? await bcrypt.hash(password, 10) : null;
    if (hash) await client.query(
      `INSERT INTO company_users (company_id, email, password_hash) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
      [cid, email, hash]
    );

    await client.query(
      `INSERT INTO inst_settings (company_id, business_name, activity, address, phone,
                                  whatsapp, about, remind_before, grace_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (company_id) DO UPDATE SET
         business_name=EXCLUDED.business_name, activity=EXCLUDED.activity,
         address=EXCLUDED.address, phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp,
         about=EXCLUDED.about, remind_before=EXCLUDED.remind_before,
         grace_days=EXCLUDED.grace_days`,
      [cid, SETTINGS.business_name, SETTINGS.activity, SETTINGS.address, SETTINGS.phone,
       SETTINGS.whatsapp, SETTINGS.about, SETTINGS.remind_before, SETTINGS.grace_days]
    );

    for (const key of OPTIONAL_KEYS) {
      await client.query(
        `INSERT INTO inst_flags (company_id, flag_key, enabled) VALUES ($1,$2,true)
         ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=true`, [cid, key]);
    }
    console.log('settings + all', OPTIONAL_KEYS.length, 'sections enabled');

    if (noSeed) { console.log('--no-seed: skipping sample data'); return; }

    const already = (await client.query(
      'SELECT COUNT(*)::int n FROM inst_plans WHERE company_id=$1', [cid])).rows[0].n;
    if (already) { console.log('sample data already present — left alone'); return; }

    const today = P.ymd(new Date());
    for (const f of CUSTOMERS) {
      const cust = (await client.query(
        `INSERT INTO inst_customers (company_id, name, phone, whatsapp, job,
                                     guarantor_name, guarantor_phone)
         VALUES ($1,$2,$3,$3,$4,$5,$6) RETURNING id`,
        [cid, f.name, f.phone, f.job,
         f.guarantor ? f.guarantor[0] : null, f.guarantor ? f.guarantor[1] : null])).rows[0].id;

      const startOn = P.addMonths(today, f.startMonths);
      const sched = P.buildSchedule({
        total: f.total, down: f.down, count: f.count, startOn, interval: 'monthly',
      });
      // Everything is fully paid off only when the schedule is; otherwise the
      // plan stays active and the arrears screens have something to show.
      const willSettle = f.paid >= f.count;
      const plan = (await client.query(
        `INSERT INTO inst_plans (company_id, customer_id, item, total, down_payment, count,
                                 interval, start_on, token, status)
         VALUES ($1,$2,$3,$4,$5,$6,'monthly',$7,$8,$9) RETURNING id`,
        [cid, cust, f.item, f.total, sched.down, sched.rows.length, sched.startOn,
         crypto.randomBytes(16).toString('hex'), willSettle ? 'completed' : 'active'])).rows[0].id;

      for (const r of sched.rows) {
        await client.query(
          'INSERT INTO inst_items (company_id, plan_id, seq, amount, due_on) VALUES ($1,$2,$3,$4,$5)',
          [cid, plan, r.seq, r.amount, r.due_on]);
      }
      // The down payment is money that changed hands, so it is a payment.
      if (sched.down > 0) {
        await client.query(
          `INSERT INTO inst_payments (company_id, plan_id, amount, method, note, paid_at)
           VALUES ($1,$2,$3,'cash','مقدّم',$4)`, [cid, plan, sched.down, sched.startOn]);
      }
      for (let i = 0; i < Math.min(f.paid, sched.rows.length); i += 1) {
        await client.query(
          `INSERT INTO inst_payments (company_id, plan_id, amount, method, paid_at)
           VALUES ($1,$2,$3,'cash',$4)`,
          [cid, plan, sched.rows[i].amount, sched.rows[i].due_on]);
      }
    }

    console.log('seeded', CUSTOMERS.length, 'customers with plans, schedules and payments');
    console.log('\ndone — sign in at /company/login as ' + email);
    console.log('then open /qastly, and the public page at https://' + slug + '.oscardevs.com');
  } catch (e) {
    console.error('[enable-demo-installments]', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
