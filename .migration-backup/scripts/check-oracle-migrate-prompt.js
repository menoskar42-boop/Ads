#!/usr/bin/env node
// حارس برومبت «نقل القاعدة لـ Oracle» (docs/ORACLE_MIGRATE_PROMPT.md): كل زرار أو نص البرومبت بيقول
// للإكستنشن يدوّر عليه لازم يكون موجود فى الصفحة بنفس الحروف، وكل سرّ بيذكره لازم الكود يقراه.
// غيّرت اسم زرار من غير البرومبت ⇒ الإكستنشن هيتوه — والفحص ده بيوقع قبلها.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const prompt = read('docs/ORACLE_MIGRATE_PROMPT.md');
const page = read('serviceflow/client/src/components/DbMigrateReport.tsx');
const dash = read('serviceflow/client/src/pages/dashboard.tsx');
const engine = read('serviceflow/server/db-migrate.ts');
const routes = read('serviceflow/server/routes.ts');
const server = read('server.js');

const fails = [];
const need = (cond, msg) => { if (!cond) fails.push(msg); };

for (const label of ['فحص الاتصال', 'ابدأ النسخ لـ Oracle', 'قارن الأعداد دلوقتى', 'جاهز للنسخ ✓', 'النسخ مقفول',
  'النسخ خلص', 'النسخ وقف', 'إيقاف', 'قاعدة الموقع الحالية', 'قاعدة Oracle', 'شغّال ✓']) {
  need(prompt.includes(label), `البرومبت مافيهوش «${label}»`);
  need(page.includes(label), `الصفحة مافيهاش «${label}» اللى البرومبت بيدوّر عليه`);
}
need(dash.includes('label: "القاعدة"') && dash.includes('label: "نقل القاعدة لـ Oracle"'), 'تاب «القاعدة ← نقل القاعدة لـ Oracle» مش فى dashboard.tsx');
need(/g\.label !== "القاعدة" \|\| isSuperAdmin/.test(dash), 'مجموعة «القاعدة» لازم تبقى للسوبر أدمن بس');
need(dash.includes('reportTab === "db-migrate"          && isSuperAdmin'), 'صفحة النقل لازم تترسم للسوبر أدمن بس');
for (const r of ['status', 'probe', 'start', 'cancel', 'compare']) {
  need(new RegExp(`/api/admin/db-migrate/${r}", requireAuth, requireSuperAdmin`).test(routes), `/api/admin/db-migrate/${r} لازم requireAuth + requireSuperAdmin`);
}
need(engine.includes('REPEATABLE READ READ ONLY'), 'القراية من قاعدة الموقع لازم تفضل جوّه transaction READ ONLY');
need(engine.includes('"SERVICEFLOW_ORACLE_DATABASE_URL"') && prompt.includes('SERVICEFLOW_USE_ORACLE'), 'أسماء الأسرار فى البرومبت مش مطابقة للكود');
need(server.includes("process.env.SERVICEFLOW_USE_ORACLE === '1'"), 'server.js لازم يتحوّل لـ Oracle بـ SERVICEFLOW_USE_ORACLE=1 بس');
need(/ماتضيفش SERVICEFLOW_USE_ORACLE/.test(prompt), 'البرومبت لازم يمنع الإكستنشن من إضافة سرّ التحويل');
need(/جهاز التنفيذ/.test(prompt), 'البرومبت لازم يمنع «جهاز التنفيذ»');

if (fails.length) {
  console.error('❌ برومبت نقل القاعدة:\n - ' + fails.join('\n - '));
  process.exit(1);
}
console.log('✅ برومبت نقل القاعدة: أسماء الزراير والأسرار مطابقة للكود · الصفحة والـAPI للسوبر أدمن بس · القراية READ ONLY');
