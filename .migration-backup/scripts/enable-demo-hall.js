#!/usr/bin/env node
/**
 * Set up a demo wedding hall so the whole system can be seen in one place.
 *
 * This exists because the home page links to https://hall.oscardevs.com as a
 * live demo, and until now nothing in the repository created that tenant — it
 * was made by hand during development, which means it could not be rebuilt on a
 * fresh database and the demo link would have been dead.
 *
 * The seed shows the two things the product is sold on: a calendar with real
 * bookings on it, and an enquiry list where somebody is overdue a call.
 *
 *   node scripts/enable-demo-hall.js
 *   node scripts/enable-demo-hall.js --slug=demo-hall
 *   node scripts/enable-demo-hall.js --password=...
 *   node scripts/enable-demo-hall.js --dry-run
 *   node scripts/enable-demo-hall.js --no-seed
 */
'use strict';
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { OPTIONAL_KEYS } = require('../src/hall/flags');

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const dryRun = process.argv.includes('--dry-run');
const noSeed = process.argv.includes('--no-seed');
// slug === page_type like every other demo: tenant.js and the sitemap both skip
// exactly that slug, so a demo can never reach the index.
const slug = arg('slug', 'hall');
const email = arg('email', 'hall@demo.oscardevs.com');
// No default — a literal here would be a working login in a public repository.
const password = arg('password', process.env.DEMO_PASSWORD || '');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Everything below is invented. A demo tenant is public: no real customer,
// family or phone number ever goes in one.
const SETTINGS = {
  business_name: 'قاعة الياسمين للأفراح والمناسبات',
  address: 'طريق الوليدية، أسيوط',
  phone: '01000000000',
  whatsapp: '201000000000',
  about: 'قاعة أفراح ومناسبات في أسيوط تستوعب من ١٥٠ لـ ٥٠٠ فرد. بنشتغل فترتين '
    + 'في اليوم، وبنقولك على طول لو تاريخك متاح ولا لأ. السعر معلن: سعر أساسي '
    + 'للقاعة زائد سعر للفرد، والباقات مكتوبة بكل اللي داخل فيها. العربون بيحجز '
    + 'التاريخ، والباقي بيتقسّط ويستحق كله قبل يوم المناسبة.',
  capacity_min: 150,
  capacity_max: 500,
  base_price: 18000,
  price_per_head: 180,
  deposit_percent: 25,
};

const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

async function main() {
  const client = await pool.connect();
  try {
    let c = (await client.query('SELECT * FROM companies WHERE slug=$1', [slug])).rows[0];
    if (!c) {
      if (dryRun) { console.log('would create company', slug); return; }
      c = (await client.query(
        `INSERT INTO companies (slug, company_name, description, page_type, is_active)
         VALUES ($1,$2,$3,'hall',true) RETURNING *`,
        [slug, SETTINGS.business_name, SETTINGS.about]
      )).rows[0];
      console.log('created company', slug);
    } else if (c.page_type !== 'hall') {
      await client.query("UPDATE companies SET page_type='hall' WHERE id=$1", [c.id]);
      console.log('switched', slug, 'to page_type=hall');
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
      `INSERT INTO hall_settings
         (company_id, business_name, address, phone, whatsapp, about,
          capacity_min, capacity_max, base_price, price_per_head, deposit_percent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (company_id) DO UPDATE SET
         business_name=EXCLUDED.business_name, address=EXCLUDED.address,
         phone=EXCLUDED.phone, whatsapp=EXCLUDED.whatsapp, about=EXCLUDED.about,
         capacity_min=EXCLUDED.capacity_min, capacity_max=EXCLUDED.capacity_max,
         base_price=EXCLUDED.base_price, price_per_head=EXCLUDED.price_per_head,
         deposit_percent=EXCLUDED.deposit_percent`,
      [cid, SETTINGS.business_name, SETTINGS.address, SETTINGS.phone, SETTINGS.whatsapp,
       SETTINGS.about, SETTINGS.capacity_min, SETTINGS.capacity_max,
       SETTINGS.base_price, SETTINGS.price_per_head, SETTINGS.deposit_percent]
    );

    for (const key of OPTIONAL_KEYS) {
      await client.query(
        `INSERT INTO hall_flags (company_id, flag_key, enabled) VALUES ($1,$2,true)
         ON CONFLICT (company_id, flag_key) DO UPDATE SET enabled=true`, [cid, key]);
    }
    console.log('settings + all', OPTIONAL_KEYS.length, 'sections enabled');

    if (noSeed) { console.log('--no-seed: skipping sample data'); return; }

    const already = (await client.query(
      'SELECT COUNT(*)::int n FROM hall_bookings WHERE company_id=$1', [cid])).rows[0].n;
    if (already) { console.log('sample data already present — left alone'); return; }

    const venues = {};
    for (const [name, capacity, note] of [
      ['القاعة الكبيرة', 500, 'الدور الأرضي، مدخل مستقل'],
      ['القاعة الصغيرة', 180, 'للخطوبة وأعياد الميلاد'],
    ]) {
      venues[name] = (await client.query(
        'INSERT INTO hall_venues (company_id, name, capacity, note) VALUES ($1,$2,$3,$4) RETURNING id',
        [cid, name, capacity, note])).rows[0].id;
    }

    for (const [name, desc, base, perHead, minGuests, includes, order] of [
      ['الباقة الأساسية', 'القاعة والصوت والإضاءة', 18000, 180, 150,
        'القاعة ٥ ساعات\nنظام صوت وإضاءة\nتنسيق ورد بسيط\nمشروبات ترحيبية', 1],
      ['الباقة الفضية', 'الأساسية زائد بوفيه مفتوح', 25000, 260, 200,
        'كل اللي في الأساسية\nبوفيه مفتوح\nتنسيق ورد كامل\nكوشة', 2],
      ['الباقة الذهبية', 'كل حاجة، ومعاها التصوير', 38000, 340, 250,
        'كل اللي في الفضية\nتصوير فوتو وفيديو\nدي جي\nسيارة زفة', 3],
    ]) {
      await client.query(
        `INSERT INTO hall_packages (company_id, name, description, base_price, price_per_head,
                                    min_guests, includes, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [cid, name, desc, base, perHead, minGuests, includes, order]);
    }

    // Bookings across the next two months, on both spaces and both slots — so
    // the calendar looks like a working hall rather than a blank grid.
    const BOOKINGS = [
      ['أسرة عبد الرحمن', '01000000001', 21, 'evening', 'القاعة الكبيرة', 'فرح', 320, 'confirmed', 25000, 260],
      ['أسرة سليم', '01000000002', 21, 'afternoon', 'القاعة الصغيرة', 'خطوبة', 120, 'confirmed', 18000, 180],
      ['أسرة منصور', '01000000003', 34, 'full', 'القاعة الكبيرة', 'فرح', 420, 'confirmed', 38000, 340],
      ['أسرة الشرقاوي', '01000000004', 47, 'evening', 'القاعة الكبيرة', 'فرح', 280, 'held', 25000, 260],
      ['شركة النيل', '01000000005', 12, 'afternoon', 'القاعة الصغيرة', 'حفل تخرّج', 150, 'confirmed', 18000, 180],
      ['أسرة فهمي', '01000000006', -18, 'evening', 'القاعة الكبيرة', 'فرح', 300, 'done', 25000, 260],
    ];
    for (const [name, phone, offset, slot, venue, type, guests, status, base, perHead] of BOOKINGS) {
      const b = (await client.query(
        `INSERT INTO hall_bookings (company_id, venue_id, customer_name, phone, whatsapp,
            event_date, slot, event_type, guests, base_price, price_per_head, status, hold_until)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [cid, venues[venue], name, phone, day(offset), slot, type, guests, base, perHead,
         status, status === 'held' ? day(7) : null])).rows[0];
      // A confirmed booking has its deposit in; the held one is exactly what a
      // hall is waiting for, so it deliberately has nothing paid against it.
      if (status !== 'held') {
        const total = base + guests * perHead;
        await client.query(
          `INSERT INTO hall_payments (company_id, booking_id, amount, kind, method, paid_at)
           VALUES ($1,$2,$3,'deposit','cash', now() - interval '20 days')`,
          [cid, b.id, Math.round(total * 0.25)]);
        if (status === 'done') {
          await client.query(
            `INSERT INTO hall_payments (company_id, booking_id, amount, kind, method, paid_at)
             VALUES ($1,$2,$3,'final','cash', now() - interval '19 days')`,
            [cid, b.id, total - Math.round(total * 0.25)]);
        }
      }
    }

    // The enquiry list is where the money is won or lost, so it gets a spread:
    // one overdue, one due today, one already lost with a reason.
    const ENQUIRIES = [
      ['نورهان مصطفى', '01000000011', 60, 'فرح', 350, 90000, 'new', -3],
      ['أحمد لبيب', '01000000012', 90, 'فرح', 250, 70000, 'contacted', 0],
      ['أسرة الحديدي', '01000000013', 45, 'خطوبة', 140, 30000, 'viewing_booked', 1],
      ['محمد عز', '01000000014', 120, 'فرح', 400, 120000, 'quoted', 2],
      ['سلمى راضي', '01000000015', 30, 'عيد ميلاد', 80, 15000, 'lost', null],
    ];
    for (const [name, phone, dayOff, type, guests, budget, status, next] of ENQUIRIES) {
      await client.query(
        `INSERT INTO hall_enquiries (company_id, name, phone, whatsapp, event_date, event_type,
                                     guests, budget, city, status, next_action_on, lost_reason)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$7,'أسيوط',$8,$9,$10)`,
        [cid, name, phone, day(dayOff), type, guests, budget, status,
         next === null ? null : day(next),
         status === 'lost' ? 'الميزانية أقل من أقل باقة' : null]);
    }

    console.log('seeded 2 venues, 3 packages, 6 bookings with deposits, 5 enquiries');
    console.log('\ndone — sign in at /company/login as ' + email);
    console.log('then open /hall, and the public page at https://' + slug + '.oscardevs.com');
  } catch (e) {
    console.error('[enable-demo-hall]', e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
