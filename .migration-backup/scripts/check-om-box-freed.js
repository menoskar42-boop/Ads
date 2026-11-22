#!/usr/bin/env node
/**
 * check-om-box-freed — «متعذرات تم توفير خطوط بها» (قرار المالك ٢٠٢٦-٠٩-٣٠).
 *
 * الفنى يرد على متعذر OM «لا يمكن التنفيذ — بوكس مليان» → يتسجّل عدد الخطوط الشغّالة
 * على البكس وقتها. لو العدد قلّ بعدها فى أى وقت → المتعذر يظهر فى التقرير.
 * والمتعذرات الحالية المردود عليها قبل الميزة بيتسجّل لها الشغّال الحالى.
 *
 * بيتأكد من:
 *   · الأعمدة فى schema.ts وفى ensureSchema (ALTER) — مع بعض.
 *   · «الشغّال» مصدر واحد (boxWorkingWhereSql) لـ/api/box-lines وللعدّ — له بورت.
 *   · رد الفنى الجديد بيمسح الرقم القديم وبيسجّل من جديد.
 *   · المسح الدورى (النبضة + فتح التقرير) بيسجّل للمتعذرات الحالية اللى مالهاش رقم.
 *   · التقرير بيقارن الشغّال دلوقتى بالمسجّل (أقل = ظهر) وبيستبعد اللى اتنفّذ.
 *   · التاب موجود فى مجموعة «متعذرات OM» وبـExcel وPDF، وظاهر للفنى على اللى يخصه بس
 *     (متعذرات كباينه + اللى هو ردّ عليها).
 *
 *   الاختبار الحقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-om-box-freed.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '..', 'serviceflow');
const read = (p) => fs.readFileSync(path.join(SF, p), 'utf8');
const schema = read('shared/schema.ts');
const db = read('server/db.ts');
const routes = read('server/routes.ts');
const dash = read('client/src/pages/dashboard.tsx');
const comp = read('client/src/components/OmBoxFreedReport.tsx');

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };

for (const [ts, col, type] of [['boxWorkingAtResponse', 'box_working_at_response', 'integer'],
                               ['boxWorkingKey', 'box_working_key', 'text'],
                               ['boxWorkingRecordedAt', 'box_working_recorded_at', 'timestamptz']]) {
  need(new RegExp(`${ts}: \\w+\\("${col}"`).test(schema), `schema.ts: ${col} ناقص فى omResponses.`);
  need(db.includes(`ALTER TABLE om_responses ADD COLUMN IF NOT EXISTS ${col} ${type}`),
    `db.ts: ALTER لـ${col} ناقص (القاعدة الإلزامية #8).`);
}

need(/const boxWorkingWhereSql = [\s\S]{0,400}\$\{hasFrameSql\("pl\.full_phone"\)\}/.test(routes),
  '«الشغّال» لازم يكون له بورت (hasFrameSql) فى boxWorkingWhereSql.');
need(/WHERE \$\{boxWorkingWhereSql\("\$1", "\$2", "\$3"\)\}/.test(routes),
  '/api/box-lines لازم يستخدم boxWorkingWhereSql — عشان التحذير والعدّ نفس الرقم.');

const snap = routes.slice(routes.indexOf('async function snapshotOmBoxFullWorking'),
  routes.indexOf('// POST /api/om-rejections/response'));
need(snap.length > 100, 'snapshotOmBoxFullWorking اتشالت.');
need(/SET box_working_at_response = \$\{boxWorkingCountSql\("r\.central_name", "r\.cabin_number", "r\.box_number"\)\}/.test(snap),
  'التسجيل لازم يعدّ بـboxWorkingCountSql على بكس الرد.');
need(/AND r\.box_working_key IS DISTINCT FROM \$\{OM_BOX_KEY_SQL\}/.test(snap),
  'التسجيل لازم يبقى للى مالوش رقم أو البكس اتغيّر بس — وإلا الرقم بيتعدّ كل مرة ومابيقلّش أبداً.');
need(/EXISTS \(SELECT 1 FROM ftth_orders_current fo WHERE fo\.serial_number = r\.serial_number\)/.test(snap),
  'التسجيل على المتعذرات الحالية.');
need(/r\.rejection_reason IS DISTINCT FROM \$1/.test(snap), 'السبب لو اتغيّر من «بوكس مليان» الرقم لازم يتشال.');

const resp = routes.slice(routes.indexOf('app.post("/api/om-rejections/response"'),
  routes.indexOf('// POST /api/om-rejections/request-external'));
need(/box_working_at_response = NULL, box_working_key = NULL, box_working_recorded_at = NULL/.test(resp),
  'رد الفنى الجديد لازم يمسح الرقم القديم (عدّ «فى هذا الوقت»).');
need(/REJECTION_REASONS\.BOX_FULL\) \{\s*await snapshotOmBoxFullWorking\(serialNumber\)/.test(resp),
  'رد «بوكس مليان» لازم يسجّل الشغّال فوراً.');
const hb = routes.slice(routes.indexOf('app.post("/api/exec-queue/heartbeat"'), routes.indexOf('app.post("/api/exec-queue/heartbeat"') + 4000);
need(/void snapshotOmBoxFullWorking\(\)/.test(hb), 'النبضة لازم تسجّل للمسارات التانية (مزامنة الطلب المربوط).');

const rep = routes.slice(routes.indexOf('app.get("/api/reports/om-box-freed"'),
  routes.indexOf('// GET /api/reports/installations-by-tech'));
need(/await snapshotOmBoxFullWorking\(\);/.test(rep), 'التقرير لازم يسجّل الأول للمتعذرات الحالية اللى مالهاش رقم.');
need(/AND cur\.n < r\.box_working_at_response/.test(rep), 'التقرير: الشغّال دلوقتى أقل من المسجّل.');
need(/r\.status NOT IN \(\$2, \$3\)/.test(rep) && /ORDER_STATUS\.FEASIBLE, ORDER_STATUS\.EXTERNAL_FEASIBLE/.test(rep),
  'التقرير لازم يستبعد اللى اتقال عليه يمكن التنفيذ.');

need(/const mine = await techMsanCodes\(req\.user\);/.test(rep) && /\$\{techCond\}/.test(rep)
  && /msanInCodesSql\("fo\.msan_code"/.test(rep) && /btrim\(COALESCE\(r\.tech_name, ''\)\)/.test(rep),
  'الفنى لازم يشوف اللى يخصه بس (كباينه + اللى ردّ عليه) — فلترة فى السيرفر.');
need(/const TECH_ALLOWED: ReportTab\[\] = \[[\s\S]*?"om-box-freed"[\s\S]*?\];/.test(dash), 'التاب مش ظاهر للفنى.');
need(/\{ id: "om-box-freed", label: "متعذرات تم توفير خطوط بها" \}/.test(dash), 'التاب ناقص من «متعذرات OM».');
need(/reportTab === "om-box-freed"\s+&& <OmBoxFreedReport \/>/.test(dash), 'التاب مش بيرندر التقرير.');
need(/handleExportExcel/.test(comp) && /printTablePDF/.test(comp), 'التقرير لازم Excel وPDF.');

if (errors.length) {
  console.log('❌ check-om-box-freed:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-om-box-freed: «بوكس مليان» بيسجّل الشغّال وقت الرد، وأى نقص بيظهر فى «متعذرات تم توفير خطوط بها».');
