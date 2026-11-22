#!/usr/bin/env node
/**
 * أي متغيّر بيئة جديد في Service Flow لازم يبقى مكتوب في دليل الاستضافة.
 *
 * ليه: التطبيق ده اتنقل من نشر مستقل (كان بياخد متغيّراته من Secrets
 * بتاعته) لاستضافة جوّه أوسكار ديفز (بياخدها من Secrets بتاعة أوسكار
 * ديفز). فلو حد ضاف متغيّر جديد في الكود ومحدّش نقله، **الميزة بتتقفل في
 * صمت** — مفيش خطأ، مفيش لوج، بس حاجة مش شغّالة والوحيد اللي هيلاحظ هو
 * اللي بيدوّر عليها.
 *
 * وأسوأ حالة اتشافت فعلاً: خمس توكنات ليها **قيم بديلة مكتوبة في الكود**
 * (`sf-auto-upload-2026` وإخواتها) والمصدر على جيت‌هب عام. متغيّر زي ده
 * مش متظبّط معناه إن التوكن الحقيقي هو اللي في الريبو.
 *
 * الفحص بيستخرج كل `process.env.X` من `serviceflow/` ويقارنها بالجدول
 * في `docs/SERVICEFLOW_COHOST.md`. أي متغيّر في الكود مش في الدليل =
 * سقوط، ومعاه اسمه ومكانه.
 *
 * وبيمسك الاتجاه التاني كمان: متغيّر في الدليل واختفى من الكود — دليل
 * بيقول انقل حاجة مالهاش لازمة.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'serviceflow');
const DOC = path.join(ROOT, 'docs/SERVICEFLOW_COHOST.md');

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

if (!fs.existsSync(APP)) {
  console.log('⏭️  serviceflow مش موجود هنا — مفيش حاجة تتفحص');
  process.exit(0);
}
if (!fs.existsSync(DOC)) { fail('docs/SERVICEFLOW_COHOST.md مش موجود'); process.exit(1); }

/* متغيّرات بتتحقن من الاستضافة نفسها — مش لازم تكون في جدول «انقلها». */
const PROVIDED = new Set(['SF_SCHEDULERS']);

/* ── اجمع كل process.env.X من كود التطبيق ─────────────────────────────── */
const found = new Map();   // VAR -> أول مكان اتشاف فيه
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) continue;
    if (/\.test\.(ts|js)$/.test(entry.name)) continue;
    const src = fs.readFileSync(full, 'utf8');
    for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
      if (!found.has(m[1])) found.set(m[1], path.relative(ROOT, full));
    }
  }
}
for (const sub of ['server', 'shared', 'script', 'scripts', 'client']) {
  const d = path.join(APP, sub);
  if (fs.existsSync(d)) walk(d);
}
/* ملفات إعداد فى جذر التطبيق بتقرا متغيّرات كمان — vite.config.ts بياخد منها
 * مسار الجذر (SF_BASE_PATH). من غيرها الفحص بيقول «مكتوب فى الدليل ومفيش ليه
 * أثر فى الكود» على متغيّر مستخدم فعلاً وقت البناء. */
for (const f of ['vite.config.ts', 'drizzle.config.ts']) {
  const full = path.join(APP, f);
  if (!fs.existsSync(full)) continue;
  const src = fs.readFileSync(full, 'utf8');
  for (const m of src.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
    if (!found.has(m[1])) found.set(m[1], path.relative(ROOT, full));
  }
}

if (found.size < 5) {
  fail(`مالقيتش غير ${found.size} متغيّر في كود Service Flow — يا إما المجلد اتفضّى `
    + 'يا إما الصيغة اتغيّرت. الفحص مش قادر يقيس.');
  process.exit(1);
}

/* ── إيه المكتوب في الدليل ────────────────────────────────────────────── */
const doc = fs.readFileSync(DOC, 'utf8');
const documented = new Set(
  [...doc.matchAll(/`([A-Z_][A-Z0-9_]{2,})`/g)].map((m) => m[1]),
);

/* ── ١) كل متغيّر في الكود مكتوب في الدليل ───────────────────────────── */
const missing = [];
for (const [name, where] of found) {
  if (PROVIDED.has(name)) continue;
  if (!documented.has(name)) missing.push([name, where]);
}
for (const [name, where] of missing) {
  fail(`\`${name}\` بيتقرا في ${where} ومش مكتوب في دليل الاستضافة — `
    + 'يعني محدّش هيعرف ينقله، والميزة اللي بتستخدمه هتتقفل في صمت.');
}

/* ── ٢) ومفيش في الدليل حاجة اختفت من الكود ─────────────────────────── */
{
  // بس الأسماء اللي شكلها متغيّر بتاع Service Flow (عشان ماننبّهش على
  // SERVICEFLOW_* بتاعة الاستضافة نفسها ولا على أسماء تانية في الملف).
  const looksLikeSfVar = (n) => /^(SF_|SERVICE_FLOW_|MAINTENANCE_|DZS_|C360_|BOX_|COMPREHENSIVE_|INTEGRATION_|UPLOAD_)/.test(n);
  /* قسم «مش محتاجين» بيسمّي متغيّرات **عن قصد** عشان يقول متنقلهمش —
   * فمش منطقي نطالب بوجودها في الكود. بنستثنيه من الفحص ده. */
  const notNeeded = /### مش محتاجين[\s\S]*?(?=\n## |$)/.exec(doc);
  const deliberatelyAbsent = new Set(
    notNeeded ? [...notNeeded[0].matchAll(/`([A-Z_][A-Z0-9_]{2,})`/g)].map((m) => m[1]) : [],
  );
  const stale = [...documented].filter((n) =>
    looksLikeSfVar(n) && !found.has(n) && !PROVIDED.has(n) && !deliberatelyAbsent.has(n));
  for (const n of stale) {
    fail(`\`${n}\` مكتوب في الدليل ومفيش ليه أثر في الكود — `
      + 'دليل بيقول انقل حاجة مالهاش لازمة. شيله أو صحّح الاسم.');
  }
}

/* ── ٣) التوكنات اللي ليها بديل مكتوب في الكود لازم تفضل معلَّمة ─────── */
{
  const hardcoded = [];
  for (const [name, where] of found) {
    const src = fs.readFileSync(path.join(ROOT, where), 'utf8');
    const re = new RegExp(`process\\.env\\.${name}\\s*\\|\\|\\s*['"\`]([^'"\`]+)['"\`]`);
    const m = re.exec(src);
    if (m && /token|secret/i.test(name)) hardcoded.push([name, m[1]]);
  }
  for (const [name] of hardcoded) {
    const section = /🔴[\s\S]*?(?=\n## )/.exec(doc);
    if (!section || !section[0].includes('`' + name + '`')) {
      fail(`\`${name}\` ليه توكن بديل **مكتوب في الكود** ومش مذكور في قسم `
        + 'التوكنات الخطرة في الدليل. المصدر على جيت‌هب عام، فالبديل ده مش سرّ.');
    }
  }
  if (!process.exitCode) {
    console.log(`✅ متغيّرات Service Flow موثّقة: ${found.size} متغيّر في الكود · `
      + `${hardcoded.length} منهم ليهم بديل مكتوب في المصدر ومعلَّمين في الدليل`);
  }
}

if (process.exitCode) process.exit(1);
