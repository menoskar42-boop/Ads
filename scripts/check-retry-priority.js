#!/usr/bin/env node
/**
 * check-retry-priority — «إعادة تنفيذ بعد إيرور» بتفضل فى نفس مستوى باتشها الأصلى.
 *
 * قرار المالك (٢٠٢٦-٠٩-٢٨): إعادة باتش ٩ الصبح (مؤجّل) كانت بتطلع فى «الأولوية
 * العليا» لأن requeueErroredJobs كانت بتحط أولوية 3 ثابتة لكل إعادة. المطلوب:
 *   · الأصلى فى العليا → الإعادة فى العليا (نفس الأولوية).
 *   · الأصلى مؤجّل → الإعادة مؤجّلة بس رقم 1 (queue_order = 1 والمرتّبين ينزلوا خطوة).
 *   · الإعادات القديمة (3) اللى لسه فى الطابور بترجع لأولوية باتشها.
 *
 *   الاختبار الحقيقى: DATABASE_URL=… npx tsx serviceflow/scripts/test-retry-priority.mts
 */
'use strict';
const fs = require('fs');
const path = require('path');
const routes = fs.readFileSync(path.join(__dirname, '..', 'serviceflow', 'server', 'routes.ts'), 'utf8');
const i = routes.indexOf('const requeueErroredJobs = async');
const fn = i >= 0 ? routes.slice(i, routes.indexOf('const expireOrphanedExecJobs', i)) : '';

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };

need(fn, 'requeueErroredJobs مش موجودة.');
const ins = fn.slice(fn.indexOf('INSERT INTO exec_jobs'), fn.indexOf('RETURNING id'));
need(/p\.priority, COALESCE\(p\.batch_id, 'b'\) \|\| '-r1'/.test(ins),
  'الإعادة لازم تاخد أولوية الباتش الأصلى (p.priority) — أولوية ثابتة بتطلّع المؤجّل فى «الأولوية العليا».');
need(!/\n\s*3, COALESCE\(p\.batch_id/.test(ins), 'أولوية 3 الثابتة للإعادة رجعت.');
need(/CASE WHEN p\.priority = 0 THEN 1 ELSE 0 END/.test(ins), 'الإعادة من باتش مؤجّل لازم تبقى رقم 1 (queue_order = 1).');
need(/shift AS \(\s*[\s\S]*?UPDATE exec_jobs s SET queue_order = s\.queue_order \+ 1[\s\S]*?EXISTS \(SELECT 1 FROM picked WHERE picked\.priority = 0\)/.test(fn),
  'المؤجّلة المرتّبة لازم تنزل خطوة لما إعادة مؤجّلة تدخل رقم 1 — غير كده بتتعادل مع رقم 1 القديم.');
need(/WHERE r\.retry_round = 1 AND r\.priority = 3 AND r\.status IN \('pending','claimed'\)/.test(fn),
  'الإعادات القديمة (أولوية 3) اللى لسه فى الطابور لازم ترجع لأولوية باتشها.');

if (errors.length) {
  console.log('❌ check-retry-priority:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-retry-priority: إعادة الإيرور بتفضل فى مستوى باتشها — والمؤجّلة رقم 1 فى المؤجّلة.');
