#!/usr/bin/env node
/**
 * سيرفس فلو: حارس تعليق القياس بيقيس «مفيش خط جديد اتقاس» مش «من أول الباتش».
 *
 * ٢٠٢٦-٠٩-٢٥: «الطابور بيعلق كتير وبيقف». الحارس كان `Date.now() - measureStartedAt
 * >= STALL_MS` (٣ دقايق من **البداية**) رغم إن تعليقه بيقول «مفيش تقدّم». فأى باتش
 * قياس أطول من ٣ دقايق — ٤-٥ خطوط بدون Real، كل خط لحد ٤٥ث — كان بيتقطع وهو
 * شغّال ويعمل ريفريش للصفحة، والريفريش بيقتل كل المسارات التانية (weoas…).
 *
 *   node scripts/check-measure-stall.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../serviceflow/client/src/components/ExecutorButton.tsx'), 'utf8');
const errors = [];
const a = src.indexOf('if (type === "measure") {');
const b = src.indexOf('const raiseWithStop', a);
const m = a >= 0 && b > a ? src.slice(a, b) : '';
if (!m) errors.push('مسار القياس فى runBatch مش موجود');
if (/measureStartedAt/.test(m)) errors.push('الحارس بيقيس من أول الباتش (measureStartedAt) — الباتش الطويل بيتقطع وهو شغّال');
if (!/if \(chk\.measured > lastMeasured\) \{ lastMeasured = chk\.measured; lastProgressAt = Date\.now\(\); \}/.test(m)) {
  errors.push('آخر تقدّم لازم يتحدّث مع كل خط جديد اتقاس');
}
if (!/if \(Date\.now\(\) - lastProgressAt >= STALL_MS\)/.test(m)) errors.push('الحارس لازم يقيس من آخر تقدّم');
if (errors.length) {
  console.log('❌ check-measure-stall:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-measure-stall: باتش القياس بيتقطع لو مفيش خط اتقاس من ٣ دقايق بس — مش لأنه طويل.');
