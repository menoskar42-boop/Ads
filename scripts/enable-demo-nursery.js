#!/usr/bin/env node
/**
 * Set up a demo nursery so the whole system can be seen in one place.
 *
 * The seed is chosen to show the product's one real argument rather than to
 * look tidy: some families are paid up, some are one month behind and one is
 * three months behind. An empty arrears list would demo beautifully and sell
 * nothing.
 *
 *   node scripts/enable-demo-nursery.js
 *   node scripts/enable-demo-nursery.js --slug=demo-nursery
 *   node scripts/enable-demo-nursery.js --password=...
 *   node scripts/enable-demo-nursery.js --dry-run
 *   node scripts/enable-demo-nursery.js --no-seed
 */
'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { OPTIONAL_KEYS } = require('../src/nursery/flags');
const F = require('../src/nursery/fees');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const noSeed = process.argv.includes('--no-seed');
// slug === page_type like every other demo: tenant.js and the sitemap both skip
// exactly that slug, so a demo can never reach the index.
const slug = arg('slug', 'nursery');
const email = arg('email', 'nursery@demo.oscardevs.com');
// No default — a literal here would be a working login in a public repository.
const password = arg('password', process.env.DEMO_PASSWORD || '');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Everything below is invented. A demo tenant is public: no real child, parent
// or phone number ever goes in one.
const SETTINGS = {
  business_name: 'حضانة براعم الغد',
  kind: 'nursery',
  address: 'شارع النميس، أسيوط',
  phone: '01000000000',
  whatsapp: '201000000000',
  about: 'حضانة أطفال في أسيوط من سنة ونص لـ ٥ سنين. بنستقبل من ٨ الصبح لـ ٣ العصر، '
    + 'وبنبعت لولي الأمر خبر يومي عن أكل الطفل ونومه ومزاجه. عندنا كشف بمين مصرّح له '
    + 'يستلم كل طفل بالاسم والرقم القومي، ومحدش غيرهم بيستلم. المصاريف بتتحسب شهر بشهر '
    + 'وبيوصلك كشف حسابك أول كل شهر.',
  age_from: 1,
  age_to: 5,
  open_from: '٨ ص',
  open_to: '٣ م',
  default_fee: 900,
  due_day: 5,
};

async function main() {
  const client = await pool.connect();
  try {
    let c = (await client.query('SELECT * FROM companies WHERE slug=$1', [slug])).rows[0];
    if (!c) {
      if (dryRun) { console.log('would create company', slug); return; }
      c = (await client.query(
        `INSERT INTO companies (slug, company_name, description, page_type, is_active)
         VALUES ($1,$2,$3,'nursery',true) RETURNING *`,
        [slug, SETTINGS.business_name, SETTINGS.about]
      )).rows[0];
      console.log('created company', slug);
    } else if (c.page_type !== 'nursery') {
      await client.query("UPDATE companies SET page_type='nursery' WHERE id=$1", [c.id]);
      console.log('switched', slug, 'to page_type=nursery');
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
      `INSERT INTO nursery_settings
         (company_id, business_name, kind, address, phone, whatsapp, about,
          age_from, age_to, open_from, open_to, default_fee, due_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (company_id) DO UPDATE SET
         business_name=EXCLUDED.business_name, kind=EXCLUDED.kind, address=EXCLUDED.address,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, about=EXCLUDED.about,
         age_from=EXCLUDED.age_from, age_to=EXCLUDED.age_to, open_from=EXCLUDED.open_from,
         open_to=EXCLUDED.open_to, default_fee=EXCLUDED.default_fee, due_day=EXCLUDED.due_day`,
      [cid, SETTINGS.business_name, SETTINGS.kind, SETTINGS.address, SETTINGS.phone,
       SETTINGS.whatsapp, SETTINGS.about, SETTINGS.age_from, SETTINGS.age_to,
       SETTINGS.open_from, SETTINGS.open_to, SETTINGS.default_fee, SETTINGS.due_day]
    );

    for (const key of OPTIONAL_KEYS) {
      await client.query(
        `INSERT INTO nursery_flags (company_id, flag_key, enabled) VALUES ($1,$2,true)
         ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=true`, [cid, key]);
    }
    console.log('settings + all', OPTIONAL_KEYS.length, 'sections enabled');

    if (noSeed) { console.log('--no-seed: skipping sample data'); return; }

    const already = (await client.query(
      'SELECT COUNT(*)::int n FROM nursery_children WHERE company_id=$1', [cid])).rows[0].n;
    if (already) { console.log('sample data already present — left alone'); return; }

    const groups = {};
    for (const [name, teacher, schedule, capacity, fee, order] of [
      ['تمهيدي (KG1)', 'أ. سماح', '٨ ص – ٣ م', 20, 900, 1],
      ['روضة (KG2)', 'أ. هدى', '٨ ص – ٣ م', 20, 1000, 2],
      ['حضانة صغار', 'أ. منى', '٨ ص – ١ م', 12, 800, 3],
    ]) {
      groups[name] = (await client.query(
        `INSERT INTO nursery_groups (company_id, name, teacher, schedule, capacity, monthly_fee, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [cid, name, teacher, schedule, capacity, fee, order])).rows[0].id;
    }

    for (const [name, role, phone] of [
      ['سماح عبد الرحمن', 'مدرّسة تمهيدي', '01000000010'],
      ['هدى مصطفى', 'مدرّسة روضة', '01000000011'],
      ['منى فؤاد', 'مشرفة الصغار', '01000000012'],
      ['أم سعاد', 'مساعدة', '01000000013'],
    ]) {
      await client.query('INSERT INTO nursery_staff (company_id, name, role, phone) VALUES ($1,$2,$3,$4)',
        [cid, name, role, phone]);
    }

    // Each family: guardian, child, and how many months they are behind. The
    // spread is the point — a demo where everybody has paid shows nothing.
    const FAMILIES = [
      { g: 'أحمد سيد', rel: 'الأب', phone: '01000000001', child: 'يوسف أحمد',
        born: '2021-04-12', group: 'تمهيدي (KG1)', behind: 0, allergies: null },
      { g: 'منى عبد الله', rel: 'الأم', phone: '01000000002', child: 'ليلى محمود',
        born: '2020-09-03', group: 'روضة (KG2)', behind: 1, allergies: 'حساسية من الفول السوداني' },
      { g: 'خالد فتحي', rel: 'الأب', phone: '01000000003', child: 'مالك خالد',
        born: '2021-11-20', group: 'تمهيدي (KG1)', behind: 3, allergies: null },
      { g: 'سارة عصام', rel: 'الأم', phone: '01000000004', child: 'جنى عصام',
        born: '2023-02-18', group: 'حضانة صغار', behind: 0, allergies: 'حساسية لبن البقر' },
      { g: 'محمود رشدي', rel: 'الأب', phone: '01000000005', child: 'عمر محمود',
        born: '2020-06-30', group: 'روضة (KG2)', behind: 2, allergies: null },
      { g: 'هبة السيد', rel: 'الأم', phone: '01000000006', child: 'حبيبة طارق',
        born: '2022-01-09', group: 'تمهيدي (KG1)', behind: 0, allergies: null },
    ];

    const thisPeriod = F.periodKey(new Date());
    // Six months of history, so the summary screen has a curve rather than a dot.
    const PERIODS = [];
    for (let i = 5; i >= 0; i -= 1) PERIODS.push(F.shiftPeriod(thisPeriod, -i));

    const childIds = [];
    for (const f of FAMILIES) {
      const gid = (await client.query(
        `INSERT INTO nursery_guardians (company_id, name, relation, phone, whatsapp)
         VALUES ($1,$2,$3,$4,$4) RETURNING id`,
        [cid, f.g, f.rel, f.phone])).rows[0].id;
      const kid = (await client.query(
        `INSERT INTO nursery_children (company_id, guardian_id, group_id, name, birth_date,
                                       enrolled_on, allergies, emergency_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [cid, gid, groups[f.group], f.child, f.born,
         F.periodRange(PERIODS[0]).from, f.allergies, f.phone])).rows[0].id;
      childIds.push({ id: kid, f });

      await client.query(
        `INSERT INTO nursery_pickups (company_id, child_id, name, relation, phone)
         VALUES ($1,$2,$3,'الجدة','01000000009')`, [cid, kid, 'نادية حسن']);

      const fee = Number((await client.query(
        'SELECT monthly_fee FROM nursery_groups WHERE id=$1', [groups[f.group]])).rows[0].monthly_fee);

      for (const p of PERIODS) {
        await client.query(
          `INSERT INTO nursery_invoices (company_id, child_id, period, amount, due_on, kind)
           VALUES ($1,$2,$3,$4,$5,'monthly') ON CONFLICT DO NOTHING`,
          [cid, kid, p, fee, F.dueDateFor(p, SETTINGS.due_day)]);
      }
      // Pay everything except the last `behind` months — FIFO does the rest.
      const paidMonths = PERIODS.length - f.behind;
      for (let i = 0; i < paidMonths; i += 1) {
        await client.query(
          `INSERT INTO nursery_payments (company_id, child_id, amount, method, paid_at)
           VALUES ($1,$2,$3,'cash',$4)`,
          [cid, kid, fee, F.dueDateFor(PERIODS[i], SETTINGS.due_day)]);
      }
    }

    // Yesterday's roll call: mostly in, one away — so the "check on the child"
    // button on the dashboard has something to point at.
    for (let i = 0; i < childIds.length; i += 1) {
      const status = i === 2 ? 'absent' : (i === 4 ? 'late' : 'present');
      await client.query(
        `INSERT INTO nursery_attendance (company_id, child_id, day, status, in_at)
         VALUES ($1,$2,CURRENT_DATE,$3, CASE WHEN $3='absent' THEN NULL ELSE now() END)
         ON CONFLICT (company_id, child_id, day) DO NOTHING`,
        [cid, childIds[i].id, status]);
      if (status !== 'absent') {
        await client.query(
          `INSERT INTO nursery_day_reports (company_id, child_id, day, mood, ate, slept)
           VALUES ($1,$2,CURRENT_DATE,$3,$4,$5)`,
          [cid, childIds[i].id, i % 2 ? 'هادي' : 'مبسوط', i % 3 ? 'كل كويس' : 'كل نص',
           i % 2 ? 'نام كويس' : 'نام شوية']);
      }
    }

    await client.query(
      `INSERT INTO nursery_enquiries (company_id, name, phone, whatsapp, child_name, child_age, note, next_action_on)
       VALUES ($1,'ولاء حسين','01000000007','01000000007','آدم','سنتين','بسأل عن الأماكن المتاحة في التمهيدي', CURRENT_DATE),
              ($1,'كريم عادل','01000000008','01000000008','تالة','٤ سنين','عايز أعرف المصاريف والمواعيد', CURRENT_DATE)`,
      [cid]);

    console.log('seeded 3 groups, 4 staff, 6 families with 6 months of fees, today\'s roll call, 2 enquiries');
    console.log('\ndone — sign in at /company/login as ' + email);
    console.log('then open /nursery, and the public page at https://' + slug + '.oscardevs.com');
  } catch (e) {
    console.error('[enable-demo-nursery]', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
