#!/usr/bin/env node
/**
 * أي حقل الراوت بيقراه من الفورم لازم يكون له خانة في الفورم.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: شاشة إضافة العربية في الورشة.
 * العمود `engine` موجود في المخطط، والراوت بيقرا `b.engine` ويحطه في
 * الـINSERT، والترجمة `wsh.veh.engine` موجودة باللغتين — **والخانة نفسها
 * مش موجودة في الفورم**. فرقم الموتور كان بيتسجّل فاضي في كل عربية،
 * وكل حاجة تانية شكلها سليم فمحدش واخد باله. نفس الحكاية مع `gearbox`
 * و`fuel` و`service_km` و`service_months`.
 *
 * واتكشف إزاي؟ **عميلة سألت عنه بالاسم قبل ما تشترك.** ودي أغلى طريقة
 * ممكن تكتشف بيها ميزة نص مخلّصة.
 *
 * الفحص بيقارن الاتنين لكل شاشة: الحقول اللي الراوت بيقراها من `req.body`
 * ويكتبها في الداتابيز، والخانات اللي في القالب. أي حقل في الأول ومش في
 * التاني = خانة ناقصة.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };

/* الشاشات المغطّاة: [ملف الراوت, اسم الجدول, قالب الفورم].
 * زوّد سطر هنا لما تعمل شاشة إدخال جديدة. */
const SCREENS = [
  ['src/routes/workshop_admin.js', 'workshop_vehicles',    'src/views/workshop_admin/vehicles.ejs'],
  ['src/routes/workshop_admin.js', 'workshop_technicians', 'src/views/workshop_admin/technicians.ejs'],
];

/* الكومنتات بتتشال الأول. ده درس متكرر في المشروع: فحص بيقرا كومنت
 * ويفتكره كود بيدّي نتيجة غلط في الاتجاهين. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

for (const [routeFile, table, viewFile] of SCREENS) {
  const routePath = path.join(ROOT, routeFile);
  const viewPath = path.join(ROOT, viewFile);
  if (!fs.existsSync(routePath) || !fs.existsSync(viewPath)) {
    fail(`ملف ناقص لشاشة ${table}: ${!fs.existsSync(routePath) ? routeFile : viewFile}`);
    continue;
  }

  const route = stripComments(fs.readFileSync(routePath, 'utf8'));
  const view = fs.readFileSync(viewPath, 'utf8');

  /* بندوّر على INSERT للجدول ده، وناخد قايمة الأعمدة وقايمة القيم اللي
   * بعدها — عشان نعرف أي عمود جاي من `b.<اسم>` يعني من الفورم. */
  const ins = route.indexOf(`INSERT INTO ${table}`);
  if (ins < 0) { fail(`ما لقيتش INSERT INTO ${table} في ${routeFile}`); continue; }

  // الحقول اللي بتتقرا من جسم الطلب في نفس نداء الاستعلام
  const chunk = route.slice(ins, ins + 2000);
  const bodyFields = [...new Set(
    [...chunk.matchAll(/\bb\.([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]),
  )];
  if (!bodyFields.length) { fail(`ما لقيتش أي حقل بيتقرا من الفورم في INSERT بتاع ${table}`); continue; }

  const inputs = new Set(
    [...view.matchAll(/\bname\s*=\s*["']([a-z_][a-z0-9_]*)["']/gi)].map((m) => m[1]),
  );

  const missing = bodyFields.filter((f) => !inputs.has(f));
  if (missing.length) {
    fail(
      `${viewFile}: الراوت بيقرا ${missing.map((f) => `«${f}»`).join('، ')} ` +
      `من الفورم، ومفيش خانة ليهم — فبيتسجّلوا فاضيين دايماً.`,
    );
  }
}

if (!process.exitCode) {
  console.log(`✅ كل حقل الراوت بيقراه من الفورم له خانة فعلاً (${SCREENS.length} شاشة)`);
}
