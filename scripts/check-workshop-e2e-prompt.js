#!/usr/bin/env node
/**
 * برومبت كوديكس لاختبار الورش كامل (docs/WORKSHOP_E2E_CODEX_PROMPT.md) مطابق للكود.
 *
 * البرومبت فيه أرقام متوقعة (1140، 84.00، 186…) ومسارات ونصوص رسائل. لو المعادلة أو
 * المسار أو النص اتغيّر والبرومبت فضل زي ما هو، كوديكس هيسجّل «غلطة» مش موجودة — أو
 * أسوأ، هيعدّي غلطة حقيقية لأن المتوقع نفسه غلط. الفحص ده بيعيد حساب كل رقم من الكود.
 *
 *   node scripts/check-workshop-e2e-prompt.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const doc = read('docs/WORKSHOP_E2E_CODEX_PROMPT.md');
const admin = read('src/routes/workshop_admin.js');
let fail = 0;
const ok = (m, c, x) => { console.log(`${c ? '✅' : '❌'} ${m}${x ? ' — ' + x : ''}`); if (!c) fail++; };

// ── المسارات: كل /workshop/<قسم> فى البرومبت ليه راوت ──
const routes = new Set([...admin.matchAll(/^router\.(?:get|post)\('(\/[a-z-]+)/gm)].map((m) => m[1]));
const used = [...new Set([...doc.matchAll(/\/workshop\/([a-z][a-z-]*)/g)].map((m) => '/' + m[1]))]
  .filter((p) => p !== '/status');   // /workshop/status = workshop_public
const missing = used.filter((p) => !routes.has(p));
ok('كل مسارات /workshop/… فى البرومبت ليها راوت', missing.length === 0, missing.join(' ') || used.length + ' مسار');
ok('/workshop/cars بيحوّل لـ/workshop/vehicles', /router\.get\('\/cars', \(req, res\) => res\.redirect\(301, '\/workshop\/vehicles'\)\)/.test(admin));

// ── الأرقام: من jobTotals نفسها ──
const J = require('../src/workshop/jobs');
const t = J.jobTotals({ discount: 20, tax_percent: 14, paid: 0 },
  [{ qty: 1, unit_price: 120, unit_cost: 84 }, { qty: 1, unit_price: 750, unit_cost: 600 }],
  [{ amount: 150 }]);
ok('أمر الشغل: 870 · 150 · 1020 · 1000 · 140 · 1140', t.partsRevenue === 870 && t.labourRevenue === 150
  && t.subtotal === 1020 && t.tax === 140 && t.total === 1140, JSON.stringify([t.subtotal, t.tax, t.total]));
ok('البرومبت فيه نفس الأرقام', /القطع 870 · المصنعية 150 · المجموع 1020 · بعد الخصم 1000 ·\s+الضريبة 140 · الإجمالي 1140/.test(doc));
ok('هامش القطع 186', t.partsMargin === 186 && /المتوقع 186/.test(doc), String(t.partsMargin));
const avg = (10 * 80 + 5 * 92) / 15;
ok('متوسط التكلفة المتحرّك 84.00', avg === 84 && /متوسط تكلفته 84\.00/.test(doc));
const after = J.jobTotals({ discount: 20, tax_percent: 14, paid: 500 },
  [{ qty: 1, unit_price: 120 }, { qty: 1, unit_price: 750 }], [{ amount: 150 }]);
ok('دفعة 500 → المتبقّي 640', after.due === 640 && /المتبقّي: 640/.test(doc.replace('المتبقّي 640', 'المتبقّي: 640')));

// ── النصوص: زى ما المستخدم هيشوفها ──
const pub = require('../src/routes/workshop_public');
ok('نص الموافقة مطابق لـCONSENT_TEXT', doc.includes(pub.CONSENT_TEXT), pub.CONSENT_TEXT);
ok('الرابط بيقف بعد 30 يوم من التسليم', pub.LINK_DAYS_AFTER_CLOSE === 30 && /بعد 30 يوم من التسليم/.test(doc));
ok('صفحة الرابط المنتهى', read('src/views/workshop_public/expired.ejs').includes('رابط المتابعة ده انتهى') && doc.includes('رابط المتابعة ده انتهى'));
const demo = read('src/lib/demo_mode.js');
ok('رسالة الديمو وزرار «ابدأ نسختك»', demo.includes('دي نسخة عرض للاطّلاع فقط — التعديل والحذف متوقّفين فيها.')
  && demo.includes('ابدأ نسختك') && doc.includes('ابدأ نسختك'));
const apply = read('src/routes/apply.js');
ok('check-slug بيرجّع reserved للأسماء المحجوزة (فحص النسخة فى الخطوة ٠)',
  /reason: 'reserved'/.test(apply) && /"reason":"reserved"/.test(doc));
ok('رسالة «محجوز للنظام» فى الفورم', read('src/views/apply/form.ejs').includes('الاسم ده محجوز للنظام') && doc.includes('الاسم ده محجوز للنظام'));
ok('صفحة النجاح بتعرض رابط المتابعة', /trackUrl/.test(read('src/views/apply/success.ejs')));

// ── الخطوط الحمرا ──
const phones = [...doc.matchAll(/\b01\d{9}\b/g)].map((m) => m[0]).filter((p) => !/^010000000\d\d$/.test(p));
ok('مفيش رقم تليفون حقيقى (كلهم 0100000000X)', phones.length === 0, phones.join(' '));
ok('الإيميلات @example.com بس', ![...doc.matchAll(/[\w.+-]+@([\w-]+\.)+\w+/g)].some((m) => !/@example\.com$/.test(m[0])));
ok('ممنوع إرسال حملة CRM ومفاتيح الدفع/الرسائل', /ممنوع ضغط «إرسال» على حملة CRM/.test(doc) && /لا بوابة دفع، ولا مزود واتساب/.test(doc));
ok('الوصف والنبذة فاضيين (noindex — أدسنس)', /«الوصف» و«النبذة\/عن الورشة» يفضلوا فاضيين/.test(doc));
ok('الديمو فى الآخر بس', /ممنوع تفتح أي رابط \/demo\/… \*\*قبل الخطوة ١٩\*\*/.test(doc));
ok('مفيش رقم بريدى (قرار المالك)', !/71111/.test(doc));

if (fail) { console.log(`\n❌ ${fail} فحص فشل — البرومبت مش مطابق للكود`); process.exit(1); }
console.log('\n✅ برومبت كوديكس لاختبار الورش مطابق للكود');
