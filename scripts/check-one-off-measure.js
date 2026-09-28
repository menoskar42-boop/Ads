#!/usr/bin/env node
/**
 * check-one-off-measure — قياس ٩ الصبح لليومين، وتشغيل استثنائى واحد بعد النشر.
 *
 * قرار المالك (٢٠٢٦-٠٩-٢٨): باتش القياس اليومى ياخد الخطوط اللى آخر قياس ليها
 * أقدم من **يومين** (كانت ٤)، ويتعمل **مرة استثنائية** بعد نشر التعديل ده، وبعدها
 * ٩ الصبح كل يوم عادى. والاستثنائى مايخدش اللى فى الطابور دلوقتى.
 *
 * بيتأكد من:
 *   · AUTO_MEASURE_STALE_DAYS = 2.
 *   · runOneOffMeasure بتتنادى من الإقلاع والـtick جوّه schedulersEnabled (عملية
 *     واحدة بس بتملك المؤقتات).
 *   · الحجز بعلامة ثابتة فى app_state (مايتكررش مع ريستارت)، ومفكوك لو الإضافة فشلت.
 *   · مابيلمسش auto_batches_last_day (باتش ٩ الصبح بكرة يشتغل عادى).
 *   · بياخد الخطوط من نفس دوال باتش ٩ الصبح (فيها notQueuedSql للقياس).
 *
 *   الاختبار الحقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-one-off-measure.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const routes = fs.readFileSync(path.join(__dirname, '..', 'serviceflow', 'server', 'routes.ts'), 'utf8');

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };

need(/const AUTO_MEASURE_STALE_DAYS = 2;/.test(routes), 'شرط القياس اليومى لازم يكون يومين (قرار المالك ٢٠٢٦-٠٩-٢٨).');

const i = routes.indexOf('const runOneOffMeasure = async');
need(i >= 0, 'runOneOffMeasure مش موجودة — التشغيل الاستثنائى بعد النشر اتشال.');
const fn = i >= 0 ? routes.slice(i, routes.indexOf('\n  };\n', i)) : '';
need(/const ONE_OFF_MEASURE_TAG = "[^"]+";/.test(routes), 'لازم علامة ثابتة للتشغيل الاستثنائى.');
need(/INSERT INTO app_state \(key, value, updated_at\) VALUES \('auto_measure_one_off', \$1, now\(\)\)[\s\S]*?WHERE app_state\.value IS DISTINCT FROM \$1[\s\S]*?RETURNING value/.test(fn)
  && /if \(!claim\.rowCount\) return;/.test(fn),
  'الحجز لازم يبقى جملة شرطية واحدة على app_state — غير كده ممكن يتكرر مع كل ريستارت.');
need(!/auto_batches_last_day/.test(fn), 'التشغيل الاستثنائى مايلمسش auto_batches_last_day — باتش ٩ الصبح يفضل زى ما هو.');
need(/await autoMeasureAccounts\(\)/.test(fn) && /await autoComplaintNoMeasureAccounts\(legacyMeasAccs\)/.test(fn),
  'الاستثنائى لازم ياخد خطوطه من نفس دوال باتش ٩ الصبح (اللى بتستبعد اللى فى الطابور).');
need(/enqueueAutoBatch\(\s*"measure", measAccs,[\s\S]*?\$\{AUTO_MEASURE_NOREAL_MARK\}`\)/.test(fn), 'الاستثنائى لازم يبقى قياس «بدون Real» زى باتش ٩ الصبح.');
need(/if \(claimed\) \{\s*await pool\.query\(`DELETE FROM app_state WHERE key = 'auto_measure_one_off' AND value = \$1`/.test(fn),
  'لو الإضافة فشلت لازم الحجز يتفك — غير كده الاستثنائى مايتعملش أبداً.');

const sched = routes.slice(routes.indexOf('if (schedulersEnabled()) {'), routes.indexOf('wakeup.unref(); tick.unref();'));
need(/runOneOffMeasure\("boot"\)/.test(sched) && /runOneOffMeasure\("tick"\)/.test(sched),
  'runOneOffMeasure لازم تتنادى من الإقلاع والـtick جوّه schedulersEnabled.');
need((routes.match(/runOneOffMeasure\(/g) || []).length === 2, 'runOneOffMeasure بتتنادى من مكان برّه المؤقتات.');

for (const [f, re] of [
  ['serviceflow/server/auto-daily-batches.test.ts', /AUTO_MEASURE_STALE_DAYS = 2;/],
  ['serviceflow/client/src/components/QueueReorderPanel.tsx', /أقدم من يومين/],
]) {
  need(re.test(fs.readFileSync(path.join(__dirname, '..', f), 'utf8')), `${f} لسه بيقول الشرط القديم.`);
}

if (errors.length) {
  console.log('❌ check-one-off-measure:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-one-off-measure: قياس ٩ الصبح لليومين، والاستثنائى مرة واحدة بعد النشر من غير ما يلمس الطابور ولا باتش بكرة.');
