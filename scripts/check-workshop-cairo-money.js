#!/usr/bin/env node
/**
 * الورشة: الفلوس والساعة (مراجعة كوديكس ٢٠٢٦-١٠-٠٥).
 *
 * ١. «المتبقى» فى لوحة التحكم ولوحة التشغيل ورصيد العميل كانوا بيتحسبوا من غير الضريبة،
 *    والفاتورة (J.jobTotals) بالضريبة — فالورشة اللى بتحصّل ضريبة كانت بتشوف رقم أقل من
 *    فواتيرها. دلوقتى الاستعلامات بتنادى J.jobTotalSql — والفحص بيقارنه بـjobTotals على
 *    بوستجرس (لو متاح).
 * ٢. السيرفر UTC والورشة فى القاهرة: ميعاد ١٠ بالليل كان بيتسجّل ١ الصبح اليوم اللى بعده،
 *    و«النهارده» كان بيتقلب الساعة ٢–٣ الصبح، ومواعيد صفحة الحجز «٩ الصبح» كانت ١٢ الضهر.
 *
 *   node scripts/check-workshop-cairo-money.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fail++; };

// ── ١. توقيت القاهرة ───────────────────────────────────────────────────────────
const CT = require('../src/workshop/cairo_time');
ok(CT.cairoWallToDate('2026-10-05T22:00').toISOString() === '2026-10-05T19:00:00.000Z',
  'ميعاد ١٠ بالليل (صيفى +3) بيتسجّل ١٠ بالليل بتوقيت القاهرة — مش ١ الصبح اليوم اللى بعده');
ok(CT.cairoWallToDate('2026-01-15T09:00').toISOString() === '2026-01-15T07:00:00.000Z',
  'الشتا (+2) محسوب لوحده — مش فرق ثابت');
ok(CT.cairoWallToDate('مش تاريخ') === null && CT.cairoWallToDate('') === null, 'قيمة غلط ← null (الراوت بيرفضها)');
ok(CT.cairoToday(new Date('2026-10-05T22:30:00Z')) === '2026-10-06', '«النهارده» بيتقلب نص الليل فى القاهرة مش فى UTC');
ok(CT.shiftDay('2026-10-31', 1) === '2026-11-01' && CT.shiftDay('2026-03-01', -1) === '2026-02-28',
  'اليوم اللى بعده/قبله بيعدّى آخر الشهر صح');
ok(CT.cairoInputValue('2026-10-05T19:00:00Z') === '2026-10-05T22:00', 'خانة الميعاد بتتملى بساعة القاهرة');

const admin = read('src/routes/workshop_admin.js');
const tenant = read('src/routes/tenant.js');
ok(!/new Date\(b\.(starts_at|ends_at|promised_at)\)/.test(admin), 'مفيش وقت من فورم بيتقرا بـnew Date (UTC) فى إدارة الورشة');
ok((admin.match(/CT\.cairoWallToDate\(b\.(starts_at|ends_at|promised_at)\)/g) || []).length === 4,
  'الميعاد (بداية/نهاية) وموعد التسليم (إنشاء/تعديل) بتوقيت القاهرة');
ok(!/toISOString\(\)\.slice\(0, 10\)/.test(admin.slice(admin.indexOf('// ── Appointments'), admin.indexOf("router.post('/appointments/:id/convert'"))),
  'صفحة المواعيد مابتحسبش «النهارده» بـtoISOString (UTC)');
ok(/today: CT\.cairoToday\(\)/.test(admin), 'لوحة التشغيل: «النهارده» بتوقيت القاهرة');
ok(/AND \$\{cairoDay\('starts_at'\)\} = \$\{CAIRO_TODAY\}`/.test(admin) && /\$\{cairoDay\('a\.starts_at'\)\}=\$2::date/.test(admin),
  'عدّاد «مواعيد اليوم» وصفحة المواعيد بنفس تعريف اليوم (القاهرة صراحةً، مش توقيت الجلسة)');
ok(!/CURRENT_DATE/.test(admin.slice(admin.indexOf("router.get('/', "), admin.indexOf('// ── Appointments'))),
  'لوحة التحكم ولوحة التشغيل مافيهمش CURRENT_DATE (بيعتمد على توقيت الجلسة)');
ok(/const starts = CT\.cairoWallToDate\(b\.starts_at\);/.test(tenant) && /const slot = CT\.cairoWallToDate\(value\);/.test(tenant),
  'صفحة الحجز العامة: المواعيد بتتبني وبتتقرا بتوقيت القاهرة');
ok(!/function localDateTimeValue/.test(tenant), 'مفيش بناء مواعيد بساعة السيرفر (localDateTimeValue اتشال)');
{
  // مواعيد العمل بالأرقام العربية و«ص/م» — «٩ص–٨م» كانت بتقع على ٩–٥ فالحجز بيقفل ٤ العصر
  const { workshopHours } = require('../src/routes/tenant.js');
  const h = (t) => { const r = workshopHours(t); return `${r.start / 60}-${r.end / 60}`; };
  ok(h('السبت–الخميس ٩ص–٨م') === '9-20' && h('9am - 8pm') === '9-20' && h('9-17') === '9-17'
    && h('٩ - ٥') === '9-17' && h('10:30 - 22:00') === '10.5-22' && h('مش مكتوب') === '9-17',
    'مواعيد العمل بتتقري بالأرقام العربية وص/م (٩ص–٨م = ٩ الصبح لـ٨ بالليل)');
}

let missing = [];
for (const dir of ['src/views/workshop_admin', 'src/views/workshop_public']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir)).filter((x) => x.endsWith('.ejs'))) {
    const src = read(`${dir}/${f}`);
    for (const m of src.matchAll(/new Date\([^()]*(?:\([^()]*\))?[^()]*\)\.toLocale(?:String|DateString|TimeString)\([^)]*\)/g)) {
      if (!m[0].includes("timeZone:'Africa/Cairo'")) missing.push(`${f}: ${m[0].slice(0, 70)}`);
    }
  }
}
ok(missing.length === 0, 'كل تاريخ فى صفحات الورشة بيتعرض بتوقيت القاهرة' + (missing.length ? '\n    ' + missing.join('\n    ') : ''));
ok(/timeZone:'Africa\/Cairo',hour12:false/.test(read('src/views/workshop_admin/job.ejs')), 'خانة موعد التسليم فى أمر الشغل بتتملى بساعة القاهرة');

// ── ٢. المتبقى بالضريبة ─────────────────────────────────────────────────────────
const J = require('../src/workshop/jobs');
const dashUnpaid = admin.slice(admin.indexOf('// المتبقى بالضريبة'), admin.indexOf("WHERE j.company_id=$1 AND j.status <> 'cancelled'`, [cid]),"));
ok(/J\.jobTotalSql\('j'\)/.test(dashUnpaid), 'لوحة التحكم: المتبقى = J.jobTotalSql (بالضريبة)');
ok(/\$\{J\.jobTotalSql\('j'\)\}::float AS estimate_total/.test(admin), 'لوحة التشغيل: إجمالى الأمر بالضريبة');
ok(/SUM\(GREATEST\(0, \$\{J\.jobTotalSql\('j'\)\} - j\.paid\)\)/.test(admin.slice(admin.indexOf('AS jobs_count'))), 'رصيد العميل بنفس الحسبة');
ok(!/- j\.discount AS (total|estimate_total)/.test(admin), 'مفيش حسبة إجمالى تانية من غير ضريبة');

const schema = require('../src/workshop/schema');
ok(/AT TIME ZONE 'UTC'\) AT TIME ZONE 'Africa\/Cairo'/.test(schema.CAIRO_SHIFT_SQL) && schema.CAIRO_SHIFT_KEY === 'workshop:times-cairo-v1',
  'المواعيد القديمة بتتنقل لساعة القاهرة مرة واحدة (مفتاح app_meta)');

async function pgChecks() {
  let Pool;
  try { ({ Pool } = require('pg')); } catch (_) { return console.log('⏭️  مفيش pg — اتخطّى مقارنة SQL بـjobTotals'); }
  if (!process.env.DATABASE_URL) return console.log('⏭️  مفيش DATABASE_URL — اتخطّى مقارنة SQL بـjobTotals (شغّله على ريبليت)');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    // جداول مؤقتة بنفس الأسماء — pg_temp بيتدوّر فيه الأول، فمفيش لمس للجداول الحقيقية
    await c.query(`CREATE TEMP TABLE workshop_jobs (id int, company_id int, discount numeric, tax_percent numeric, paid numeric, promised_at timestamptz)`);
    await c.query(`CREATE TEMP TABLE workshop_job_parts (company_id int, job_id int, qty numeric, unit_price numeric)`);
    await c.query(`CREATE TEMP TABLE workshop_job_labour (company_id int, job_id int, amount numeric)`);
    await c.query(`CREATE TEMP TABLE workshop_appointments (starts_at timestamptz, ends_at timestamptz)`);
    const cases = [
      { id: 1, discount: 0, tax: 14, parts: [[2, 150.5]], labour: [200] },
      { id: 2, discount: 50, tax: 14, parts: [[1, 333.33]], labour: [99.99] },
      { id: 3, discount: 1000, tax: 14, parts: [[1, 100]], labour: [] },     // خصم أكبر من الإجمالى
      { id: 4, discount: 10, tax: 0, parts: [], labour: [75] },
    ];
    let same = true;
    for (const k of cases) {
      await c.query(`INSERT INTO workshop_jobs VALUES ($1, 7, $2, $3, 0, NULL)`, [k.id, k.discount, k.tax]);
      for (const [q, p] of k.parts) await c.query(`INSERT INTO workshop_job_parts VALUES (7, $1, $2, $3)`, [k.id, q, p]);
      for (const a of k.labour) await c.query(`INSERT INTO workshop_job_labour VALUES (7, $1, $2)`, [k.id, a]);
      const sql = Number((await c.query(`SELECT ${J.jobTotalSql('j')} AS t FROM workshop_jobs j WHERE id=$1`, [k.id])).rows[0].t);
      const js = J.jobTotals({ discount: k.discount, tax_percent: k.tax }, k.parts.map(([qty, unit_price]) => ({ qty, unit_price })), k.labour.map((amount) => ({ amount }))).total;
      if (Math.abs(sql - js) > 0.001) { same = false; console.log(`    أمر ${k.id}: SQL=${sql} JS=${js}`); }
    }
    ok(same, 'J.jobTotalSql = J.jobTotals (بالضريبة والخصم والتقريب) على بوستجرس');
    // «مواعيد اليوم» حتى لو جلسة القاعدة UTC: ميعاد ١١:٣٠ بالليل بتوقيت القاهرة لازم يتعدّ النهارده
    await c.query(`SET TIME ZONE 'UTC'`);
    const late = (await c.query(`SELECT (((now() AT TIME ZONE 'Africa/Cairo')::date + time '23:30') AT TIME ZONE 'Africa/Cairo') AS t`)).rows[0].t;
    const counted = (await c.query(`SELECT ($1::timestamptz AT TIME ZONE 'Africa/Cairo')::date = (now() AT TIME ZONE 'Africa/Cairo')::date AS ok`, [late])).rows[0].ok;
    ok(counted === true, 'ميعاد ١١:٣٠ بالليل بيتعدّ فى «مواعيد اليوم» حتى لو جلسة القاعدة UTC');
    await c.query(`INSERT INTO workshop_appointments VALUES ('2026-10-05 09:00+00', '2026-10-05 10:00+00'), ('2026-01-15 09:00+00', NULL)`);
    await c.query(`UPDATE workshop_jobs SET promised_at='2026-10-05 22:00+00' WHERE id=1`);
    await c.query(schema.CAIRO_SHIFT_SQL);
    const a = (await c.query(`SELECT starts_at, ends_at FROM workshop_appointments ORDER BY starts_at`)).rows;
    const p = (await c.query(`SELECT promised_at FROM workshop_jobs WHERE id=1`)).rows[0].promised_at;
    ok(a[0].starts_at.toISOString() === '2026-01-15T07:00:00.000Z' && a[1].starts_at.toISOString() === '2026-10-05T06:00:00.000Z'
      && a[1].ends_at.toISOString() === '2026-10-05T07:00:00.000Z' && a[0].ends_at === null
      && p.toISOString() === '2026-10-05T19:00:00.000Z',
      'تصحيح المواعيد القديمة: ٩ الصبح المتسجلة UTC بقت ٩ الصبح القاهرة (شتا وصيف)');
  } finally { c.release(); await pool.end(); }
}

pgChecks().then(() => {
  if (fail) { console.log(`\n❌ ${fail} فحص فشل`); process.exit(1); }
  console.log('\n✅ فلوس الورشة وساعتها سليمة');
}).catch((e) => { console.error('❌', e.message); process.exit(1); });
