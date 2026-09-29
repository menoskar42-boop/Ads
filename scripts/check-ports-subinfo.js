#!/usr/bin/env node
/**
 * check-ports-subinfo — مراجعة البيان الفنى اليومية ١٢ الضهر لأرقام تقرير
 * «بورتات MSAN بلا بيان فنى أو اسم/عنوان» (قرار المالك ٢٠٢٦-٠٩-٢٩).
 *
 * بيتأكد من:
 *   · التقرير والمراجعة اليومية بياخدوا نفس الشروط (PORTS_MISSING_*) — مفيش نسختين تتفرقوا.
 *   · الساعة ١٢، والحجز مرة فى اليوم فى app_state، ومفكوك لو الإضافة فشلت.
 *   · مستبعد منها أى رقم ليه subinfo فى الطابور (notQueuedSql).
 *   · بتتنادى من الإقلاع والـtick **والنبضة** (النسخة المستضافة مؤقتاتها مقفولة).
 *
 *   الاختبار الحقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-ports-subinfo.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const routes = fs.readFileSync(path.join(__dirname, '..', 'serviceflow', 'server', 'routes.ts'), 'utf8');

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };

const rep = routes.slice(routes.indexOf('app.get("/api/reports/ports-missing-line-data"'));
const repBody = rep.slice(0, rep.indexOf('\n  });'));
need(/const conds: string\[\] = \[\.\.\.PORTS_MISSING_BASE_CONDS\];/.test(repBody) && /const joinClause = PORTS_MISSING_FROM_SQL;/.test(repBody),
  'التقرير لازم ياخد الشروط من PORTS_MISSING_* — غير كده المراجعة اليومية ممكن تراجع أرقام غير اللى فى التقرير.');

const i = routes.indexOf('const runPortsMissingSubinfo = async');
const fn = i >= 0 ? routes.slice(i, routes.indexOf('\n  };\n', i)) : '';
need(fn, 'runPortsMissingSubinfo مش موجودة — المراجعة اليومية ١٢ الضهر اتشالت.');
need(/const PORTS_SUBINFO_HOUR = 12;/.test(routes), 'الميعاد لازم يفضل ١٢ الضهر (قرار المالك).');
need(/WHERE \$\{PORTS_MISSING_BASE_CONDS\.join\(" AND "\)\}/.test(fn) && /\$\{PORTS_MISSING_FROM_SQL\}/.test(fn),
  'المراجعة اليومية لازم تاخد نفس شروط التقرير (PORTS_MISSING_*).');
need(/notQueuedSql\("pp\.phone_number", \["subinfo"\]\)/.test(fn), 'لازم تستبعد الأرقام اللى ليها مراجعة فى الطابور.');
need(/enqueueAutoBatch\("subinfo", phones,/.test(fn), 'لازم تضيف مهام subinfo (مراجعة البيان الفنى).');
need(/'ports_missing_subinfo_last_day'[\s\S]*?WHERE app_state\.value IS DISTINCT FROM \$1/.test(fn), 'الحجز لازم يبقى مرة فى اليوم فى app_state.');
need(/DELETE FROM app_state WHERE key = 'ports_missing_subinfo_last_day' AND value = \$1/.test(fn), 'لو الإضافة فشلت لازم الحجز يتفك.');

for (const t of ['boot', 'tick', 'heartbeat']) {
  need(routes.includes(`void runPortsMissingSubinfo("${t}");`), `runPortsMissingSubinfo لازم تتنادى من ${t}.`);
}
const hb = routes.slice(routes.indexOf('app.post("/api/exec-queue/heartbeat"'), routes.indexOf('app.post("/api/exec-queue/request-reload"'));
need(/void runPortsMissingSubinfo\("heartbeat"\);/.test(hb), 'نداء النبضة لازم يبقى جوّه /heartbeat نفسه.');

if (errors.length) {
  console.log('❌ check-ports-subinfo:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-ports-subinfo: مراجعة البيان الفنى ١٢ الضهر لنفس أرقام التقرير، مرة فى اليوم، ومن النبضة كمان.');
