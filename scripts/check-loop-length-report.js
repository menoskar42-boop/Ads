#!/usr/bin/env node
/**
 * check-loop-length-report — تقرير «طول الخط والسرعة والاسكور» (٢٠٢٦-٠٩-٢٤).
 *
 * ٣ رسومات scatter: Loop Length قصاد السرعة الحالية / أقصى سرعة / الاسكور،
 * فلترة بالسنترال والكابينة والبكسيات، فى تاب «القياسات». الحاجات اللى لو
 * اتكسرت الرسمة هتكدب من غير ما حد ياخد باله:
 *   ١. الـloop والسرعات من **نفس صف القياس** (LATERAL واحد مقيّد بـloop مش فاضى) —
 *      غير كده النقطة طول خط من يوم وسرعة من قياس Real فى يوم تانى.
 *   ٢. الاسكور > 100 (حالات خاصة) مايترسمش كقراية.
 *   ٣. Excel + PDF (قيد #7)، والـPDF فيه الرسومات نفسها.
 * اتجرّب (٢٠٢٦-٠٩-٢٤): الاستعلام على Postgres حقيقى (٩ حالات)، والتقرير فى كروميوم.
 */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', 'serviceflow', p), 'utf8');
const errors = [];
const need = (c, m) => { if (!c) errors.push(m); };

const routes = R('server/routes.ts');
const ep = routes.slice(routes.indexOf('"/api/reports/loop-length-scatter"'));
const q = ep.slice(0, ep.indexOf('let withLoop'));
need(routes.includes('app.get("/api/reports/loop-length-scatter", requireAuth,'), 'مفيش endpoint التقرير (أو من غير requireAuth).');
need((q.match(/JOIN LATERAL/g) || []).length === 1 && /COALESCE\(c\.loop_length, ''\) <> ''/.test(q),
  'الـloop والسرعات لازم من نفس الصف: LATERAL واحد مقيّد بـloop مش فاضى.');
need(/hasFrameSql\("pl\.full_phone"\)/.test(q), 'الخطوط اللى مالهاش فريم لازم تتشال (زى متوسط القياسات).');
need(/pl\.box_number = ANY\(\$\$\{params\.length\}::text\[\]\)/.test(q), 'فلتر البكسيات لازم يقبل أكتر من بكس.');
need(/req\.user\?\.role === ROLES\.TECH/.test(q), 'الفنى يشوف كبايينه بس (زى متوسط القياسات).');
need(/Number\(r\.score\) > 100\) \{ special\+\+; continue; \}/.test(ep), 'الاسكور > 100 مايترسمش.');
need(/import \{ loopMeters, speedKbps \} from "\.\/loop-length";/.test(routes), 'التحويل لازم من server/loop-length.ts.');

const ui = R('client/src/components/LoopLengthScatterReport.tsx');
for (const k of ['currentSpeed', 'maxSpeed', 'score']) need(new RegExp(`key: "${k}"`).test(ui), `رسمة ${k} ناقصة.`);
need(/handleExportExcel/.test(ui) && /handleExportPDF/.test(ui) && /introHtml: svgs/.test(ui), 'Excel + PDF (بالرسومات) إلزامى (قيد #7).');
need(/enabled: !!central/.test(ui), 'السنترال إلزامى قبل الاستعلام (من غيره بيلف على كل الخطوط).');
need(/export function fitLine/.test(ui) && /ReferenceLine segment=\{s\.seg\}/.test(ui), 'خط الاتجاه ومعامل الارتباط.');
const dash = R('client/src/pages/dashboard.tsx');
need(/\{ id: "loop-length-scatter", label: "طول الخط والسرعة والاسكور \(رسم بيانى\)" \}/.test(dash)
  && /reportTab === "loop-length-scatter" && <LoopLengthScatterReport \/>/.test(dash), 'التقرير مش متسجّل فى تاب القياسات.');
const grp = dash.slice(dash.indexOf('label: "القياسات"'), dash.indexOf('label: "معاملات التنفيذ"'));
need(grp.includes('"loop-length-scatter"'), 'التقرير لازم يكون جوّه مجموعة «القياسات».');
need(/introHtml\?: string;/.test(R('client/src/lib/print-pdf.ts')), 'printTablePDF لازم يقبل introHtml.');

if (errors.length) { console.log('❌ check-loop-length-report:'); errors.forEach((e) => console.log('   · ' + e)); process.exit(1); }
console.log('✅ check-loop-length-report: ٣ رسومات من نفس صف القياس، بفلتر سنترال/كابينة/بكسيات، وExcel + PDF.');
