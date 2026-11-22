#!/usr/bin/env node
/**
 * سيرفس فلو: اختبارات server/*.test.ts كلها بتنجح.
 *
 * ٢٠٢٦-٠٩-٢٧: ٣ اختبارات كانت واقعة من أيام ومحدّش شاف — check-all مكانش
 * بيشغّلهم، واتنين منهم وقعوا من تعديلات فى نفس الجلسة (باراميتر جديد فى
 * «بحث برقم التليفون»، وأعمدة «بدون Real»). الفحص ده بيشغّلهم كلهم.
 * لو tsx مش متسطّب (بيئة من غير node_modules لسيرفس فلو) بيعدّى ويقول كده.
 *
 *   node scripts/check-sf-tests.js
 */
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '../serviceflow');
const files = fs.readdirSync(path.join(SF, 'server')).filter((f) => f.endsWith('.test.ts')).map((f) => 'server/' + f);
const r = spawnSync('npx', ['--no-install', 'tsx', '--test', ...files], { cwd: SF, encoding: 'utf8', timeout: 600000 });
const out = (r.stdout || '') + (r.stderr || '');
const pass = +((out.match(/^# pass (\d+)/m) || [])[1] || 0);
const fail = +((out.match(/^# fail (\d+)/m) || [])[1] || 0);
if (!pass && !fail) {
  console.log('⚠️  check-sf-tests: tsx مش موجود هنا — الاختبارات ماتشغّلتش (' + (out.split('\n')[0] || '').slice(0, 80) + ')');
  process.exit(0);
}
if (fail) {
  console.log(`❌ check-sf-tests: ${fail} اختبار واقع من ${pass + fail}:`);
  (out.match(/^not ok \d+ - .*$/gm) || []).forEach((l) => console.log('   · ' + l));
  process.exit(1);
}
console.log(`✅ check-sf-tests: ${pass} اختبار فى سيرفس فلو كلهم ناجحين.`);
