#!/usr/bin/env node
/**
 * بند «تعليق وإنهاء الخدمة» في الشروط متوازن ومتّسق مع باقي الموقع.
 *
 * ٢٠٢٦-٠٩-٢٤: عميلة (تغذية) قرت «للمنصّة الحق المطلق في تعليق أو إنهاء حسابك…
 * في أي وقت ودون إنذار مسبق ولا التزام بتعويض» على إن المنصّة تقدر تلغي
 * اشتراكها من غير سبب — وده كان بيناقض الأسئلة الشائعة («تقدر تنزّل بياناتك في
 * أي وقت»). قرارات المالك: إنذار ومهلة ٧ أيام · ٣٠ يوم لطلب نسخة البيانات ·
 * الشهري يترد باقيه لو الإنهاء مش غلطة العميل · الشراء الكامل استرداد نسبي في أول
 * ١٢ شهر. الفحص بيمنع رجوع الصياغة القديمة وبيمسك الأرقام.
 *
 *   node scripts/check-terms-termination.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const terms = read('src/views/legal/terms.ejs');
const faq = read('src/views/legal/faq.ejs');

const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const a = terms.indexOf('<h2>12. تعليق وإنهاء الخدمة</h2>');
const b = terms.indexOf('<h2>13.', a);
const sec = a >= 0 && b > a ? terms.slice(a, b).replace(/<%#[\s\S]*?%>/g, '') : '';
const fees = terms.slice(terms.indexOf('<h2>11. الرسوم والدفع</h2>'), a);
check('البند ١٢ موجود', !!sec);
check('مفيش «الحق المطلق» في بند الإنهاء', !/الحق المطلق/.test(sec));
check('مفيش «دون إنذار مسبق ولا التزام بتعويض»', !/دون إنذار مسبق|ولا التزام بتعويض/.test(sec));
check('الإنهاء «لسبب مشروع ومحدّد»', /لسبب مشروع ومحدّد/.test(sec));
check('مهلة الإنذار ٧ أيام في الحالات غير العاجلة', /مهلة 7 أيام/.test(sec));
check('الإجراء الفوري محصور في حالات مذكورة', /يجوز التعليق فوراً ودون مهلة في ثلاث حالات فقط/.test(sec));
check('الشهري: الموقع يكمّل لآخر المدة لو العميل لغى', /يظلّ موقعك يعمل حتى نهاية المدة المدفوعة/.test(sec));
check('الشهري: نردّ الأيام المتبقية لو الإنهاء مش غلطته', /نردّ لك قيمة الأيام المتبقية/.test(sec));
check('الشراء الكامل: استرداد نسبي في أول ١٢ شهر', /أول 12 شهراً من تاريخ الشراء/.test(sec));
check('نسخة البيانات خلال ٣٠ يوم من الإنهاء', /خلال <strong>30 يوماً<\/strong> من تاريخه طلب نسخة كاملة من بياناتك/.test(sec));
check('البند ١١ مابيقولش «غير قابلة للاسترداد» على الإطلاق', !/غير قابلة للاسترداد/.test(fees) && /وفق البند \(12\)/.test(fees));
check('الأسئلة الشائعة لسه بتقول إن البيانات بتتنزّل في أي وقت (متّسقة مع ١٢.٦)', /تقدر تنزّل بياناتك في أي وقت/.test(faq));
const v1 = (read('src/routes/apply.js').match(/const TERMS_VERSION = '([^']+)'/) || [])[1];
const v2 = (read('src/routes/legal.js').match(/const TERMS_VERSION = '([^']+)'/) || [])[1];
check(`رقم إصدار الشروط واحد في التقديم والصفحة (${v1} / ${v2})`, v1 && v1 === v2);
check('الإصدار اتزوّد بعد تعديل البند (≥ 1.1)', v1 && parseFloat(v1) >= 1.1);

if (errors.length) {
  console.log('❌ check-terms-termination:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-terms-termination: الإنهاء لسبب محدّد وبإنذار ٧ أيام، والاسترداد ونسخة البيانات مكتوبين.');
