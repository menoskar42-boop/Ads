#!/usr/bin/env node
/**
 * «آراء العملاء» فى الرئيسية: آراء حقيقية بس، بموافقة المالك، ومن أول ٣.
 *
 * الآراء المخترعة اتشالت ٢٠٢٦-٠٨-٠٦ (AdSense «Misrepresentation»). القسم رجع
 * ٢٠٢٦-١٠-٠٦ بشروط المالك:
 *   · التاجر بيكتب من حسابه (صاحب الحساب — مش موظف ولا جلسة ديمو ولا شركة عرض).
 *   · موافقة صريحة على النشر (consent_at) — من غيرها مايتسجّلش.
 *   · المالك بيوافق من /admin/testimonials — والتعديل بيرجّعه «بانتظار الموافقة».
 *   · الرئيسية: القسم مابيترسمش أصلاً غير من أول ٣ معتمدين (مش CSS مخفى).
 *   · مفيش سكيمة Review/AggregateRating (آراء المنظّمة عن نفسها مش مؤهّلة).
 *
 *   node scripts/check-platform-testimonials.js   (+ DATABASE_URL: سيناريو على Postgres)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fail = 0;
const ok = (m, c, x) => { console.log(`${c ? '✅' : '❌'} ${m}${x ? ' — ' + x : ''}`); if (!c) fail++; };

const T = require('../src/lib/platform_testimonials');
const home = read('src/views/home.ejs');
const company = read('src/routes/company.js');
const admin = read('src/routes/admin.js');
const server = read('server.js');

ok('الرئيسية: القسم بيترسم من أول ٣ بس (شرط EJS مش CSS)', /<% if \(typeof testimonials !== 'undefined' && testimonials\.length >= 3\) \{ %>/.test(home) && T.MIN_TO_SHOW === 3);
ok('مفيش سكيمة Review/AggregateRating فى الرئيسية', !/"@type"\s*:\s*"(Review|AggregateRating)"/.test(home));
ok('الكتابة لصاحب الحساب بس (مش ديمو ولا شركة عرض)', /req\.session\.companyUserId && !demoMode\.isDemoSession\(req\)\s+&& !demoMode\.isDemoSlug\(req\.session\.companySlug\)/.test(company));
ok('التعديل بيرجّع الرأى «بانتظار الموافقة»', /ON CONFLICT \(company_id\) DO UPDATE[\s\S]{0,300}status='pending', reviewed_at=NULL/.test(company));
ok('الموافقة على النشر إجبارية', T.validate({ author_name: 'أحمد', body: 'x'.repeat(40), rating: '5' }).error === 'لازم توافق على نشر الرأي.'
  && !T.validate({ author_name: 'أحمد', body: 'x'.repeat(40), rating: '5', consent: '1' }).error);
ok('صفحة الموافقة للأدمن بس', /router\.get\('\/testimonials', requireAdmin/.test(admin) && /router\.post\('\/testimonials\/:id\/status', requireAdmin/.test(admin));
ok('الجدول فى initDb (رأى واحد لكل شركة)', /CREATE TABLE IF NOT EXISTS platform_testimonials \([\s\S]*?company_id\s+INTEGER NOT NULL UNIQUE/.test(server));
ok('صفحة التاجر noindex', /<meta name="robots" content="noindex,nofollow" \/>/.test(read('src/views/company/testimonial.ejs')));

async function pg() {
  if (!process.env.DATABASE_URL) { console.log('⏭️  مفيش DATABASE_URL — اتخطّى السيناريو على Postgres'); return; }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const ddl = server.match(/CREATE TABLE IF NOT EXISTS platform_testimonials \([\s\S]*?\);/)[0];
    await c.query(ddl);
    await c.query('DELETE FROM platform_testimonials');
    const mk = async (i, active = true) => (await c.query(
      `INSERT INTO companies (company_name, slug, page_type, is_active) VALUES ($1, $2, 'portfolio', $3) RETURNING id`,
      ['شركة ' + i, 'chk-testi-' + i + '-' + Date.now(), active])).rows[0].id;
    const add = async (cid, status) => c.query(
      `INSERT INTO platform_testimonials (company_id, author_name, body, rating, consent_at, status, reviewed_at)
       VALUES ($1,'اسم','${'رأي حقيقي '.repeat(4)}',5, now(), $2, now())`, [cid, status]);
    const forHome = () => T.forHome(c);
    await add(await mk(1), 'approved'); await add(await mk(2), 'approved');
    await add(await mk(3), 'pending'); await add(await mk(4), 'rejected');
    await add(await mk(5, false), 'approved');   // شركة موقوفة
    ok('٢ معتمدين (والباقى معلّق/مرفوض/شركته موقوفة) → القسم مخفى', (await forHome()).length === 0);
    await add(await mk(6), 'approved');
    const three = await forHome();
    ok('التالت اتعتمد → القسم بيظهر بـ٣ (من غير الموقوفة)', three.length === 3, String(three.length));
    for (let i = 7; i < 12; i++) await add(await mk(i), 'approved');
    ok('بيعرض أحدث ٦ بالكتير', (await forHome()).length === T.MAX_SHOWN);
  } finally {
    await c.query('ROLLBACK').catch(() => {}); c.release(); await pool.end();
  }
}

pg().then(() => {
  if (fail) { console.log(`\n❌ ${fail} فحص فشل`); process.exit(1); }
  console.log('\n✅ آراء العملاء: حقيقية، بموافقة المالك، ومن أول ٣');
}).catch((e) => { console.error('❌', e.message); process.exit(1); });
