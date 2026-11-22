#!/usr/bin/env node
/**
 * check-sf-excel-copy — نسخ مسلسل طويل من سيرفس فلو لإكسيل مايبوظش.
 *
 * إكسيل بيحفظ ١٥ رقم بس: مسلسل متعذر ٢٠ رقم (26060111542441081656) كان بيتلزق
 * 26060111542441000000 والباقى بيضيع، والتليفون 0101… بيفقد الصفر. الحل فى
 * client/src/lib/excel-safe-copy.ts: وقت النسخ، الخلية الخطر بتتبعت لإكسيل بـ
 * mso-number-format:"\@" (نص)، والنص العادى زى ما هو لباقى البرامج.
 * اتجرّب فى كروميوم (٢٠٢٦-٠٩-٢٣): المسلسل والتليفون بيتعلّموا نص، الرقم القصير
 * والنسخ من خانة كتابة مابيتلمسوش.
 */
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', 'serviceflow', p), 'utf8');
const errors = [];
const need = (c, m) => { if (!c) errors.push(m); };

const lib = R('client/src/lib/excel-safe-copy.ts');
const main = R('client/src/main.tsx');
need(/import \{ installExcelSafeCopy \} from "\.\/lib\/excel-safe-copy";/.test(main) && /\ninstallExcelSafeCopy\(\);/.test(main),
  'main.tsx لازم يشغّل installExcelSafeCopy() — من غيره المسلسل بيتلزق فى إكسيل آخره أصفار.');
need(/const RISKY_LONG = \/\^\\d\{16,\}\$\/;/.test(lib), 'الرقم الطويل = ١٦ رقم أو أكتر (إكسيل بيحفظ ١٥).');
need(/const RISKY_ZERO = \/\^0\\d\{5,\}\$\/;/.test(lib), 'الرقم اللى بيبدأ بصفر (تليفون) لازم يتحمى.');
need(/mso-number-format:"\\\\@"/.test(lib), 'الخلية الخطر لازم تتبعت بـ mso-number-format:"\\@" (نص فى إكسيل).');
need(/setData\("text\/plain", text\)/.test(lib), 'النص العادى لازم يفضل زى ما هو لباقى البرامج.');
need(/inEditable\(document\.activeElement\)/.test(lib) && /input, textarea/.test(lib), 'النسخ من خانات الكتابة مايتلمسش.');
need(/if \(!html\) return;/.test(lib), 'النسخ اللى مافيهوش رقم خطر لازم يفضل زى المتصفح بالظبط.');

// الدالة نفسها
const ts = (() => { try { return require(path.join(__dirname, '..', 'serviceflow', 'node_modules', 'typescript')); } catch { return null; } })();
if (ts) {
  const js = ts.transpileModule(lib, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const m = { exports: {} }; new Function('module', 'exports', js)(m, m.exports);
  const { isExcelRiskyNumber: risky, excelSafeHtml: html } = m.exports;
  need(risky('26060111542441081656') && risky('01012345678') && !risky('4463217') && !risky('26060111542441') && !risky('0101'),
    'isExcelRiskyNumber: ٢٠ رقم وتليفون بصفر = خطر؛ ٧ أرقام و١٤ رقم و٤ بصفر = لأ.');
  need(html('4463217') === null && html('المرجع 26060111542441081656 الفنى') === null, 'نص عادى أو رقم قصير = مفيش HTML.');
  need(/^<table><tr><td>زكريا<\/td><td style='mso-number-format:"\\@"'>26090709522444100123<\/td><\/tr>/.test(html('\nزكريا\t26090709522444100123\n') || ''),
    'نسخ جدول: مفيش صف فاضى فى الأول، والخلية الخطر بس اللى بتتعلّم نص.');
}

if (errors.length) { console.log('❌ check-sf-excel-copy:'); errors.forEach((e) => console.log('   · ' + e)); process.exit(1); }
console.log('✅ check-sf-excel-copy: المسلسل الطويل والتليفون بيتنسخوا لإكسيل كنص، والباقى زى ما هو.');
