#!/usr/bin/env node
/**
 * check-poll-budget — تاب واحد مايعدّيش ميزانية النداء.
 *
 * ٢٠٢٦-٠٩-١٩: الموقع وقع بـCloudflare Error 1027 (تعدّى حد الخطة). السبب
 * مكانش حِمل زوّار — كان **تاب واحد** من جهاز التنفيذ:
 *
 *   تحديث الطابور ٥ث (١٢/د) · سحب المهام ٤ث ×٢ (٣٠/د) · نبضة ٢٠ث (٣/د) ·
 *   حارس ٣٠ث (٢/د) · متابعة المهمة ٥ث ×٢ (٢٤/د)  =  ~٧١ طلب/دقيقة
 *
 *   ٧١ × ٦٠ × ٢٤ = ١٠٢,٢٤٠ طلب/يوم — والخطة المجانية ١٠٠,٠٠٠.
 *
 * وكل سَبدومين على oscardevs.com بيعدّى على نفس الـWorker، فالكوتة دى
 * **مشتركة مع متاجر العملاء** — أداة داخلية قدرت تقفل متاجر التجار.
 *
 * الفحص بيحسب الطلبات/الدقيقة من الثوابت نفسها ويرفض تعديّ الميزانية.
 * مش بيطابق نص — بيقيس.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'serviceflow/client/src/components/ExecutorButton.tsx');

// ٣٠ طلب/دقيقة = ٤٣,٢٠٠/يوم للتاب الواحد. بيسيب مساحة لتابين + متاجر العملاء
// تحت سقف الـ١٠٠ ألف. أى رفع للسقف ده قرار تشغيلى مش تفصيلة.
const BUDGET_PER_MIN = 32;

if (!fs.existsSync(FILE)) {
  console.log('check-poll-budget: مفيش ExecutorButton.tsx — تخطّى');
  process.exit(0);
}
const src = fs.readFileSync(FILE, 'utf8');
const errors = [];

// كل ثابت + عدد الطلبات اللى بيطلّعها كل دورة
const POLLS = [
  ['WATCH_MS',     1, 'تحديث حالة الطابور'],
  ['HEARTBEAT_MS', 1, 'نبضة الجهاز'],
  ['CLAIM_MS',     2, 'سحب المهام + عدّاد المنتظر'],
  ['WATCHDOG_MS',  1, 'حارس التعليق'],
  ['JOB_POLL_MS',  2, 'متابعة المهمة الجارية'],
];

let total = 0;
const rows = [];
for (const [name, perTick, label] of POLLS) {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([^;]+);`));
  if (!m) { errors.push(`مفيش ثابت ${name} — الفترة اترجعت لرقم مكتوب فى مكانها`); continue; }
  let ms;
  try { ms = Function(`"use strict";return (${m[1]})`)(); } catch { ms = NaN; }
  if (!Number.isFinite(ms) || ms <= 0) { errors.push(`${name} مش رقم صالح: ${m[1]}`); continue; }
  const perMin = (60_000 / ms) * perTick;
  total += perMin;
  rows.push(`${label}: كل ${Math.round(ms / 1000)}ث ×${perTick} = ${perMin.toFixed(1)}/د`);
}

// أى setInterval/sleep برقم مكتوب فى مكانه بيلفّ حوالين الميزانية
const raw = [];
src.split('\n').forEach((line, i) => {
  if (/setInterval\([^,]+,\s*\d+\s*\*?\s*\d*\s*\)/.test(line)) raw.push(`${i + 1}: ${line.trim()}`);
});
if (raw.length) {
  errors.push('فيه setInterval برقم مكتوب فى مكانه — مش داخل الحساب:\n      ' + raw.join('\n      '));
}

if (total > BUDGET_PER_MIN) {
  errors.push(`إجمالى النداء ${total.toFixed(1)} طلب/دقيقة (${Math.round(total * 60 * 24).toLocaleString('en-US')}/يوم) — `
    + `فوق الميزانية ${BUDGET_PER_MIN}/دقيقة. الكوتة مشتركة مع متاجر العملاء.`);
}

if (errors.length) {
  console.error('❌ check-poll-budget:');
  for (const e of errors) console.error('  - ' + e);
  console.error('  التفصيل: ' + rows.join(' · '));
  process.exit(1);
}
console.log(`✅ check-poll-budget: ${total.toFixed(1)} طلب/دقيقة للتاب (${Math.round(total * 60 * 24).toLocaleString('en-US')}/يوم) — تحت ${BUDGET_PER_MIN}/د`);
console.log('   ' + rows.join(' · '));
