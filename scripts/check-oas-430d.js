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
 *   · v1.9.4 (نفس اليوم): صفحة التقرير نفسها كانت بتفضل بيضا أكتر من ٢٠ث فالسكربت يقف
 *     ساكت (لا شريط ولا زرار). دلوقتى فى التشغيل التلقائى: ريفريش واحد (طلب المالك —
 *     الريفريش بإيده هو اللى نجّحها) + انتظار لحد ٤ دقايق.
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

// v1.9.4: صفحة بطيئة + ريفريش واحد
need(/const REPORT_WAIT_AUTO_MS = \d+ \* 60 \* 1000;/.test(src) && /const quick = await waitFor\(check, 20000\);\s*\n\s*if \(quick \|\| !flagOn\(\)\) return quick;/.test(src),
  'فى التشغيل التلقائى لازم يستنى صفحة التقرير أكتر من ٢٠ث — كان بيقف ساكت فى التحديث اليومى.');
need(/const reloadedThisRun = \(\) => \{\s*\n\s*try \{ return parseInt\(sessionStorage\.getItem\(RELOAD_KEY\)/.test(src) && /catch \(e\) \{ return true; \}/.test(src),
  'الريفريش لازم يتعمل مرة واحدة بعلامة فى sessionStorage — ومن غيرها مايتعملش (منعاً للّف).');
need(/function reloadOnce\(why\) \{\s*\n\s*try \{ sessionStorage\.setItem\(RELOAD_KEY[^\n]*catch \(e\) \{ return false; \}\s*\n\s*setFlag\(\);/.test(src),
  'reloadOnce لازم يحط العلامة قبل الريفريش ويجدّد علامة التشغيل التلقائى.');
need(/ok === true && flagOn\(\) && !reloadedThisRun\(\) && reloadOnce\(/.test(src),
  'الريفريش قبل Apply لازم يبقى فى التشغيل التلقائى بس (الزرار اليدوى مايعملش ريفريش).');
need(/if \(ok === null && flagOn\(\)\) banner\(/.test(src), 'لو الصفحة ماحمّلتش خالص لازم يظهر شريط + الزرار بدل ما يقف ساكت.');

// الاختبار الوظيفى — لو jsdom متاح
let functional = 'jsdom مش متسطّب — الاختبار الوظيفى اتخطّى';
let hasJsdom = false;
try { require.resolve('jsdom'); hasJsdom = true; } catch {}
if (hasJsdom && !errors.length) {
  for (const extra of [[], ['--reloaded'], ['--reloaded', '--page=30000']]) {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'serviceflow', 'scripts', 'test-oas-430d.cjs'), FILE, ...extra],
      { encoding: 'utf8', timeout: 240000, env: process.env });
    if (r.status !== 0) errors.push(`الاختبار الوظيفى فشل (${extra.join(' ') || 'أول تحميل'}):\n` + (r.stdout || '') + (r.stderr || ''));
  }
  if (!errors.length) functional = 'الاختبار الوظيفى: ريفريش أول تحميل + خانات متأخّرة + صفحة بيضا ٣٠ث نجح';
}

if (errors.length) {
  console.log('❌ check-oas-430d:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-oas-430d: ريفريش واحد وانتظار الصفحة فى التشغيل التلقائى، التفاصيل بيستنى خانات التاريخ، كل تبويب بيتعاد لو فشل، وكل ملف باسم تبويبه (${functional}).`);
