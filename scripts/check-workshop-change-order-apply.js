#!/usr/bin/env node
/**
 * الموافقة على تعديل إضافى بتضيف بنوده لأمر الشغل والفاتورة — مرة واحدة بس.
 *
 * قبل ٢٠٢٦-١٠-٠٦ الموافقة كانت بتتسجّل وبس: العميل يوافق على «تيل فرامل ٤٠٠»
 * وإجمالى الأمر يفضل زى ما هو. الفحص ده:
 *   ١) قراءة: الموافقتين (العميل من الرابط + المدير من الأمر) بينادوا الإضافة جوّه المعاملة،
 *      واعتماد المدير من «بانتظار الموافقة» بس.
 *   ٢) لو فيه DATABASE_URL: سيناريو كامل على Postgres حقيقى جوّه معاملة بتترجع فى الآخر
 *      (مفيش بيانات بتفضل): أمر 1140 + تعديل 400 → 1596، والإضافة التانية مابتعملش حاجة.
 *
 *   node scripts/check-workshop-change-order-apply.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0;
const ok = (m, c, x) => { console.log(`${c ? '✅' : '❌'} ${m}${x ? ' — ' + x : ''}`); if (!c) fail++; };

const pub = read('src/routes/workshop_public.js');
const admin = read('src/routes/workshop_admin.js');
const schema = read('src/workshop/schema.js');
ok('موافقة العميل من الرابط بتضيف البنود فى نفس المعاملة',
  /await applyApprovedChangeOrder\(client, data\.company_id, changeId\);\s+\}\s+await client\.query\('COMMIT'\);/.test(pub));
ok('اعتماد المدير بيضيف البنود فى نفس المعاملة',
  /if \(row && status === 'approved'\) added = await applyApprovedChangeOrder\(client, cid, orderId\);\s+await client\.query\('COMMIT'\);/.test(admin));
ok('اعتماد/رفض المدير من «بانتظار الموافقة» بس (مايتقلبش بعد ما البنود اتضافت)',
  /WHERE id=\$3 AND company_id=\$4 AND status='proposed'\s+RETURNING job_id/.test(admin));
ok('الأعمدة الجديدة فى السكيمة (applied_at + change_order_id)',
  /ALTER TABLE workshop_change_orders ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;/.test(schema)
  && /ALTER TABLE workshop_job_parts ADD COLUMN IF NOT EXISTS change_order_id/.test(schema)
  && /ALTER TABLE workshop_job_labour ADD COLUMN IF NOT EXISTS change_order_id/.test(schema));

async function pg() {
  if (!process.env.DATABASE_URL) { console.log('⏭️  مفيش DATABASE_URL — اتخطّى السيناريو على Postgres'); return; }
  const { Pool } = require('pg');
  const { applyApprovedChangeOrder } = require('../src/workshop/change_orders');
  const J = require('../src/workshop/jobs');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const q = async (t, v) => (await c.query(t, v)).rows[0];
    const co = await q(`INSERT INTO companies (company_name, slug, page_type) VALUES ('فحص تعديل', 'chk-co-' || floor(random()*1e9)::text, 'workshop') RETURNING id`);
    const cid = co.id;
    const cust = await q('INSERT INTO workshop_customers (company_id, name) VALUES ($1, $2) RETURNING id', [cid, 'عميل فحص']);
    const veh = await q('INSERT INTO workshop_vehicles (company_id, plate, customer_id) VALUES ($1, $2, $3) RETURNING id', [cid, 'فحص 1', cust.id]);
    const job = await q('INSERT INTO workshop_jobs (company_id, vehicle_id, customer_id, discount, tax_percent) VALUES ($1,$2,$3,20,14) RETURNING *', [cid, veh.id, cust.id]);
    await c.query(`INSERT INTO workshop_job_parts (company_id, job_id, name, qty, unit_cost, unit_price) VALUES ($1,$2,'فلتر زيت',1,84,120),($1,$2,'زيت محرك',1,600,750)`, [cid, job.id]);
    await c.query(`INSERT INTO workshop_job_labour (company_id, job_id, description, amount) VALUES ($1,$2,'تغيير زيت وفلتر',150)`, [cid, job.id]);
    const totalsOf = async () => {
      const parts = (await c.query('SELECT qty, unit_price, unit_cost FROM workshop_job_parts WHERE company_id=$1 AND job_id=$2', [cid, job.id])).rows;
      const labour = (await c.query('SELECT amount FROM workshop_job_labour WHERE company_id=$1 AND job_id=$2', [cid, job.id])).rows;
      return J.jobTotals(job, parts, labour);
    };
    ok('قبل التعديل: 1140', (await totalsOf()).total === 1140, String((await totalsOf()).total));

    const order = await q(`INSERT INTO workshop_change_orders (company_id, job_id, reason) VALUES ($1,$2,'تيل فرامل') RETURNING id`, [cid, job.id]);
    await c.query(`INSERT INTO workshop_change_order_items (company_id, change_order_id, kind, description, qty, unit_price, unit_cost)
                   VALUES ($1,$2,'part','تيل فرامل أمامي',1,400,250), ($1,$2,'labour','تركيب تيل',2,50,0)`, [cid, order.id]);
    ok('تعديل «بانتظار الموافقة» مابيتضافش', (await applyApprovedChangeOrder(c, cid, order.id)) === 0);
    await c.query(`UPDATE workshop_change_orders SET status='approved', approved_at=now() WHERE id=$1`, [order.id]);
    const n1 = await applyApprovedChangeOrder(c, cid, order.id);
    const n2 = await applyApprovedChangeOrder(c, cid, order.id);
    ok('بعد الاعتماد: البندين اتضافوا مرة واحدة (الضغطة التانية ولا حاجة)', n1 === 2 && n2 === 0, `${n1}, ${n2}`);
    // 870+150 + 400 قطعة + (2×50) مصنعية = 1520 − 20 = 1500 + 14% = 1710
    const t = await totalsOf();
    ok('الإجمالى بعد التعديل: 1520 − 20 = 1500 + ضريبة 210 = 1710', t.subtotal === 1520 && t.tax === 210 && t.total === 1710, JSON.stringify([t.subtotal, t.tax, t.total]));
    ok('هامش القطع بيشمل تكلفة القطعة الجديدة (186 + 150 = 336)', t.partsMargin === 336, String(t.partsMargin));
    const tagged = (await c.query(`SELECT (SELECT count(*) FROM workshop_job_parts WHERE change_order_id=$1)::int AS p,
                                         (SELECT count(*) FROM workshop_job_labour WHERE change_order_id=$1 AND hours=2 AND rate=50 AND amount=100)::int AS l`, [order.id])).rows[0];
    ok('البنود متعلّمة بالتعديل اللى جت منه (والمصنعية 2 ساعة × 50 = 100)', tagged.p === 1 && tagged.l === 1, JSON.stringify(tagged));
    const sqlTotal = (await c.query(`SELECT ${J.jobTotalSql('j')} AS t FROM workshop_jobs j WHERE id=$1`, [job.id])).rows[0].t;
    ok('إجمالى SQL (المتبقّى/اللوحة) = نفس الرقم', Number(sqlTotal) === 1710, String(sqlTotal));
  } finally {
    await c.query('ROLLBACK').catch(() => {});
    c.release(); await pool.end();
  }
}

pg().then(() => {
  if (fail) { console.log(`\n❌ ${fail} فحص فشل`); process.exit(1); }
  console.log('\n✅ الموافقة الإضافية بتدخل الفاتورة مرة واحدة');
}).catch((e) => { console.error('❌', e.message); process.exit(1); });
