#!/usr/bin/env node
/**
 * «ابعت على واتساب» في الخطة والتقرير — PDF على جهاز الأخصائي، مش رابط عام.
 *
 * واتساب مابيسمحش لأي رابط يحط ملف جوّه رسالة. الحل الوحيد اللي بيوصّل الملف
 * مرفق هو قايمة مشاركة الجهاز (Web Share). والغلطات اللي الفحص ده بيمنعها:
 *
 * ١) **رفع الخطة لسيرفر أو رابط عام** عشان «يبقى أسهل»: دي بيانات صحية
 *    باسم مريض — رابط عام ليها ملف طبي على الإنترنت. السكربت مايعملش أي
 *    طلب شبكة غير تحميل المكتبة من عندنا.
 * ٢) **المكتبة من CDN**: الموقع كله مبني محلياً (نفس قرار تايلويند)، ونسخة
 *    متحمّلة في public/js/vendor.
 * ٣) **الزرار يفشل في صمت** لما إذن المشاركة يخلص وإحنا بنعمل الملف
 *    (NotAllowedError) — لازم يقول «الملف جاهز — اضغط للإرسال».
 * ٤) **رقم غلط على wa.me**: «010…» محلي بيفتح شات رقم تاني. الرقم بيتحوّل
 *    لدولي، واللي مش واضح بيرجع null (واتساب يختار جهة الاتصال).
 * ٥) الـPDF بيشيل اللي الطباعة بتشيله (أزرار، فورمات، no-print).
 *
 *   node scripts/check-nutrition-whatsapp.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

/* ── ٤: الرقم ─────────────────────────────────────────────────────────── */
const { waPhone } = require('../src/nutrition/whatsapp');
const cases = [
  ['01012345678', '201012345678'], ['٠١٠١٢٣٤٥٦٧٨', '201012345678'],
  ['+20 101 234 5678', '201012345678'], ['00201012345678', '201012345678'],
  ['201012345678', '201012345678'], ['+966501234567', '966501234567'],
  ['0501234567', null], ['1012345678', null], ['', null], [null, null], ['abc', null],
];
for (const [inp, want] of cases) {
  check(`waPhone(${JSON.stringify(inp)}) لازم ${want}`, waPhone(inp) === want);
}

/* ── ١–٣، ٥: السكربت ───────────────────────────────────────────────────── */
{
  const js = code('public/js/share-pdf.js');
  check('السكربت مابيعملش أي طلب شبكة (fetch/XHR/sendBeacon/FormData)',
    !/\bfetch\(|XMLHttpRequest|sendBeacon|FormData/.test(js));
  check('المكتبة من نسختنا المحلية مش CDN',
    /var LIB = '\/js\/vendor\/html2pdf\.bundle\.min\.js'/.test(js) && !/https?:\/\/(?!wa\.me)/.test(js.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('والمكتبة بتتحمّل عند الضغط بس (مش مع الصفحة)', /function loadLib\(\)/.test(js) && /makePdf\(target, name\)/.test(js));
  check('المشاركة بملف بعد canShare، ولو مش مدعوم تنزيل + رابط wa.me',
    /navigator\.canShare\(\{ files: \[file\] \}\)/.test(js) && /if \(!canShareFile\(file\)\) return offerFallback\(file\)/.test(js)
    && /'https:\/\/wa\.me\/' \+ \(phone \|\| ''\) \+ '\?text=' \+ encodeURIComponent/.test(js));
  check('الإذن اللي خلص (NotAllowedError) بيخلّي الملف جاهز للضغطة الجاية',
    /e\.name === 'NotAllowedError'\) \{ ready = file; say\('ready'\)/.test(js));
  check('والإلغاء (AbortError) مابينزّلش الملف ولا يفتح واتساب',
    /e\.name === 'AbortError'\) \{ say\('idle-again'\); return; \}/.test(js));
  check('الـPDF بيشيل اللي الطباعة بتشيله',
    /querySelectorAll\('\.no-print, form, script, header, nav, button/.test(js));
  check('وعرض الـPDF من الصفحة مش رقم ثابت (كان بيتقص من الشمال في العربي)',
    /c\.style\.width = 'auto'/.test(js) && !/c\.style\.width = '\d+px'/.test(js));
}
{
  const v = path.join(ROOT, 'public/js/vendor/html2pdf.bundle.min.js');
  check('نسخة html2pdf موجودة', fs.existsSync(v) && fs.statSync(v).size > 500000);
  check('ورخصتها جنبها', fs.existsSync(v + '.LICENSE.txt'));
}

/* ── الربط في الصفحات ──────────────────────────────────────────────────── */
{
  const part = code('src/views/nutrition_admin/_wa_share.ejs');
  check('الزرار no-print (مايطلعش في الورق ولا في الـPDF)', /class="no-print/.test(part));
  check('واسم الملف من غير حروف ممنوعة ولا نقط في الآخر', /\.replace\(\/\[\.\\s\]\+\$\/, ''\)/.test(part));
  const plan = code('src/views/nutrition_admin/plan.ejs');
  const rep = code('src/views/nutrition_admin/report.ejs');
  check('الخطة فيها الزرار', /include\('_wa_share'/.test(plan));
  check('والتقرير فيه الزرار على الورقة نفسها', /include\('_wa_share'[\s\S]*?target: '\.sheet'/.test(rep));
  const pr = code('src/routes/nutrition_plans.js');
  check('راوت الخطة بيجيب رقم المريض ويحوّله', /pt\.phone AS patient_phone/.test(pr) && /waPhone: waPhone\(data\.plan\.patient_phone\)/.test(pr));
  const ar = code('src/routes/nutrition_admin.js');
  check('وراوت التقرير كمان', /waPhone: waPhone\(data\.patient\.phone\)/.test(ar));
  const s = code('src/i18n/strings.js');
  for (const k of ['btn', 'busy', 'ready', 'done', 'downloaded', 'failed', 'open_chat', 'file_plan', 'file_report', 'msg_plan', 'msg_report']) {
    const n = (s.match(new RegExp(`'nt\\.wa\\.${k}':`, 'g')) || []).length;
    check(`النص nt.wa.${k} بالعربي والإنجليزي`, n === 2);
  }
}

if (errors.length) {
  console.log('❌ check-nutrition-whatsapp:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-nutrition-whatsapp: الـPDF بيتعمل على الجهاز ويتشارك، ومفيش رفع ولا CDN ولا رقم متخمَّن.');
