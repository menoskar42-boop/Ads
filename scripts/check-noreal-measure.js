#!/usr/bin/env node
/**
 * check-noreal-measure — «قياس بدون Real» (٢٠٢٦-٠٩-٢٣، سوبر أدمن فى «بحث برقم التليفون»).
 *
 * القياس ده مابيعملش real-time: بياخد أحدث تاريخ من History Check فى ClearView (ده
 * تاريخ القياس) + Loop Length من شاشة DSL. الحاجات اللى لو اتكسرت محدّش هياخد باله:
 *   ١. uploaded_at لازم يفضل وقت الوصول — جهاز التنفيذ بيعرف منه إن القياس خلص،
 *      وتاريخ الـHistory أقدم من بداية المهمة، فلو اتحط فيه المهمة تفضل مستنية للأبد.
 *   ٢. الأعمدة الجديدة فى schema.ts وensureSchema مع بعض (قيد #8).
 *   ٣. السكربت: «بدون Real» بيتفرّع **قبل** ضغط real-time، والقياس العادى لسه بيضغطه.
 *   ٤. Loop Length بيتقرا من نفس السطر (readRowValue) — findValueCellByLabel لو القيمة
 *      فاضية بيجيب عنوان الجدول اللى بعده.
 *   ٥. الزرار للسوبر أدمن بس، والخانات فى ترتيب الموبايل والإكسيل والـPDF.
 *   ٦. (٢٠٢٦-٠٩-٢٣) الزرار فى كل تقرير فيه زرار القياس القديم، وباتش ٩ الصبح «بدون Real»،
 *      و onClick={handler} ممنوع (الـevent كان هيتقرا noReal=true).
 * والاختبار الوظيفى (٤٠ حالة على صفحات AXON مقلّدة): serviceflow/scripts/test-dzs-noreal.cjs
 */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', 'serviceflow', p), 'utf8');
const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };

const schema = R('shared/schema.ts'), db = R('server/db.ts'), routes = R('server/routes.ts');
const us = R('dzs-expresse-v10.user.js'), plr = R('client/src/components/PhoneLookupReport.tsx');
const eq = R('client/src/lib/exec-queue.ts'), exb = R('client/src/components/ExecutorButton.tsx');

// ٢. الأعمدة
for (const [prop, col, type] of [['measuredAt', 'measured_at', 'timestamptz'], ['measureMode', 'measure_mode', 'text'], ['loopLength', 'loop_length', 'text'], ['histLabel', 'hist_label', 'text']]) {
  need(new RegExp(`${prop}:\\s*\\w+\\("${col}"`).test(schema), `shared/schema.ts: case_138 ناقصه ${prop} ("${col}")`);
  need(new RegExp(`ALTER TABLE case_138 ADD COLUMN IF NOT EXISTS ${col} ${type}`).test(db), `server/db.ts: ناقص ALTER لـ${col} ${type} (قيد #8)`);
}

// ١. الإدخال مابيلمسش uploaded_at، والتاريخ مابيتعدّاش now()
// فيه أكتر من INSERT INTO case_138 (منهم مزامنة Supabase اللى بتكتب uploaded_at عن قصد) —
// المقصود هنا جملة استقبال القياس، وهى الوحيدة اللى فيها measure_mode.
const ins = ([...routes.matchAll(/`INSERT INTO case_138[\s\S]*?`,/g)].map((m) => m[0]).find((x) => /measure_mode/.test(x))) || '';
need(ins, 'server/routes.ts: مالقيتش INSERT القياسات');
need(!/uploaded_at/.test(ins), 'INSERT القياسات بيكتب uploaded_at — جهاز التنفيذ هيستنى للأبد (تاريخ الـHistory أقدم من المهمة).');
need(/measured_at/.test(ins) && /LEAST\(COALESCE\(\$\d+::timestamp AT TIME ZONE 'Africa\/Cairo', now\(\)\), now\(\)\)/.test(ins),
  "measured_at لازم = LEAST(COALESCE(<History> AT TIME ZONE 'Africa/Cairo', now()), now()) — توقيت القاهرة ومايتعدّاش دلوقتى.");
const mc = (routes.match(/"\/api\/exec-queue\/measure-check"[\s\S]*?\n  \}\);/) || [''])[0];
need(/MAX\(uploaded_at\)/.test(mc) && !/measured_at/.test(mc), 'measure-check لازم يفضل MAX(uploaded_at) — مش measured_at.');
need(/COALESCE\(c\.measured_at, c\.uploaded_at\) AT TIME ZONE 'Africa\/Cairo'\) AS "lastMeasTime"/.test(routes),
  'بحث برقم التليفون: «تاريخ آخر قياس» لازم COALESCE(measured_at, uploaded_at) — وإلا تاريخ الـHistory مش هيبان.');

// ٣ + ٤. السكربت
need(/@version\s+10\.(2[4-9]|[3-9]\d)\./.test(us), 'السكربت لازم يبقى 10.24 أو أحدث (10.24 فيه انتظار الشاشة تهدى فى «بدون Real»)');
const rt = (us.match(/const realTimeTimer = setInterval[\s\S]*?\}, POLL_RT\);/) || [''])[0];
const iNo = rt.indexOf('if (NOREAL)'), iClick = rt.indexOf('b.click(); rtRequested = true');
need(iNo > -1 && iClick > -1 && iNo < iClick, 'realTimeTimer: فرع NOREAL لازم ييجى قبل ضغط real-time — وضغط real-time لازم يفضل للقياس العادى.');
need(/const loop = v === null \? "" : v\.slice/.test(us) && /readRowValue\("Estimated Loop Length"\)/.test(us),
  'Loop Length لازم يتقرا بـreadRowValue (نفس السطر بس).');
need(!/findValueCellByLabel\("Estimated Loop Length"\)/.test(us), 'Loop Length بيتقرا بـfindValueCellByLabel — لو فاضى هيجيب نص الجدول اللى بعده.');
need(/HIST_DATE_RE = \/\(\\d\{4\}-\\d\{2\}-\\d\{2\}\)\(\?:/.test(us), 'parseHist لازم يقبل تاريخ من غير وقت («2026-09-22»).');
need(/realtime:\s*\/real\\s\*-\?\\s\*time\/i/.test(us), 'parseHist لازم يعرف «(Realtime)».');
need(/histRealtime: rec\.histRealtime/.test(us), 'السكربت لازم يبعت histRealtime مع القياس.');

// ٥. الواجهة
need(/\{isSuper && \(\s*<Button[\s\S]{0,400}onClick=\{measureNoReal\}/.test(plr), 'زرار «قياس بدون Real» لازم يكون جوّه {isSuper && …}.');
need(/const measureNoReal = async[\s\S]{0,200}if \(!isSuper\) return;/.test(plr), 'measureNoReal لازم يرفض غير السوبر أدمن.');
need(/\$\{PHONE_LOOKUP_SOURCE\} \$\{NOREAL_MARK\}/.test(plr), 'المهمة لازم تتبعت بـnote فيه NOREAL_MARK — وإلا جهاز التنفيذ هيعمل قياس Real.');
const mob = (plr.match(/const MOBILE_ORDER = \[[\s\S]*?\];/) || [''])[0];
for (const l of ['نوع القياس', 'Loop Length']) {
  need(mob.includes(`"${l}"`), `«${l}» مش فى MOBILE_ORDER — مش هيظهر على الموبايل خالص.`);
  need(new RegExp(`"${l}": `).test(plr), `«${l}» مش فى تصدير الإكسيل (قيد #7).`);
}
need(/"آخر قياس", "نوع القياس", "Loop Length"/.test(plr), 'عمودين «نوع القياس» و«Loop Length» مش فى الـPDF (قيد #7).');
need(/if \(opts\?\.noReal\) return "&sf_mode=noreal";/.test(eq), 'measureHashFlags لازم يرجّع &sf_mode=noreal.');
need(/const noReal = String\(note \|\| ""\)\.includes\(NOREAL_MARK\);/.test(exb) && /executeBatch\("measure", accs, \{ fixRecent, noReal \}\)/.test(exb),
  'جهاز التنفيذ لازم يحوّل NOREAL_MARK لـnoReal.');

// ٦. (٢٠٢٦-٠٩-٢٣) الزرار فى **كل** تقرير فيه زرار القياس القديم، وباتش ٩ الصبح «بدون Real».
const MARK = (eq.match(/export const NOREAL_MARK = "([^"]+)";/) || [])[1];
need(MARK, 'مالقيتش NOREAL_MARK فى exec-queue.ts');
need((routes.match(/const AUTO_MEASURE_NOREAL_MARK = "([^"]+)";/) || [])[1] === MARK,
  'علامة باتش ٩ الصبح فى السيرفر لازم = NOREAL_MARK بالحرف — وإلا جهاز التنفيذ هيعمل قياس Real.');
need(/enqueueAutoBatch\(\s*"measure", measAccs,[\s\S]{0,300}قياس \$\{AUTO_MEASURE_NOREAL_MARK\}`\)/.test(routes),
  'باتش القياس اليومى (٩ ص) لازم الـnote بتاعه فيه AUTO_MEASURE_NOREAL_MARK.');
need(/const note = type === "measure" && opts\?\.noReal\s*\?\s*\[currentSource, NOREAL_MARK\]/.test(eq),
  'dispatchSpeedTool لازم يحط NOREAL_MARK فى note لما noReal.');
need(/export function noRealUrl\(url: string, noReal\?: boolean\): string \{\s*return noReal \? url \+ "&sf_mode=noreal" : url;/.test(eq),
  'noRealUrl لازم يزوّد &sf_mode=noreal (التشغيل المحلى).');
const dir = path.join(__dirname, '..', 'serviceflow', 'client', 'src', 'components');
let checked = 0;
for (const f of fs.readdirSync(dir).filter((x) => /Report\.tsx$/.test(x) && x !== 'PhoneLookupReport.tsx')) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  // زرار القياس القديم المجمّع (التقارير اللى فيها قياس لخط واحد بس مالهاش زرار مجمّع)
  if (!/\/>\}? قياس (DZS|الكل)\s*\n/.test(src)) continue;
  checked++;
  need(/قياس بدون Real\s*\n/.test(src), `${f}: فيه زرار القياس القديم ومافيهوش «قياس بدون Real».`);
  need(/noReal \}\)|noReal: kind === "measure" && noReal \}\)|notify: setNotice, noReal \}\)/.test(src), `${f}: الزرار الجديد مابيبعتش noReal لـdispatchSpeedTool.`);
  // CFM «قياس الكل» مالوش تشغيل محلى أصلاً (جهاز التنفيذ بس) — فمالوش رابط يتعلّم.
  const localOnlyQueue = /if \(kind === "measure"\) \{ alert\("جهاز التنفيذ غير مفعّل/.test(src);
  if (!localOnlyQueue) need(/noRealUrl\(buildDZSUrl\(/.test(src), `${f}: التشغيل المحلى مابيزوّدش &sf_mode=noreal.`);
  // onClick={handler} بيبعت الـevent كأول باراميتر — وهو truthy، فالقياس القديم هيبقى «بدون Real».
  for (const m of src.matchAll(/const (\w+) = async \(noReal = false\)/g)) {
    need(!new RegExp(`onClick=\\{${m[1]}\\}`).test(src), `${f}: onClick={${m[1]}} بيبعت الـevent مكان noReal — القياس القديم هيتعمل بدون Real.`);
  }
}

// ٧. (٢٠٢٦-٠٩-٢٣، خط 78630329) القراية بعد ما الشاشة تهدى — مش بعد أول تغيير.
need(/const settled = !pfBusy\(\) && quiet >= 3000/.test(us) && /speeds && \(poSeen \|\| waited >= 20000\)/.test(us),
  'startNoReal لازم يستنى الشاشة تهدى (PrimeFaces فاضى + ٣ث من غير تغيير + السرعات وحالة PO) — v10.23 كان بيقرا بدرى فسجّل سرعات قديمة وPO فاضى.');
need(!/changed && waited >= 2500/.test(us), 'رجعت قراية «أول تغيير + ٢٫٥ث» — دى اللى سجّلت القراية القديمة.');
// ٨. شرط باتش ٩ الصبح: آخر قياس أقدم من ٨ أيام (قرار المالك ٢٠٢٦-٠٩-٢٣، كانت ١٠).
need(/const AUTO_MEASURE_STALE_DAYS = 8;/.test(routes), 'شرط القياس اليومى لازم يكون ٨ أيام (قرار المالك) — اتغيّر؟');

need(checked >= 11, `اتفحص ${checked} تقرير بس — المفروض ١١ (فيه تقرير زرار القياس القديم فيه اتغيّر شكله؟)`);

if (errors.length) { console.log('❌ check-noreal-measure:'); errors.forEach((e) => console.log('   · ' + e)); process.exit(1); }
console.log('✅ check-noreal-measure: «بدون Real» مابيلمسش uploaded_at، بيتفرّع قبل real-time، والزرار للسوبر أدمن بس.');
