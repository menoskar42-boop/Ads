#!/usr/bin/env node
/**
 * check-oas-430d — تقرير 430D فى «التحديث اليومى» بينزّل التبويبين بتواريخهم.
 *
 * البلاغ (٢٠٢٦-٠٩-٢٨): زر «430D» بيحط التواريخ فى التفاصيل والمتبقى وينزّل الشيتين،
 * لكن التحديث اليومى بيعدّى التفاصيل من غير تواريخ وينزّل المتبقى بس.
 *
 * السبب: الاتنين نفس الطابور ونفس اللينك — الفرق إن الزر بيفتح التاب **قدّامك**
 * (جوّه ضغطة الزر)، والتحديث اليومى بيفتح ٤ مواقع مرة واحدة فتاب 430D بيبقى فى
 * **الخلفية**، والمتصفح بيبطّأ تحميله. السكربت كان بيستنى زر Apply بس، وبيكتب
 * التواريخ فوراً — فى الخلفية الزر بيظهر قبل خانات التاريخ، فالكتابة مابتلاقيش
 * خانات → Apply فاضى → مفيش ملف. ولما يوصل للمتبقى تكون الصفحة خلصت تحميل فيشتغل.
 * وكمان الملف الوحيد اللى اتلقط كان بيتسمّى details لأن التسمية كانت «أول ملف = التفاصيل».
 *
 * بيتأكد من:
 *   · fillDatesAndApply بيستنى خانتى التاريخ نفسهم قبل ما يكتب.
 *   · التبويب اللى ماطلّعش ملف بيتعاد (runTab) — للتبويبين.
 *   · اسم الملف من التبويب اللى طلع منه (قبل/بعد فتح المتبقى) مش من ترتيبه.
 *   · والاختبار الوظيفى (jsdom): خانات التاريخ بتظهر بعد ٤ ثوانى زى تاب الخلفية.
 *
 *   node scripts/check-oas-430d.js [path-to-userscript]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FILE = process.argv[2] || path.join(ROOT, 'serviceflow', 'we-oas-bi-login.user.js');
const src = fs.readFileSync(FILE, 'utf8');

const errors = [];
const need = (ok, msg) => { if (!ok) errors.push(msg); };
const fnBody = (name) => {
  const i = src.indexOf(`async function ${name}(`);
  if (i < 0) return '';
  const j = src.indexOf('\n  }\n', i);
  return src.slice(i, j < 0 ? undefined : j);
};

const fill = fnBody('fillDatesAndApply');
need(fill, 'fillDatesAndApply مش موجودة.');
const waitIdx = fill.search(/await waitFor\(\(\) => \{[\s\S]*?findDateInput\(\/from_\?date\/i\)[\s\S]*?findDateInput\(\/to_\?date\/i\)/);
const setIdx = fill.indexOf('setValue(');
need(waitIdx >= 0 && setIdx > waitIdx,
  'fillDatesAndApply لازم يستنى (waitFor) خانتى from_date/to_date قبل setValue — فى تاب الخلفية زر Apply بيظهر قبل الخانات.');
need(/\.value[\s\S]*FROM_STR[\s\S]*\.value[\s\S]*TO_STR/.test(fill),
  'fillDatesAndApply لازم يتأكد إن القيمة اتكتبت فعلاً قبل Apply.');

const flow = fnBody('reportFlow');
need(/runTab\("التفاصيل"\)/.test(flow) && /runTab\("المتبقى"\)/.test(flow),
  'reportFlow لازم يشغّل التبويبين بـrunTab (بيعيد التبويب اللى ماطلّعش ملف).');
need(/async function runTab\([\s\S]*?attempt <= 2/.test(src), 'runTab لازم يعيد التبويب مرة لو مافيش ملف جديد.');
need(!/idx === 0 \? "التفاصيل"/.test(src),
  'تسمية الملف بـ«أول ملف = التفاصيل» بترجع — لو التفاصيل فشل، المتبقى بيتسمّى details.');
need(/const remStart = caps\(\)\.length/.test(flow) && /idx < remStart/.test(flow),
  'اسم كل ملف لازم يتحدّد بمكانه قبل/بعد فتح تبويب المتبقى (remStart).');

// الاختبار الوظيفى — لو jsdom متاح
let functional = 'jsdom مش متسطّب — الاختبار الوظيفى اتخطّى';
let hasJsdom = false;
try { require.resolve('jsdom'); hasJsdom = true; } catch {}
if (hasJsdom && !errors.length) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'serviceflow', 'scripts', 'test-oas-430d.cjs'), FILE],
    { encoding: 'utf8', timeout: 240000, env: process.env });
  if (r.status === 0) functional = 'الاختبار الوظيفى (خانات متأخّرة ٤ث) نجح';
  else errors.push('الاختبار الوظيفى فشل:\n' + (r.stdout || '') + (r.stderr || ''));
}

if (errors.length) {
  console.log('❌ check-oas-430d:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-oas-430d: التفاصيل بيستنى خانات التاريخ، كل تبويب بيتعاد لو فشل، وكل ملف باسم تبويبه (${functional}).`);
