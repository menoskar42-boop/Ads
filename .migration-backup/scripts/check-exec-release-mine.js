#!/usr/bin/env node
/**
 * سيرفس فلو: تاب جهاز التنفيذ بعد الريفريش بيرجّع مهامه «الشبح» فوراً،
 * والرفع اليدوى بيعمل ريفريش لجهاز التنفيذ.
 *
 * ٢٠٢٦-٠٩-٢٨: «القياس واقف مستنى قياس آخر ومفيش قياس آخر» — وبعد ٤ دقايق اشتغل
 * لوحده. التاب اتقفل/اتعمله ريفريش وهو شغّال، فالمهمة فضلت claimed والموقع «مشغول»
 * لحد مهلة الإنقاذ. دلوقتي كل تاب ليه رقم (sessionStorage، بيعيش مع الريفريش)
 * بيتسجّل فى executed_by، وأول ما التاب يفتح بيرجّع مهام رقمه هو بس للطابور.
 * وبعد أى رفع يدوى: ريفريش لجهاز التنفيذ (رسالة «مانع فتح التابات» كانت بتظهر).
 *
 *   node scripts/check-exec-release-mine.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const SF = path.join(__dirname, '../serviceflow');
const read = (f) => fs.readFileSync(path.join(SF, f), 'utf8');
const routes = read('server/routes.ts');
const exec = read('client/src/components/ExecutorButton.tsx');
const lib = read('client/src/lib/exec-queue.ts');
const up = read('client/src/components/FileUploadSection.tsx');
const wo = read('client/src/components/WorkOrdersReport.tsx');
const errors = [];
const check = (l, ok) => { if (!ok) errors.push(l); };
check('رقم التاب فى sessionStorage', /export function execTabId\(\)[\s\S]{0,200}sessionStorage\.getItem\("sf_exec_tab"\)/.test(lib));
check('رقم التاب جوّه هوية الجهاز اللى بتتسجّل على المهمة', /const device = `\$\{execDeviceLabel\(\)\} · تاب \$\{execTabId\(\)\}`;/.test(exec));
check('التاب بيرجّع مهامه قبل أول سحب', /void releaseMine\(\)\.finally\(\(\) => \{ if \(!stopped\) pump\(\); \}\);/.test(exec));
const ep = routes.slice(routes.indexOf('app.post("/api/exec-queue/release-mine"'));
check('release-mine موجود ومقفول على السوبر أدمن', /app\.post\("\/api\/exec-queue\/release-mine", requireAuth, requireSuperAdmin/.test(routes));
check('بيرفض من غير رقم تاب (مايرجّعش مهام جهاز كامل فيه تابات تانية)', / · تاب \[a-z0-9\]\+\$\/i\.test\(dev\)/.test(ep.slice(0, 800)));
check('بيرجّع مهام التاب ده بس (executed_by بالظبط)', /WHERE status = 'claimed' AND executed_by = \$1/.test(ep.slice(0, 1200)));
check('رفع الملفات اليدوى بيطلب ريفريش لجهاز التنفيذ', /void requestExecReloadQuiet\(\);/.test(up) && /void requestExecReloadQuiet\(\);/.test(wo));
if (errors.length) {
  console.log('❌ check-exec-release-mine:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-exec-release-mine: الريفريش بيرجّع مهام التاب فوراً، والرفع اليدوى بيعمل ريفريش لجهاز التنفيذ.');
