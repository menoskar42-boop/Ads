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
check('NOREAL_LANES متعرّف (1 = القديم) ومايزيدش عن 3 (قرار المالك)', lanes >= 1 && lanes <= 3);
const helper = routes.slice(routes.indexOf('const siteFreeFor ='), routes.indexOf('app.post("/api/exec-queue/claim"'));
check('الاستثناء لمهام قياس «بدون Real» بس', /\$\{isNoRealJob\(e\)\}/.test(helper) && /\.type = 'measure' AND POSITION\('\$\{AUTO_MEASURE_NOREAL_MARK\}'/.test(routes));
check('بحد NOREAL_LANES', /< \$\{NOREAL_LANES\}/.test(helper));
check('بشرط إن الشغّال كله «بدون Real» (Real/رفع/إيقاف بيقفلوا الموقع)', /AND NOT \$\{isNoRealJob\("b"\)\}/.test(helper));
check('وإن مفيش مهمة من نوع تانى قبله فى الطابور (Real مايتجوّعش)', /AND NOT \$\{isNoRealJob\("x"\)\}\s+AND \$\{queueRank\("x"\)\} < \$\{queueRank\(e\)\}/.test(helper));
const claim = routes.slice(routes.indexOf('app.post("/api/exec-queue/claim"'), routes.indexOf('app.post("/api/exec-queue/:id/done"'));
check('الاختيار والـUPDATE الاتنين بنفس القاعدة', /siteFreeFor\("e", /.test(claim) && /siteFreeFor\("exec_jobs", "\$3"\)/.test(claim));
check('إنقاذ المهام اليتيمة مابيعتبرش التاب التانى دليل إن الأول اتعدّى', /AND NOT \(\$\{isNoRealJob\("e"\)\} AND \$\{isNoRealJob\("j2"\)\}\)/.test(routes));

// ── جهاز التنفيذ ──
check('تاب لكل مسار (dzs_measure_2)', /export function measureTabName\(lane\?: number\)/.test(lib) && /measureTabName\(opts\?\.noReal \? opts\.lane : undefined\)/.test(lib));
check('sf_lane فى الهاش لـ«بدون Real» التانى بس', /"&sf_mode=noreal" \+ \(opts\.lane && opts\.lane > 1 \? `&sf_lane=\$\{opts\.lane\}` : ""\)/.test(lib));
check('قفل «التاب الأخير» لنفس المسار بس', /lastMeasureWin\.current\.get\(lane\)/.test(exec) && /lastMeasureWin\.current\.set\(lane, win\)/.test(exec));
check('رقم التاب = أول رقم فاضى (مش متثبّت على ٢)', /while \(noRealLanes\.has\(lane\)\) lane\+\+;/.test(exec));
check('المهام الشغّالة متتبّعة بالمسار مش بالموقع', /running\.set\(laneKey,/.test(exec) && /running\.delete\(laneKey\)/.test(exec) && /noRealLanes\.delete\(lane\)/.test(exec));

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

if (errors.length) {
  console.log('❌ check-noreal-lanes:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-noreal-lanes: «بدون Real» لحد ${lanes} تاب، وReal وباقى المواقع مهمة واحدة زى ما هم.`);
