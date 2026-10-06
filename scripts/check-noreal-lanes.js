#!/usr/bin/env node
/**
 * سيرفس فلو: «بدون Real» بتابين مع بعض — والاستثناء ده بس، والباقى زى ما هو.
 *
 * قرار المالك (٢٠٢٦-٠٩-٢٧): باتش «بدون Real» يشتغل فى تابين DZS مع بعض. القاعدة
 * العامة «مهمة واحدة لكل موقع» (AXON real-time واحد لكل جلسة) فضلت لكل حاجة تانية.
 * Real أولويته أعلى بيستنى التابين يخلّصوا الخط اللى فى إيدهم، يتنفّذ، وبعده «بدون
 * Real» يكمّل. للرجوع فوراً: NOREAL_LANES = 1.
 *
 *   node scripts/check-noreal-lanes.js
 *   اختبار حقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-exec-noreal-lanes.mts
 *   واختبار السكربت: node serviceflow/scripts/test-dzs-noreal.cjs (قسم ٦)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '../serviceflow');
const read = (f) => fs.readFileSync(path.join(SF, f), 'utf8');
const routes = read('server/routes.ts');
const exec = read('client/src/components/ExecutorButton.tsx');
const lib = read('client/src/lib/exec-queue.ts');
const script = read('dzs-expresse-v10.user.js');
const errors = [];
const check = (l, ok) => { if (!ok) errors.push(l); };

// ── السيرفر ──
const lanes = +((routes.match(/const NOREAL_LANES = (\d+);/) || [])[1] || 0);
check('NOREAL_LANES متعرّف (1 = القديم)', lanes >= 1);
// المالك: العدد من NOREAL_LANES **بس** — مفيش رقم تاب متثبّت فى جهاز التنفيذ ولا حدّ لـ«بدون Real» فى السكربت.
check('جهاز التنفيذ مافيهوش حدّ لعدد تابات «بدون Real»', !/noRealLanes\.has\(\d\)|lane (<|<=) \d/.test(exec));
check('السكربت مافيهوش حدّ لعدد تابات «بدون Real»', /=== "noreal"[\s\S]{0,120}\? Infinity : 1;/.test(script));
const helper = routes.slice(routes.indexOf('const siteFreeFor ='), routes.indexOf('app.post("/api/exec-queue/claim"'));
check('الاستثناء لمهام قياس «بدون Real» و«إيقاف PO» بس', /\.type = 'measure' AND POSITION\('\$\{AUTO_MEASURE_NOREAL_MARK\}'/.test(routes)
  && /const isPoStopJob = \(a: string\) => `\(\$\{a\}\.type = 'stop'\)`;/.test(routes)
  && /const parallelGroup = [\s\S]{0,200}THEN 'noreal' WHEN \$\{isPoStopJob\(a\)\} THEN 'stop' END\)`;/.test(routes));
check('بحد عدد التابات بتاع نوعها (laneCap) — وأى نوع تانى تاب واحد', /< \$\{laneCap\(e, L\)\}/.test(helper) && /ELSE 1 END\)`;/.test(routes));
check('بشرط إن الشغّال كله من نفس المجموعة (Real/رفع بيقفلوا الموقع، والنوعين مابيتخلطوش)', /AND \$\{parallelGroup\("b"\)\} IS DISTINCT FROM \$\{parallelGroup\(e\)\}/.test(helper));
check('وإن مفيش مهمة من مجموعة تانية قبله فى الطابور (Real مايتجوّعش)', /AND \$\{parallelGroup\("x"\)\} IS DISTINCT FROM \$\{parallelGroup\(e\)\}\s+AND \$\{queueRank\("x"\)\} < \$\{queueRank\(e\)\}/.test(helper));
const claim = routes.slice(routes.indexOf('app.post("/api/exec-queue/claim"'), routes.indexOf('app.post("/api/exec-queue/:id/done"'));
check('العدد من الإعدادات وقت السحب (readExecLanes)', /const lanes = await readExecLanes\(tx\);/.test(claim));
check('الاختيار والـUPDATE الاتنين بنفس القاعدة وبنفس العدد', /siteFreeFor\("e", "e\.site_k", lanes\)/.test(claim) && /siteFreeFor\("exec_jobs", "\$3", lanes\)/.test(claim));
check('إنقاذ المهام اليتيمة مابيعتبرش تاب من نفس المجموعة دليل إن الأول اتعدّى', /AND NOT \(\$\{parallelGroup\("e"\)\} IS NOT NULL AND \$\{parallelGroup\("e"\)\} = \$\{parallelGroup\("j2"\)\}\)/.test(routes));
// ── الإعدادات (رفع الملفات ← إعدادات) ──
const maxLanes = +((routes.match(/const EXEC_LANES_MAX = (\d+);/) || [])[1] || 0);
const execMax = +((exec.match(/const MAX_LANES = (\d+);/) || [])[1] || 0);
check('سقف الإعدادات = سقف جهاز التنفيذ (MAX_LANES)', maxLanes >= 1 && maxLanes === execMax);
check('القيمة بتتقصّ بين 1 والسقف قبل ما تدخل الـSQL', /Math\.min\(EXEC_LANES_MAX, Math\.max\(1, n\)\)/.test(routes));
check('تعديل العدد سوبر أدمن بس', /app\.put\("\/api\/exec-queue\/lanes", requireAuth, requireSuperAdmin/.test(routes)
  && /if \(key\.startsWith\("exec_lanes_"\)\) return res\.status\(403\)/.test(routes));
const upload = read('client/src/components/FileUploadSection.tsx');
check('زر «إعدادات» فى رفع الملفات للسوبر أدمن', /\{isSuperAdmin && <ExecLanesSettingsButton \/>\}/.test(upload));

// ── جهاز التنفيذ ──
check('تاب لكل مسار (dzs_measure_2)', /export function measureTabName\(lane\?: number\)/.test(lib) && /measureTabName\(opts\?\.noReal \? opts\.lane : undefined\)/.test(lib));
check('sf_lane فى الهاش لـ«بدون Real» التانى بس', /"&sf_mode=noreal" \+ \(opts\.lane && opts\.lane > 1 \? `&sf_lane=\$\{opts\.lane\}` : ""\)/.test(lib));
check('قفل «التاب الأخير» لنفس المسار بس', /lastMeasureWin\.current\.get\(lane\)/.test(exec) && /lastMeasureWin\.current\.set\(lane, win\)/.test(exec));
check('رقم التاب = أول رقم فاضى (مش متثبّت على ٢)', /while \(noRealLanes\.has\(lane\)\) lane\+\+;/.test(exec));
check('المهام الشغّالة متتبّعة بالمسار مش بالموقع', /running\.set\(laneKey,/.test(exec) && /running\.delete\(laneKey\)/.test(exec) && /noRealLanes\.delete\(lane\)/.test(exec));

check('تابات «بدون Real» بتفتح متفرّقة (تسجيل دخول مع بعض بيبوّظ جلسة)', /const NOREAL_STAGGER_MS = \d+ \* 1000;/.test(exec) && /if \(wait > 0\) await sleep\(wait\);/.test(exec));
check('تاب «بدون Real» اللى علق بيتقفل لوحده (timeout) من غير ريفريش للصفحة كلها', /if \(noReal\) return "timeout";/.test(exec));
// المالك ٢٠٢٦-١٠-٠٦: صفحة sessionExpired (10.60.213.x) كانت بتفضل واقفة ٣ دقايق وتعطّل الطابور.
check('«بدون Real»: دقيقة من غير نتيجة → يفتح التاب من الأول مرة، ودقيقة كمان → يقفله timeout',
  /const NOREAL_STALL_MS = 60 \* 1000;/.test(exec) && /const stallLimit = noReal \? NOREAL_STALL_MS : STALL_MS;/.test(exec)
  && /if \(noReal && !reopened && Date\.now\(\) - lastProgressAt >= stallLimit\) \{\s+reopened = true;/.test(exec));

// ٢٠٢٦-٠٩-٣٠: التاب التانى/التالت/الرابع ماكانتش بتتفتح — فحص «الموقع فاضى» كان بيتعمل على
// كل المهام المعلّقة (O(n²)): باتش ٤٦٠٠ خط + تاب شغّال = سحب ٧ث محلياً و>٢٠ث على الحقيقى،
// فجهاز التنفيذ يلغى الطلب. لازم الفحص على أول مهمة لكل موقع بس.
check('السحب بيفحص أول مهمة لكل موقع بس (من غيره: تاب واحدة مع الباتشات الكبيرة)',
  /FROM \(SELECT DISTINCT ON \(COALESCE\(h\.site, '10\.42\.187\.101'\)\) h\.\*/.test(routes)
  && /WHERE \$\{siteFreeFor\("e", "e\.site_k", lanes\)\}/.test(routes));

// ── السكربت ──
const ver = (script.match(/@version\s+(\d+)\.(\d+)/) || []).slice(1).map(Number);
check('السكربت v10.26 أو أحدث', ver[0] > 10 || (ver[0] === 10 && ver[1] >= 26));
check('رقم التاب بيتعرف من رقم الخط فى الرابط (نافذة جديدة مابتضيّعوش)', /new URLSearchParams\(location\.search\)\.get\("lineId"\)/.test(script));
check('رقم التاب من sf_lane ويتحفظ فى sessionStorage', /sf_lane=\(\\d\+\)/.test(script) && /sessionStorage\.setItem\(LANE_SESSION_KEY, LANE\)/.test(script));
for (const k of ['DZS_SF_ACCOUNTS', 'DZS_SF_META', 'DZS_LINE_INDEX', 'DZS_LINE_ARRAY_HASH', 'DZS_RESULTS', 'DZS_DOWNLOAD_DONE', 'DZS_RESET_TOKEN', 'DZS_FORCE_RT', 'DZS_FIX_MODE', 'DZS_MEASURE_MODE', 'DZS_NOREAL_PENDING']) {
  check(`مفتاح ${k} بلاحقة التاب`, new RegExp(`"${k}" \\+ LANE_SUFFIX`).test(script));
}
check('الـreset بيمسح مفاتيح تابه بس', (script.match(/clearMyLane\(\);/g) || []).length >= 2
  && !/Object\.keys\(localStorage\)\.filter\(k => k\.indexOf\("DZS_"\) === 0\)\.forEach/.test(script));

// ── «إيقاف PO» بتابات (٢٠٢٦-١٠-٠٦) ──
const po = read('dzs-profile-optimization.user.js');
const poLib = read('client/src/lib/profile-optimization.ts');
check('جهاز التنفيذ بيوزّع رقم تاب لـ«إيقاف PO» بمجموعته', /while \(poStopLanes\.has\(lane\)\) lane\+\+;/.test(exec) && /poStopLanes\.delete\(lane\)/.test(exec));
// المالك ٢٠٢٦-١٠-٠٦: ثانية واحدة — بـ٨ ثوانى كل تاب كان بيخلص قبل اللى بعده فالتوازى مابيبانش.
check('تابات «إيقاف PO» بتفتح بفاصل ثانية بعدّاد لوحده', /const STOP_STAGGER_MS = 1000;/.test(exec)
  && /if \(type === "stop"\) \{\s+const wait = nextStopOpenAt - Date\.now\(\);/.test(exec));
check('رقم التاب بيروح لرابط PO (sf_lane) ونافذة لكل تاب', /&sf_lane=\$\{lane\}/.test(poLib) && /lane \? `dzs_po_\$\{lane\}` : "dzs_measure"/.test(poLib));
const pv = (po.match(/@version\s+(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
check('سكربت PO v0.9.9 أو أحدث', pv[0] > 0 || pv[1] > 9 || (pv[1] === 9 && pv[2] >= 9));
check('سكربت PO: رقم التاب من sf_lane ويتحفظ فى sessionStorage', /sf_lane=\(\\d\+\)/.test(po) && /sessionStorage\.setItem\(LANE_SESSION_KEY, LANE\)/.test(po));
for (const k of ['PO_ACTIVE', 'PO_RESULTS', 'PO_DOWNLOADED', 'PO_ACCOUNTS', 'PO_INDEX', 'PO_MODE', 'PO_AFTER']) {
  check(`سكربت PO: مفتاح ${k} بلاحقة التاب`, new RegExp(`K\\("${k}"\\)`).test(po));
}
check('سكربت PO: مفيش مفتاح حالة مكتوب من غير لاحقة', !/localStorage\.(get|set|remove)Item\("PO_/.test(po));
check('سكربت القياس بيقف فى تاب PO (علامة PO_TAB)', /sessionStorage\.getItem\("PO_TAB"\) === "1"/.test(script) && /sessionStorage\.setItem\("PO_TAB", "1"\)/.test(po));

if (errors.length) {
  console.log('❌ check-noreal-lanes:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-noreal-lanes: «بدون Real» افتراضى ${lanes} تاب و«إيقاف PO» تابات من الإعدادات (سقف ${maxLanes})، وReal وباقى المواقع مهمة واحدة زى ما هم.`);
