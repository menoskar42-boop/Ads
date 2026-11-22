#!/usr/bin/env node
/**
 * مفيش صفحة عامة للتاجر مستخبّية ورا لوحة إدارة.
 *
 * `server.js` بيركّب لوحات القطاعات (`/nutrition`، `/gym`…) **قبل** راوتر
 * المستأجر. فأي مسار في `src/routes/tenant.js` بيبدأ بمسار لوحة، على سَبدومين
 * التاجر بيروح للّوحة الأول — واللوحة بتحوّل الزائر لـ`/company/login`. ده
 * اللي كان حاصل في فورم حجز التغذية (`POST /nutrition/book`) ولينك حجز الجيم
 * (`/gym/booking/:token`): المريض/العميل يدوس «احجز» يلاقي شاشة دخول، والحجز
 * مايتحفظش (٢٠٢٦-٠٩-٢٤).
 *
 * الفحص: كل مسار في tenant.js بيبدأ بمسار متركّب قبل `app.use(tenantMiddleware)`
 * لازم يطابق `TENANT_FIRST`، و`TENANT_FIRST` لازم يتركّب قبل أول لوحة.
 * وكمان: مفيش قالب tenant_*.ejs بيقرا `req` (مش بيتبعتله، فبيبقى فاضي دايماً).
 *
 *   node scripts/check-tenant-shadow.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const tenant = fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8');

const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const tenantAt = server.indexOf('app.use(tenantMiddleware)');
check('app.use(tenantMiddleware) موجود', tenantAt > 0);
const mounts = [...server.matchAll(/app\.use\('(\/[a-z0-9_-]+)'/g)]
  .filter((m) => m.index < tenantAt)
  .map((m) => ({ path: m[1], at: m.index }));

const defM = server.match(/const TENANT_FIRST = (\/.*\/);/);
check('TENANT_FIRST متعرّف في server.js', !!defM);
// eslint-disable-next-line no-eval
const TENANT_FIRST = defM ? eval(defM[1]) : /$^/;
const useAt = server.indexOf('if (!TENANT_FIRST.test(req.path)) return next();');
check('TENANT_FIRST متركّب', useAt > 0);

// Example value for each :param so the regex sees a real-looking path.
const sample = (p) => p.replace(/:[a-zA-Z_]+(\([^)]*\))?/g, 'x1');
let shadowed = 0;
for (const m of tenant.matchAll(/router\.(get|post|put|delete)\('(\/[^']*)'/g)) {
  const p = m[2];
  const hit = mounts.find((mt) => p === mt.path || p.startsWith(mt.path + '/'));
  if (!hit) continue;
  shadowed++;
  check(`${m[1].toUpperCase()} ${p} (tenant.js) مستخبّي ورا ${hit.path} — ضيفه لـTENANT_FIRST`,
    TENANT_FIRST.test(sample(p)));
  check(`TENANT_FIRST لازم يتركّب قبل ${hit.path}`, useAt > 0 && useAt < hit.at);
}
check('المسارات المعروفة لسه متغطّية', TENANT_FIRST.test('/nutrition/book') && TENANT_FIRST.test('/gym/booking/x1/cancel'));
check('لوحة التغذية نفسها مش متحوّلة للمستأجر', !TENANT_FIRST.test('/nutrition/patients') && !TENANT_FIRST.test('/gym'));

// صفحة التاجر مابيتبعتلهاش `req`، فأي قراءة منه جوّه القالب دايماً فاضية — فورم
// حجز التغذية كان بيقرا req.query.sent فالمريض عمره ما شاف «حجزك اتسجّل».
const VIEWS = path.join(ROOT, 'src/views');
for (const f of fs.readdirSync(VIEWS).filter((x) => /^tenant_.*\.ejs$/.test(x))) {
  const v = fs.readFileSync(path.join(VIEWS, f), 'utf8');
  check(`src/views/${f} بيقرا req (مش بيتبعت للقالب) — استخدم sent/contactError من tenant.js`,
    !/\breq\.(query|session|body)\b/.test(v));
}

if (errors.length) {
  console.log('❌ check-tenant-shadow:');
  [...new Set(errors)].forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-tenant-shadow: ${shadowed} مسار عام بيبدأ بمسار لوحة — كلهم بيوصلوا لراوتر التاجر الأول.`);
