#!/usr/bin/env node
/**
 * برومبت QA التغذية (docs/NUTRITION_QA_PROMPT.md) — أرقامه ومساراته من الكود.
 *
 * البرومبت بيقول للمختبِر «المتوقَّع 1761 سعر». لو المعادلة اتغيّرت والبرومبت
 * لأ، المختبِر هيكتب ❌ على نظام سليم — أو أسوأ: هنعدّل النظام عشان يطابق
 * برومبت غلط. فالفحص ده بيعيد حساب **كل صف** في جدول المتوقَّع من
 * src/nutrition/engine.js نفسه، وبيتأكد من:
 *   · إن البرومبت **مش** على الديمو (الديمو قراءة فقط ومابيدخلش بكلمة سر)،
 *     وإن عيادة التجربة مابتكتبش وصف/نبذة (عشان صفحتها تفضل noindex)، ومفيش كلمة سر.
 *   · المسارات اللي البرومبت بيفتحها موجودة (تصدير · كلمة سر البوابة · القائمة الجاهزة).
 *   · أرقام «أرز أبيض مسلوق» وعدد القائمة الجاهزة = food_catalog.js.
 *   · حد السعرات في الفورم (900) وحد الأنثى (1200) = الكود.
 *
 *   node scripts/check-nutrition-qa-prompt.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const E = require('../src/nutrition/engine');
const { CATALOG } = require('../src/nutrition/food_catalog');

const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const doc = code('docs/NUTRITION_QA_PROMPT.md');
const prompt = (doc.match(/````\n([\s\S]*?)\n````/) || [])[1] || '';
check('البلوك اللي بيتنسخ موجود', prompt.length > 1000);

/* ── الديمو والأسرار ─────────────────────────────────────────────────── */
// الديمو قراءة فقط وحسابه مابيدخلش بكلمة سر (isDemoLogin) — برومبت بيقول
// «ادخل بحساب الديمو واعمل مرضى» مستحيل يتنفّذ. الاختبار على عيادة تجربة.
const demoEmail = (code('scripts/enable-demo-nutrition.js').match(/const EMAIL = '([^']+)'/) || [])[1];
check('البرومبت مابيقولش ادخل بحساب الديمو', !!demoEmail && !prompt.includes(demoEmail));
check('والديمو فعلاً مقفول على الدخول (لو اتفتح، راجع البرومبت)',
  /function isDemoLogin\(slug\) \{\s*return isDemoSlug\(slug\);/.test(code('src/lib/demo_mode.js')));
check('بيمنع استخدام كلمات السر المتحفوظة في المتصفح', /ماتستخدمش أي كلمة سر متحفوظة في المتصفح/.test(prompt));
// صفحة عيادة التجربة العامة لازم تفضل noindex: شرط الفهرسة = وصف ≥٤٠ أو نبذة ≥٦٠.
check('بيمنع كتابة وصف أو نبذة لعيادة التجربة', /ماتكتبش أي وصف ولا «نبذة» للعيادة/.test(prompt));
check('وشرط الفهرسة في السايت‌ماب لسه ٤٠/٦٠ (لو اتغيّر، راجع البرومبت)',
  /row\.page_type === 'nutrition'\s*\n\s*\? \(Number\(row\.desc_len\) >= 40 \|\| Number\(row\.nutri_about_len\) >= 60\)/.test(code('src/routes/legal.js')));
check('مفيش كلمة سر مكتوبة', !/(password|باسورد|كلمة السر)\s*[:=]\s*\S{4,}/i.test(prompt));
check('وبيقول للمختبِر مايكتبش كلمة السر', /ماتكتبش كلمة السر في التقرير|ماتكتبهاش في التقرير/.test(prompt));

/* ── جدول المدخلات والمتوقَّع ──────────────────────────────────────────── */
const ACT = { 'قليل الحركة': 'sedentary', 'نشاط خفيف': 'light', 'نشاط متوسط': 'moderate', 'نشيط': 'active', 'نشيط جداً': 'very_active' };
const GOAL = { 'إنقاص وزن': 'loss', 'ثبات': 'maintain', 'زيادة وزن': 'gain' };
const rows = (re) => [...prompt.matchAll(re)].map((m) => m.slice(1));
const inputs = rows(/^\| (QA-\w) \| (أنثى|ذكر) \| (\d{4}-\d{2}-\d{2}) \| (\d+) \| ([^|]+?) \| ([^|]+?) \| (\d+) \|$/gm);
const expects = rows(/^\| (QA-\w) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (-?\d+) \| (-?\d+) \| (-?\d+) \| ([\d.]+) \|$/gm);
check('٤ مرضى في جدول المدخلات', inputs.length === 4);
check('و٤ صفوف في جدول المتوقَّع', expects.length === 4);

const overrides = { 'QA-D': { protein_per_kg: 3, fat_percent: 60 } };
check('وتعليمة QA-D (بروتين 3 ودهون 60) مكتوبة',
  /QA-D بس: اكتب في ملفه «بروتين \(جم\/كجم\)» = 3 و«دهون \(% من السعرات\)» = 60/.test(prompt));
const DEFAULTS = { protein_per_kg: 1.8, fat_percent: 25 };
check('والإعدادات المفترضة (1.8 و25٪) مكتوبة', /بروتين غير 1\.8 جم\/كجم أو دهون غير 25٪/.test(prompt));

for (const [name, sex, dob, h, act, goal, w] of inputs) {
  const exp = expects.find((r) => r[0] === name);
  if (!exp) { errors.push(`${name}: مالوش صف متوقَّع`); continue; }
  const gender = sex === 'ذكر' ? 'male' : 'female';
  const activity = ACT[act.trim()]; const g = GOAL[goal.trim()];
  if (!activity || !g) { errors.push(`${name}: نشاط/هدف مش معروف (${act} / ${goal})`); continue; }
  // البرومبت بيقول «صح لحد آخر ٢٠٢٦» — السن لازم يكون صح طول السنة دي.
  const ageNow = E.ageOn(dob, '2026-09-23'); const ageEnd = E.ageOn(dob, '2026-12-31');
  const [, age, bmr, tdee, target, p, f, c, bmi] = exp.map(Number);
  check(`${name}: السن ${age} ثابت لحد آخر ٢٠٢٦`, ageNow === age && ageEnd === age);
  const o = Object.assign({}, DEFAULTS, overrides[name] || {});
  const B = E.bmr({ weightKg: +w, heightCm: +h, age, gender });
  const T = E.round(B * E.ACTIVITY[activity]);
  const K = E.round(T * (1 + E.GOAL_ADJUST[g]));
  const M = E.macros({ kcal: K, weightKg: +w, proteinPerKg: o.protein_per_kg, fatPercent: o.fat_percent });
  const got = [B, T, K, M.protein, M.fat, M.carbs, E.bmi(+w, +h)];
  const want = [bmr, tdee, target, p, f, c, bmi];
  check(`${name}: المتوقَّع ${want.join('/')} = المعادلة ${got.join('/')}`, got.every((v, i) => v === want[i]));
  // التنبيهات اللي البرومبت بيطلبها لازم تكون حقيقية
  if (/QA-C و QA-D: الهدف أقل من 1200/.test(prompt) && (name === 'QA-C' || name === 'QA-D')) {
    check(`${name}: فعلاً تحت الحد (${K} < ${E.FLOOR.female})`, K < E.FLOOR.female);
  }
  if (name === 'QA-D') check('QA-D: فعلاً فيه تعارض (كارب سالب)', M.conflict === true);
}
check('حد الأنثى في البرومبت = FLOOR.female', prompt.includes(`أقل من ${E.FLOOR.female} سعر لأنثى`));

/* ── الأطعمة ─────────────────────────────────────────────────────────── */
const rice = CATALOG.find((r) => r[0] === 'أرز أبيض مسلوق');
check('أرقام «أرز أبيض مسلوق» = القائمة الجاهزة',
  !!rice && prompt.includes(`«أرز أبيض مسلوق» → ${rice[2]} سعر / ${rice[3]} بروتين / ${rice[4]} كارب / ${rice[5]} دهون`));
check(`عدد القائمة في البرومبت = ${CATALOG.length}`, prompt.includes(`يوصل لـ ${CATALOG.length} على الأقل`));
const egg = CATALOG.find((r) => r[0] === 'بيض مسلوق');
check('مجموع الخطة (بيض 100 + أرز 150) محسوب صح',
  !!egg && prompt.includes(`سطر الأرز = ${rice[2] * 1.5} سعر، ومجموع اليوم = ${egg[2]} + ${rice[2] * 1.5} = ${egg[2] + rice[2] * 1.5} سعر`));
check('حد سعرات الفورم (900) = nutrition_foods.js',
  /\['kcal', 900\]/.test(code('src/routes/nutrition_foods.js')) && /جرّب سعرات 950 → لازم يرفض \(الحد 900\)/.test(prompt));

/* ── المسارات ─────────────────────────────────────────────────────────── */
const admin = code('src/routes/nutrition_admin.js');
const portal = code('src/routes/nutrition_portal.js');
check('/nutrition/export موجود', /router\.get\('\/export'/.test(admin));
check('/portal/password موجود', /router\.post\('\/password'/.test(portal));
check('القائمة الجاهزة /foods/starter موجودة', /router\.post\('\/starter'/.test(code('src/routes/nutrition_foods.js')));
check('noindex في لوحة التغذية', /noindex,nofollow/.test(code('src/views/nutrition_admin/head.ejs')));
check('noindex في البوابة', /noindex,nofollow/.test(code('src/views/nutrition_portal/head.ejs')));
check('البوابة على <slug>.oscardevs.com/portal', /portalUrl: 'https:\/\/' \+ req\.company\.slug \+ '\.oscardevs\.com\/portal'/.test(admin)
  && prompt.includes('.oscardevs.com/portal') && !prompt.includes('https://nutrition.oscardevs.com/portal'));

if (errors.length) {
  console.log('❌ check-nutrition-qa-prompt:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-nutrition-qa-prompt: كل رقم متوقَّع في برومبت QA التغذية = المعادلة، والمسارات موجودة.');
