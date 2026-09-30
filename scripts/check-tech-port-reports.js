#!/usr/bin/env node
/**
 * check-tech-port-reports — «الكروت (شيلف/سلوت)» و«الفاضى لكل نوع بورت» و«الخطوط
 * المرفوعة» بتظهر للفنيين، وكل فنى كباينه بس (قرار المالك ٢٠٢٦-٠٩-٣٠).
 *
 * «كباينه» = cabinet_technicians برقم العامل + الإسناد اليدوى باسمه (msan_tech_overrides)
 * — نفس قاعدة «بحث برقم التليفون». الفلترة فى السيرفر (مش فى الشاشة بس)، وفنى مالوش
 * كباين مايشوفش حاجة (مش الكل).
 *
 *   الاختبار الحقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-tech-port-reports.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '..', 'serviceflow');
const routes = fs.readFileSync(path.join(SF, 'server/routes.ts'), 'utf8');
const dash = fs.readFileSync(path.join(SF, 'client/src/pages/dashboard.tsx'), 'utf8');

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };
const between = (a, b) => { const i = routes.indexOf(a); return i < 0 ? '' : routes.slice(i, routes.indexOf(b, i)); };

const helper = between('async function techMsanCodes', 'async function coverageCodes');
need(/if \(user\?\.role !== ROLES\.TECH\) return null;/.test(helper), 'techMsanCodes: غير الفنى لازم يرجّع null (الكل).');
need(/FROM cabinet_technicians ct\s+WHERE \$1 <> '' AND btrim\(ct\.worker_code\) = \$1/.test(helper),
  'techMsanCodes: كباين الفنى برقم العامل (ورقم فاضى مايجيبش كل الكباين).');
need(/FROM msan_tech_overrides mto[\s\S]*?unnest\(string_to_array\(mto\.tech_name, ','\)\)/.test(helper),
  'techMsanCodes: الإسناد اليدوى باسم الفنى.');

for (const [route, label] of [['app.get("/api/phone-ports/slot-cards"', 'الكروت/الفاضى'],
                              ['app.get("/api/phone-ports/removed"', 'الخطوط المرفوعة']]) {
  const body = between(route, '\n  });\n');
  need(/const mine = await techMsanCodes\(req\.user\);\s+if \(mine\) \{\s+params\.push\(mine\);\s+conds\.push\(msanInCodesSql\("msan_code"/.test(body),
    `${label}: الفنى لازم يتفلتر على كباينه فى السيرفر.`);
}

const allowed = (dash.match(/const TECH_ALLOWED: ReportTab\[\] = \[([\s\S]*?)\];/) || [])[1] || '';
for (const id of ['slot-cards', 'cabinet-port-free', 'removed-ports'])
  need(allowed.includes(`"${id}"`), `التاب ${id} مش ظاهر للفنى.`);
need(/const TECH_ALLOWED_GROUPS = \[[^\]]*"الخطوط والبكسيات"/.test(dash), 'مجموعة «الخطوط والبكسيات» مش ظاهرة للفنى.');

if (errors.length) {
  console.log('❌ check-tech-port-reports:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-tech-port-reports: الكروت والفاضى والمرفوعة ظاهرين للفنى — كباينه بس.');
