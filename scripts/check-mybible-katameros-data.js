#!/usr/bin/env node
/**
 * بيانات القطمارس المنقولة من katameros-api (mybible/data/katameros) سليمة وكاملة.
 *
 * المالك ٢٠٢٦-١٠-٣٠: «اعمل خطة لنقل الملفات دى إلينا وانقل الملفات دى». القطمارس اللى فى الموقع
 * دلوقتى (coptic-lectionary.ts) فيه ١٠٢ يوم بس من ٣٦٦ — والبيانات دى هتسد الباقى، فلازم نتأكد إنها كاملة
 * قبل ما أى كود يعتمد عليها:
 *   - الرخصة (MIT) موجودة والمصدر مكتوب — شرط استخدامها.
 *   - السنكسار بيغطّى الـ٣٦٦ يوم، والقراءات السنوية ٣٦٦ يوم مختلفين فى ١٣ شهر.
 *   - كل رقم سفر فى أى مرجع قراءة موجود فى books.json (غير كده القراءة هتطلع فاضية).
 *   - مفيش كود فى نصوص السنكسار (<script>، on…=، javascript:) — النص بيتعرض كـHTML.
 *   - ملفات الكود المرجعية موجودة (الأعياد والتاريخ مكتوبين فى الكود مش فى القاعدة).
 *
 * Usage: node scripts/check-mybible-katameros-data.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, '..', 'mybible', 'data', 'katameros');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};
const load = (f) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));

if (!fs.existsSync(D)) { console.log('⏭️  mybible/data/katameros مش موجود.'); process.exit(0); }

const lic = fs.existsSync(path.join(D, 'LICENSE')) ? fs.readFileSync(path.join(D, 'LICENSE'), 'utf8') : '';
check('رخصة MIT موجودة', /MIT License/.test(lic) && /Permission is hereby granted/.test(lic), 'LICENSE ناقص — شرط استخدام البيانات');
const readme = fs.existsSync(path.join(D, 'README.md')) ? fs.readFileSync(path.join(D, 'README.md'), 'utf8') : '';
check('المصدر مكتوب فى README', /github\.com\/pierresaid\/katameros-api/.test(readme) && /[0-9a-f]{40}/.test(readme), 'رابط المصدر ورقم الـcommit');

const syn = load('synaxarium.ar.json');
const synDays = new Set(syn.map((s) => s.month + '-' + s.day));
check('السنكسار بيغطّى ٣٦٦ يوم', synDays.size === 366, 'أيام: ' + synDays.size);
check('كل قصة سنكسار ليها عنوان ونص', syn.every((s) => s.title && s.text && s.text.length > 50),
  syn.filter((s) => !(s.title && s.text && s.text.length > 50)).length + ' ناقصة');
const risky = syn.filter((s) => /<script|\bon[a-z]+\s*=|javascript:/i.test(s.text || ''));
check('مفيش كود فى نصوص السنكسار', risky.length === 0, risky.length + ' قصة فيها كود');

const annual = load('readings-annual.json');
const annualDays = new Set(annual.map((r) => r.Month_Number + '-' + r.Day));
check('القراءات السنوية ٣٦٦ يوم مختلف', annual.length === 366 && annualDays.size === 366, annual.length + ' صف / ' + annualDays.size + ' يوم');
check('القراءات السنوية فى ١٣ شهر', new Set(annual.map((r) => r.Month_Number)).size === 13, 'شهور ناقصة');
check('كل يوم سنوى فيه البولس والكاثوليكون والإبركسيس والإنجيل',
  annual.every((r) => r.P_Gospel_Ref && r.C_Gospel_Ref && r.X_Gospel_Ref && r.L_Gospel_Ref),
  annual.filter((r) => !(r.P_Gospel_Ref && r.C_Gospel_Ref && r.X_Gospel_Ref && r.L_Gospel_Ref)).map((r) => r.Month_Number + '-' + r.Day).slice(0, 10).join('، '));
check('الآحاد ٥٢ والصوم الكبير ٥٣ والخماسين ٥٠',
  load('readings-sunday.json').length === 52 && load('readings-great-lent.json').length === 53 && load('readings-pentecost.json').length === 50, 'عدد ناقص');

const books = new Set(load('books.json').filter((b) => b.ar).map((b) => b.id));
check('٧٣ سفر بأسمائهم العربى', books.size === 73, books.size + ' سفر');
const missing = new Set();
for (const f of ['readings-annual.json', 'readings-sunday.json', 'readings-great-lent.json', 'readings-pentecost.json']) {
  for (const r of load(f)) {
    for (const [k, v] of Object.entries(r)) {
      if (!/_Ref$|^Prophecy$/.test(k) || !v) continue;
      for (const m of String(v).matchAll(/(?:^|[@+*])\s*(\d+)\.\d+:/g)) if (!books.has(Number(m[1]))) missing.add(f + ' ' + k + ' ⇒ سفر ' + m[1]);
    }
  }
}
check('كل أرقام الأسفار فى المراجع موجودة', missing.size === 0, [...missing].slice(0, 5).join(' · '));

// قراءات الأعياد (من الكود C# بسكربت mybible/scripts/katameros-feasts-from-cs.py) — ٢٩ عيد/حالة وكل مراجعها سليمة
const feasts = fs.existsSync(path.join(D, 'feasts-readings.json')) ? load('feasts-readings.json') : {};
check('قراءات الأعياد ٢٩ عيد/حالة', Object.keys(feasts).length === 29, Object.keys(feasts).length + ' — شغّل scripts/katameros-feasts-from-cs.py');
const feastRefs = JSON.stringify(feasts).match(/"(?:ref|psalms|gospels)":(?:"[^"]*"|\[[^\]]*\])/g) || [];
const badFeast = new Set();
for (const r of feastRefs) for (const m of r.matchAll(/(?:"|[@+*])\s*(\d+)\.\d+:/g)) if (!books.has(Number(m[1]))) badFeast.add(m[1]);
check('كل أرقام الأسفار فى قراءات الأعياد موجودة', feastRefs.length > 200 && badFeast.size === 0, feastRefs.length + ' مرجع · أسفار مش موجودة: ' + [...badFeast].join('، '));
check('البصخة فيها الساعة الثانية عشر يوم الجمعة', !!(feasts.ConstructPaschaFriday && feasts.ConstructPaschaFriday.sections.some((x) => x.id === 'hour-12')), 'ناقصة');

for (const f of ['Helpers/CopticDateHelper.cs', 'Repositories/LectionaryRepository.cs', 'Factories/FeastsFactory.cs', 'Factories/Feasts/Easter.cs', 'Factories/SpecialCases/Kiahk.cs']) {
  check('كود مرجعى: ' + f, fs.existsSync(path.join(D, 'reference-src', f)), 'ناقص — قراءات الأعياد وحساب التاريخ فيه');
}

if (failed) { console.log('\n❌ ' + failed + ' فحص فشل'); process.exit(1); }
console.log('\n✅ بيانات القطمارس كاملة');
