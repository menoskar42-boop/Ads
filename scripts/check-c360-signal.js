#!/usr/bin/env node
/**
 * check-c360-signal — الباتش اللى فى تاب واحد بيخلص لما **آخر** رقم يخلص.
 *
 * الخلفية: c360 مالوش تقسيم (NO_SPLIT_TYPES) — المنفّذ بيبعت كل الأرقام فى هاش
 * واحد، والسكربت بيلفّ عليها بالترتيب جوّه نفس التاب (تسجيل دخول واحد).
 *
 * الغلطة اللى كانت: إشارة الانتهاء كانت أول رقم (accs[0]). أول ما الرقم رقم ١
 * ياخد أكونت، المنفّذ يقول «خلصت» ويقفل التاب — والباقى ما ينفّذش. المستخدم
 * بيشوف كام خط اتحدّثوا وبعدين كل حاجة بتقف من غير سبب ظاهر.
 *
 * الفحص بيتأكد إن:
 *   ١. مفتاح الإشارة لـc360 = آخر عنصر، مش أول عنصر.
 *   ٢. المهلة بتتدرّج بعدد الأرقام — مهلة ثابتة بتقطع الباتش الكبير فى نُصّه.
 *   ٣. c360 لسه فى NO_SPLIT_TYPES على السيرفر (لو اتقسم، الإشارة دى تبقى غلط).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BTN = path.join(ROOT, 'serviceflow/client/src/components/ExecutorButton.tsx');
const ROUTES = path.join(ROOT, 'serviceflow/server/routes.ts');
const errors = [];

if (!fs.existsSync(BTN)) {
  console.log('check-c360-signal: مفيش ExecutorButton.tsx — تخطّى');
  process.exit(0);
}
const btn = fs.readFileSync(BTN, 'utf8');

// ── ١. الإشارة = آخر رقم ──────────────────────────────────────────────────
const m = btn.match(/const sigKey\s*=\s*(.+?);/s);
if (!m) {
  errors.push('مالقيتش تعريف sigKey — إشارة انتهاء العمليات اتغيّر شكلها');
} else {
  const decl = m[1];
  if (/"c360"\s*\?\s*accs\[0\]/.test(decl)) {
    errors.push('sigKey لـc360 = accs[0] (أول رقم) — التاب هيتقفل بعد أول رقم والباقى ما ينفّذش');
  }
  if (!/"c360"\s*\?\s*accs\[accs\.length - 1\]/.test(decl)) {
    errors.push('sigKey لـc360 مش آخر رقم — السكربت بيلفّ بالترتيب فآخر رقم هو علامة الخلاص');
  }
}

// ── ٢. المهلة بتتدرّج بالعدد ──────────────────────────────────────────────
const dl = btn.match(/const deadline = Date\.now\(\) \+ ([\s\S]{0,220}?);/);
if (!dl) {
  errors.push('مالقيتش حساب deadline فى مسار العمليات');
} else if (!/type === "c360"[\s\S]*accs\.length \*/.test(dl[1])) {
  errors.push('مهلة c360 ثابتة — الباتش الكبير (١٠٤ رقم ببازل يدوى) هيتقطع فى نُصّه');
}

// ── ٣. c360 لسه مابيتقسّمش على السيرفر ────────────────────────────────────
if (fs.existsSync(ROUTES)) {
  const routes = fs.readFileSync(ROUTES, 'utf8');
  const ns = routes.match(/const NO_SPLIT_TYPES = new Set\(\[(.*?)\]\)/s);
  if (!ns) {
    errors.push('مالقيتش NO_SPLIT_TYPES فى routes.ts');
  } else if (!/"c360"/.test(ns[1])) {
    errors.push('c360 اتشال من NO_SPLIT_TYPES — بقى بيتقسّم رقم-رقم، فإشارة «آخر رقم» بقت غلط');
  }
}

if (errors.length) {
  console.error('❌ check-c360-signal:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✅ check-c360-signal: الباتش بيخلص بآخر رقم، والمهلة بتتدرّج بالعدد');
