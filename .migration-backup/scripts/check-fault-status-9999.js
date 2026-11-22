#!/usr/bin/env node
/**
 * سيرفس فلو: حالة «9999- أعطال تنتظر الحل» عطل حالى.
 *
 * ٢٠٢٦-٠٩-٢٧: كابينة 1-2 (دير الجنادلة) كان فيها ١٠ شكاوى. ٧ ظهروا واتقفلوا،
 * و٣ ماظهروش خالص فماحدش قفلهم. الـ٣ حالتهم «9999- أعــطال تنتــظـر الحــل»
 * ونوعهم 70/71 — والتعريف كان بياخد الحالات/الأنواع 160·173·122·73·72·60·81 بس.
 * (الـ٧ اللى ظهروا كانوا 138TTS_FO وظهروا عن طريق النوع «72 DSL- بيانات فقط».)
 * قرار المالك: حالة 9999 تتضاف لتعريف «الأعطال الحالية» فى كل مكان.
 *
 *   node scripts/check-fault-status-9999.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const routes = fs.readFileSync(path.join(__dirname, '../serviceflow/server/routes.ts'), 'utf8');
const all = routes.match(/status_code ~ '\^\(160\|173\|122[^']*'/g) || [];
const missing = all.filter((m) => !/\|9999\)'$/.test(m));
const errors = [];
if (all.length < 13) errors.push(`لقيت ${all.length} تعريف بس لحالات الأعطال — المفروض ١٣ على الأقل`);
if (missing.length) errors.push(`${missing.length} تعريف لحالات الأعطال من غير 9999 — شكاوى «تنتظر الحل» هتختفى منه`);
const ep = routes.slice(routes.indexOf('app.get("/api/reports/current-faults"'));
if (!/t\.status_code ~ '\^\(160\|173\|122\|73\|72\|60\|81\|9999\)'/.test(ep.slice(0, 2000))) errors.push('تقرير الأعطال الحالية نفسه مش بياخد 9999');
if (errors.length) {
  console.log('❌ check-fault-status-9999:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-fault-status-9999: ${all.length} تعريف لحالات الأعطال كلهم بياخدوا «9999 تنتظر الحل».`);
