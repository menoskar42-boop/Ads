#!/usr/bin/env node
'use strict';
// حارس استهلاك Supabase للكتاب المقدس (٢٠٢٦-١٠-٢٨): pg_stat_statements على مشروع clinicalflow طلّع إن
// أكبر سحب كان `select * from group_reading_logs where group_id = $1` — ٥٠٨ مليون صف فى ١٠٤٤٦ نداء
// (~٤٨ ألف صف كل مرة) من /leaderboard و/missions، وده اللى خلّص حصة الـEgress (9.49 من 5 جيجا).
// الاتنين بقوا يحسبوا جوّه القاعدة. الحارس بيمنع رجوع السحب الكامل فى الراوتين دول.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../mybible/server/group-routes.ts'), 'utf8');
const between = (a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + 1); return i < 0 ? '' : src.slice(i, j < 0 ? undefined : j); };
const problems = [];
const lb = between("app.get('/api/groups/:code/leaderboard'", 'app.get(');
const ms = between("app.get('/api/groups/:code/missions'", 'app.get(');
if (!lb) problems.push('راوت leaderboard مش موجود');
if (!ms) problems.push('راوت missions مش موجود');
for (const [name, body] of [['leaderboard', lb], ['missions', ms]]) {
  if (/from\(groupReadingLogs\)/.test(body)) problems.push(`${name}: رجع يسحب group_reading_logs كله (db.select().from(groupReadingLogs))`);
}
if (!/GROUP BY user_name\s+ORDER BY chapters DESC\s+LIMIT 10/.test(lb)) problems.push('leaderboard: الحساب لازم يفضل جوّه القاعدة (GROUP BY ... LIMIT 10)');
if (!/chapter BETWEEN \$3 AND \$4\s+GROUP BY user_name/.test(ms)) problems.push('missions: عدّ قرايات المهمة لازم يفضل جوّه القاعدة');
if (!/db\.select\(\{ userName: groupMembers\.userName \}\)/.test(ms)) problems.push('missions: الأعضاء بالأسامى بس (مش كل الأعمدة)');
if (problems.length) { console.error('❌ ' + problems.length + ' مشكلة'); problems.forEach((p) => console.error('  - ' + p)); process.exit(1); }
console.log('✅ ترتيب القراءة والمهمة بيتحسبوا جوّه القاعدة — مفيش سحب لسجل القراية كله (Egress)');
