#!/usr/bin/env node
/**
 * الورشة: إثبات موافقة العميل + أمان رابط المتابعة (مراجعة كوديكس ٢٠٢٦-١٠-٠٥).
 *
 * ١. الموافقة كانت اسم بس. دلوقتى: نص موافقة ثابت بيتعلّم عليه · الإجمالى اللى العميل شافه
 *    لازم يساوى الإجمالى وقت الضغط (لو الورشة غيّرت العرض بعد ما فتح، بيرجع يشوف الجديد) ·
 *    سجل إثبات (البنود + الإجمالى + IP + المتصفح + الوقت) فى نفس الترانزاكشن · ومحاولات محدودة.
 * ٢. الرابط كان للأبد. دلوقتى بيقف بعد ٣٠ يوم من التسليم/الإلغاء، وبيتوقف/يتجدّد من الإدارة.
 *
 *   node scripts/check-workshop-approvals.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fail++; };

const pub = read('src/routes/workshop_public.js');
const admin = read('src/routes/workshop_admin.js');
const schema = read('src/workshop/schema.js');
const W = require('../src/routes/workshop_public');

// ── الموافقة ───────────────────────────────────────────────────────────────────
ok(W.CONSENT_TEXT === 'أوافق على الأعمال والتكلفة الموضحة', 'نص الموافقة الثابت');
for (const route of ["router.post('/:token/approve', approveLimiter,", "router.post('/:token/change-orders/:id/approve', approveLimiter,"]) {
  const i = pub.indexOf(route);
  const body = pub.slice(i, pub.indexOf('\n});', i));
  ok(i > 0, `${route.split("'")[1]}: عليه حد محاولات`);
  ok(/if \(b\.agree !== '1'\) return back\('consent=1/.test(body), `${route.split("'")[1]}: لازم يعلّم على نص الموافقة`);
  ok(/if \(!sameMoney\(b\.seen_total, (totals\.)?total\)\) return back\('changed=1/.test(body), `${route.split("'")[1]}: لو الإجمالى اتغيّر بعد فتح الصفحة — مرفوض`);
  ok(/AND \$\{LINK_LIVE_SQL\}/.test(body), `${route.split("'")[1]}: رابط منتهى/موقوف مايوافقش`);
  ok(/BEGIN[\s\S]*if \(upd\.rowCount\) \{[\s\S]*INSERT INTO workshop_approval_evidence[\s\S]*COMMIT/.test(body),
    `${route.split("'")[1]}: الموافقة وسجل الإثبات فى ترانزاكشن واحدة، ومرة واحدة بس`);
}
ok(/CREATE TABLE IF NOT EXISTS workshop_approval_evidence \([\s\S]*snapshot\s+JSONB[\s\S]*ip\s+TEXT,[\s\S]*user_agent\s+TEXT,/.test(schema),
  'جدول الإثبات فيه البنود والـIP والمتصفح');
ok(/ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,\s*ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ/.test(schema), 'أعمدة انتهاء/إيقاف الرابط');

// ── الرابط ─────────────────────────────────────────────────────────────────────
ok(W.LINK_DAYS_AFTER_CLOSE === 30, 'الرابط بيقف بعد ٣٠ يوم من التسليم/الإلغاء');
ok((pub.match(/WHERE a\.token=\$1 AND \$\{LINK_LIVE_SQL\}/g) || []).length === 3, 'الصلاحية على صفحة المتابعة والدفع والموافقة');
ok(/return res\.status\(410\)\.render\('workshop_public\/expired'\)/.test(pub), 'الرابط المنتهى ← صفحة «انتهى» (410) مش 404 ولا البيانات');
ok(/router\.post\('\/jobs\/:id\/portal\/revoke'/.test(admin) && /router\.post\('\/jobs\/:id\/portal\/renew'/.test(admin)
  && /SET token=\$3, revoked_at=NULL, last_viewed_at=NULL/.test(admin), 'الإدارة: إيقاف الرابط · رابط جديد (التوكن نفسه بيتغيّر)');
ok(/SET expires_at = CASE WHEN \$3 IN \('delivered','cancelled'\) THEN now\(\) \+ interval/.test(admin), 'التسليم/الإلغاء بيحط ميعاد انتهاء، والرجوع لمفتوح بيشيله');
ok(/آخر فتح: <%= access && access\.last_viewed_at/.test(read('src/views/workshop_admin/job.ejs')), 'أمر الشغل بيعرض آخر فتح للرابط');

// ── القوالب بتترندر ────────────────────────────────────────────────────────────
(async () => {
  try {
    const html = await ejs.renderFile(path.join(ROOT, 'src/views/workshop_public/expired.ejs'), {});
    ok(/noindex/.test(html) && /رابط المتابعة ده انتهى/.test(html), 'صفحة «الرابط انتهى» noindex وبتترندر');
    const status = await ejs.renderFile(path.join(ROOT, 'src/views/workshop_public/status.ejs'), {
      title: 'متابعة WS-00001', token: 'tok', J: require('../src/workshop/jobs'), consentText: W.CONSENT_TEXT,
      job: { status: 'quoted', customer_name: 'QA', company_name: 'ورشة', received_at: new Date(), job_id: 1 },
      parts: [{ name: 'فحمات', qty: 2, unit_price: 150 }], labour: [{ description: 'تغيير', amount: 200 }],
      inspection: [], photos: [], changeOrders: [{ id: 7, status: 'proposed', reason: 'إضافة', total: 60, items: [] }],
      totals: { total: 513, subtotal: 500, tax: 63, discount: 50 },
      payment: { paid: 0, due: 513, onlineReady: false, link: null, linkLabel: '', instructions: '' },
      approved: false, payerror: '', query: { changed: '1' },
    });
    ok(/name="seen_total" value="513"/.test(status) && /name="seen_total" value="60"/.test(status), 'الصفحة بتبعت الإجمالى اللى العميل شايفه (العرض والتعديل)');
    ok((status.match(/name="agree" value="1" required/g) || []).length === 2 && status.includes(W.CONSENT_TEXT), 'خانة «أوافق على الأعمال والتكلفة الموضحة» فى الفورمين');
    ok(/الورشة عدّلت العرض من ساعة ما فتحت الصفحة/.test(status), 'رسالة «العرض اتغيّر» بتظهر');
  } catch (e) { ok(false, 'رندر صفحات العميل: ' + e.message); }

  // ── شرط الصلاحية على بوستجرس ──────────────────────────────────────────────────
  let Pool;
  try { ({ Pool } = require('pg')); } catch (_) { Pool = null; }
  if (!Pool || !process.env.DATABASE_URL) console.log('⏭️  مفيش قاعدة — اتخطّى اختبار شرط صلاحية الرابط على بوستجرس');
  else {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const c = await pool.connect();
    try {
      await c.query(`CREATE TEMP TABLE a (token text, revoked_at timestamptz, expires_at timestamptz)`);
      await c.query(`CREATE TEMP TABLE j (status text, delivered_at timestamptz, ready_at timestamptz, done_at timestamptz, received_at timestamptz)`);
      const live = async (acc, job) => {
        await c.query('DELETE FROM a'); await c.query('DELETE FROM j');
        await c.query(`INSERT INTO a VALUES ('t', $1, $2)`, [acc.revoked_at || null, acc.expires_at || null]);
        await c.query(`INSERT INTO j VALUES ($1, $2, NULL, NULL, now() - interval '90 days')`, [job.status, job.delivered_at || null]);
        return (await c.query(`SELECT (${W.LINK_LIVE_SQL}) AS ok FROM a, j`)).rows[0].ok;
      };
      const ago = (d) => new Date(Date.now() - d * 864e5);
      ok(await live({}, { status: 'in_progress' }) === true, 'أمر مفتوح ← الرابط شغّال');
      ok(await live({}, { status: 'delivered', delivered_at: ago(10) }) === true, 'اتسلّم من ١٠ أيام ← لسه شغّال');
      ok(await live({}, { status: 'delivered', delivered_at: ago(40) }) === false, 'اتسلّم من ٤٠ يوم ← انتهى');
      ok(await live({}, { status: 'cancelled' }) === false, 'اتلغى قديم (من غير ميعاد) ← انتهى');
      ok(await live({ expires_at: new Date(Date.now() + 5 * 864e5) }, { status: 'cancelled' }) === true, 'رابط جديد لأمر مقفول ← شغّال لحد ميعاده');
      ok(await live({ revoked_at: new Date() }, { status: 'in_progress' }) === false, 'موقوف من الإدارة ← مايفتحش');
    } finally { c.release(); await pool.end(); }
  }
  if (fail) { console.log(`\n❌ ${fail} فحص فشل`); process.exit(1); }
  console.log('\n✅ موافقة العميل ورابط المتابعة سليمين');
})();
