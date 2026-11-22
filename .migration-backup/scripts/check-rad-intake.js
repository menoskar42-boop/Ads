#!/usr/bin/env node
/**
 * رفعة اتوقفت بسبب `Thumbs.db`، وفاتورة AI محدش شايفها.
 *
 * ── تلات حاجات الفحص ده موجود عشانهم ─────────────────────────────────────
 *
 * ١) **الفرق بين «ملف زيادة» و«شريحة مش مقروءة».** مجلد الدراسة اللي بيطلع
 *    من الجهاز بيبقى فيه `DICOMDIR` و`Thumbs.db`. الرفعة كانت بتترفض كلها
 *    بسببهم، والرسالة ماكانتش بتقول أنهي ملف — فالطبيب يقعد يشيل ملفات
 *    بالتخمين. دلوقتي:
 *      · مش DICOM أصلاً → بيتشال **باسمه**، لأنه مالوش هيدر فيه هوية مريض.
 *      · DICOM وهيدره مش مقروء → **الرفعة كلها بتترفض**، لأن ده بالظبط اللي
 *        إزالة الهوية موجودة عشانه، واللي بعده على الأغلب بنفس الصيغة.
 *      · مفيش ولا ملف DICOM → رفض بسبب تالت، مكتوب بجملته.
 *
 * ٢) **الضغط بيتعرف وقت الرفع مش وقت العرض.** البكسلز المضغوطة (JPEG/J2K/RLE)
 *    هيدرها سليم فإزالة الهوية بتشتغل، بس العارض مش بيفكّها. الدراسة بتتخزّن
 *    ومعاها إن صورها مضغوطة، فالصفحة بتقول كده من أول لحظة بدل ما الطبيب
 *    يحمّل ٣٠٠ شريحة عشان يلاقيها كلها رسالة خطأ.
 *
 * ٣) **سقف تكلفة الـAI.** «توليد تقرير» على ١٢ صورة بيتكلّف فلوس، وضغطه
 *    عشرين مرة بإضاءة مختلفة بيعدّي الكاش. السقف:
 *      · محسوب من صفوف الاستهلاك مش من عدّاد،
 *      · بيشوف الشات زي التقرير (الاتنين بيتكلّفوا),
 *      · **وبيقفل لما مايقدرش يقرا** — سقف بيفتح وهو أعمى مش سقف.
 *
 *   node scripts/check-rad-intake.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const intake = require('../src/radiology/intake');
const budget = require('../src/radiology/budget');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const raw = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ── ١. علامة DICM من البايتات ──────────────────────────────────────────── */
{
  const good = Buffer.alloc(200);
  good.write('DICM', 128, 'latin1');
  check('الملف اللي فيه DICM في مكانها بيتعرف', intake.isDicom(good) === true);
  const named = Buffer.alloc(200);
  named.write('DICM', 0, 'latin1');   // العلامة في أول الملف مش في مكانها
  check('والعلامة في مكان تاني مابتعدّيش', intake.isDicom(named) === false);
  check('والملف القصير مابيتقالش عليه DICOM', intake.isDicom(Buffer.alloc(10)) === false);
  check('واللي مش Buffer أصلاً', intake.isDicom('DICM') === false);
}

/* ── ٢. قرار الرفعة ────────────────────────────────────────────────────── */
{
  const plan = intake.planUpload([
    { name: 'IM1', dicom: true, ok: true, removed: [] },
    { name: 'Thumbs.db', dicom: false, ok: false },
    { name: 'IM2', dicom: true, ok: true, removed: [] },
    { name: 'DICOMDIR', dicom: false, ok: false },
  ]);
  check('الملف اللي مش DICOM بيتشال والرفعة بتكمّل', plan.refuse === false && plan.keep.length === 2);
  check('وبيتقال باسمه', plan.skipped.join(',') === 'Thumbs.db,DICOMDIR');

  const bad = intake.planUpload([
    { name: 'IM1', dicom: true, ok: true, removed: [] },
    { name: 'IM2', dicom: true, ok: false, reason: 'unsupported_syntax' },
  ]);
  check('وشريحة DICOM هيدرها مش مقروء بتوقّف الرفعة كلها',
    bad.refuse === true && bad.keep.length === 0);
  check('وبتقول أنهي ملف وأنهي سبب',
    bad.badFile === 'IM2' && bad.reason === 'unsupported_syntax');

  const none = intake.planUpload([{ name: 'notes.txt', dicom: false, ok: false }]);
  check('ومفيش ولا DICOM = سبب تالت مختلف', none.refuse === true && none.reason === 'no_dicom');
  check('ورفعة فاضية بتترفض كمان', intake.planUpload([]).reason === 'no_dicom');
}

/* ── ٣. الضغط ──────────────────────────────────────────────────────────── */
{
  check('JPEG Lossless بيتعرف', intake.compressionOf('1.2.840.10008.1.2.4.70') === 'JPEG Lossless SV1');
  check('و JPEG 2000 كمان', /2000/.test(intake.compressionOf('1.2.840.10008.1.2.4.90') || ''));
  check('وغير المضغوط بيرجع null', intake.compressionOf('1.2.840.10008.1.2.1') === null);
  check('والفاضي مابيتقالش عليه مضغوط', intake.compressionOf(null) === null);
  const plan = intake.planUpload([
    { name: 'A', dicom: true, ok: true, removed: [], compression: 'JPEG 2000' },
    { name: 'B', dicom: true, ok: true, removed: [], compression: 'JPEG 2000' },
  ]);
  check('والضغط بيتجمّع مرة واحدة للدراسة', plan.compressed.length === 1 && plan.compressed[0] === 'JPEG 2000');

  // نفس القايمة اللي العارض بيرفض يفكّها — لو اتفرقوا، الرفع هيقول «سليمة»
  // والعارض هيقول «مضغوطة».
  const viewer = raw('public/js/rad-viewer.js');
  const missing = Object.keys(intake.COMPRESSED).filter((ts) => !viewer.includes(ts));
  check('وكل صيغة مضغوطة عند الرفع العارض عارفها كمان', missing.length === 0, missing.join(', ') || 'تمام');
}

/* ── ٤. سقف التكلفة ────────────────────────────────────────────────────── */
{
  check('السقف الافتراضي رقم موجب', budget.dailyCap({}) === budget.DEFAULT_DAILY_USD);
  check('والبيئة بتغيّره', budget.dailyCap({ RAD_AI_DAILY_USD: '5' }) === 5);
  check('والقيمة البايظة بترجع للافتراضي',
    budget.dailyCap({ RAD_AI_DAILY_USD: 'كتير' }) === budget.DEFAULT_DAILY_USD);
  check('والسالب مابيبقاش سقف', budget.dailyCap({ RAD_AI_DAILY_USD: '-2' }) === budget.DEFAULT_DAILY_USD);

  check('التقدير بيزيد بعدد الصور', budget.estimateFor(12) > budget.estimateFor(2));

  // القاعدة اللي البند كله عايزها: مش عارفين = وقف، مش «يلا».
  const unknown = budget.verdict(null, 3, 0.25);
  check('«مش عارفين اتصرف كام» بتقفل مش بتفتح', unknown.ok === false && unknown.why === 'unknown');
  check('والصفر مش نفس مش عارفين', budget.verdict(0, 3, 0.25).ok === true);

  check('واللي عدّى السقف بيترفض', budget.verdict(3.2, 3, 0.01).why === 'over');
  check('واللي الطلب ده هيعدّيه بيترفض قبل ما يتبعت',
    budget.verdict(2.9, 3, 0.25).why === 'would_exceed');
  check('واللي لسه تحته بيعدّي', budget.verdict(1, 3, 0.25).ok === true);
  const left = budget.verdict(1, 3, 0.25);
  check('والباقي محسوب صح', left.remaining === 2);

  const mod = code('src/radiology/budget.js');
  check('والمصروف بيتحسب من الصفوف مش من عمود عدّاد',
    /FROM rad_ai_usage/.test(mod) && !/counter|spent_today\s*=/.test(mod));
  check('والقراءة اللي تفشل بترجع null مش صفر',
    /catch \(e\) \{[\s\S]{0,120}?return null;/.test(mod));
}

/* ── ٥. الوصل في الراوت ────────────────────────────────────────────────── */
{
  const route = code('src/routes/radiology.js');
  check('الرفع بيستعمل قرار الاستقبال مش شرط متكتوب في مكانه',
    /intake\.planUpload\(seen\)/.test(route) && /plan\.refuse/.test(route));
  check('واسم الملف البايظ بيوصل للطبيب', /plan\.badFile/.test(route));
  check('والملفات المتشالة بتتعرض وبتتخزّن',
    /skipped: plan\.skipped/.test(route) && /skipped_files/.test(route));
  check('والضغط بيتخزّن على الدراسة', /compression = \$5/.test(route));
  check('والسقف بيتشاف قبل مكالمة النموذج في التقرير',
    route.indexOf('budget.verdict') < route.indexOf('generateReport({'));
  check('والشات كمان تحت نفس السقف',
    (route.match(/budget\.verdict/g) || []).length >= 3);
  check('واللي اتصرف بيتكتب في جدول الاستهلاك للاتنين',
    (route.match(/INSERT INTO rad_ai_usage/g) || []).length === 2);
  {
    // جوّه راوت التقرير نفسه: الكاش بيرد قبل ما السقف يتحسب، لأن رد من غير
    // مكالمة للنموذج مفيهوش فلوس اتصرفت أصلاً.
    const rep = (route.match(/router\.post\('\/study\/:id\/report'[\s\S]*?\n\}\);/) || [''])[0];
    check('والتقرير المكرّر من الكاش مابيتحسبش على السقف',
      rep.indexOf('hit.reply') > -1 && rep.indexOf('hit.reply') < rep.indexOf('budget.dailyCap()'));
  }

  const ai = code('src/lib/rad_ai.js');
  check('والشات بيرجّع usage عشان تكلفته تتحسب', /usage: data\.usage \|\| \{\}/.test(ai));

  const schema = raw('src/radiology/schema.js');
  check('وجدول الاستهلاك موجود', /CREATE TABLE IF NOT EXISTS rad_ai_usage/.test(schema));
  check('وأعمدة الدراسة الجديدة موجودة',
    /ADD COLUMN IF NOT EXISTS compression TEXT/.test(schema)
    && /ADD COLUMN IF NOT EXISTS skipped_files TEXT/.test(schema));

  const view = raw('src/views/radiology/study.ejs');
  check('وصفحة الدراسة بتقول إن الصور مضغوطة', /study\.compression/.test(view));
  check('وبتعرض حدّ التحليل قبل الضغط', /money\.cap/.test(view));
  check('و«مش قادرين نتأكد» ليها جملتها', /money\.spent === null/.test(view));
}

console.log(fail === 0
  ? '\n✅ الملف الزيادة بيتشال باسمه، والشريحة المجهولة بتوقّف كل حاجة، والفاتورة ليها سقف بيقفل لما يعمى.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
