#!/usr/bin/env node
/**
 * سيرفس فلو: «إغلاق العطل الجسيم مركز الصيانة» بياخد سعة وخطوط **نفس الكابينة**.
 *
 * ٢٠٢٦-٠٩-٢٧: كابينة 2-1 (دير الجنادلة) بكس 1 طلع «سعة 10 · 22 خط». الاتنين
 * غلط: المطابقة كانت أى صف رقمه التانى = رقم الكابينة، فالسعة جت من بكس 1 فى
 * كابينة 3-1، والخطوط اتعدّت من 1-1 و2-1 و3-1 مع بعض (الصح ٨). وعلى مستوى
 * الكابينة كله كانت ١٢٣١ خط بدل ٥٦٤. أى بكس مش موجود فى الكابينة الغلط كان
 * بيطلع من غير سعة. اتجرّب بالكود الحقيقى على PG.
 *
 *   node scripts/check-major-fault-cabinet.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const routes = fs.readFileSync(path.join(__dirname, '../serviceflow/server/routes.ts'), 'utf8');
const a = routes.indexOf('app.get("/api/reports/major-fault-closure/stats"');
const ep = a >= 0 ? routes.slice(a, routes.indexOf('\n  });\n', a)) : '';
const errors = [];
if (!ep) errors.push('endpoint السعة مش موجود');
if (!/CASE WHEN \$\{rawPair\} ~ '\^\[0-9\]\+-\[0-9\]\+\$'\s+THEN \$\{compact\} = \$\{rawPair\}/.test(ep)) {
  errors.push('الكابينة المعروفة بكابلها (2-1) لازم تتطابق بالظبط — مش بأى صف رقمه التانى نفس الكابينة');
}
if ((ep.match(/\$\{cabinMatches\("(cabin_number|cabinet_no)"\)\}/g) || []).length < 4) {
  errors.push('كل الاستعلامات (سعة الكابينة · خطوط الكابينة · البكسيات · خطوط البكسيات) لازم تستخدم cabinMatches');
}
if (errors.length) {
  console.log('❌ check-major-fault-cabinet:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-major-fault-cabinet: السعة والخطوط العاملة من نفس الكابينة والكابل بس.');
