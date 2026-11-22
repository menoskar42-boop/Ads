#!/usr/bin/env node
/**
 * check-maintenance-error-page — صفحة الخطأ لازم ترسم فى أسوأ حالة.
 *
 * الحالة اللى حصلت: فنى الصيانة ضغط على صورة مش ظاهرة، فطلعت رسالة EJS طويلة
 * آخرها «user is not defined» — ومحدّش عرف إيه اللى غلط فى الصورة أصلاً.
 *
 * السبب: `error.ejs` بيـinclude ‏`partials/header.ejs`، والهيدر بيستخدم
 * `user` و`title` و`flash`. القيم دى بتتحط فى middleware بيجى **بعد** كذا
 * راوت (الصور والـAPI قبل الجلسة أصلاً) — فأى خطأ قبلها بيخلّى صفحة الخطأ
 * نفسها تقع، وتاكل السبب الحقيقى معاها.
 *
 * وده أسوأ نوع فشل: مش بس الحاجة وقعت — الرسالة اللى المفروض تقولك ليه
 * وقعت هى كمان وقعت.
 *
 * الفحص **بيرسم القالب فعلاً** بـEJS فى أسوأ حالة (من غير أى locals غير
 * السبب نفسه) ويتأكد إنه مابيرميش وإن السبب بيوصل للصفحة.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VIEWS = path.join(ROOT, 'serviceflow/server/maintenance/app/views');
const APP = path.join(ROOT, 'serviceflow/server/maintenance/app/app.js');
const errors = [];

if (!fs.existsSync(path.join(VIEWS, 'error.ejs'))) {
  console.log('check-maintenance-error-page: مفيش موقع الصيانة — تخطّى');
  process.exit(0);
}

let ejs;
try { ejs = require('ejs'); }
catch { console.log('check-maintenance-error-page: ejs مش متسطّب — تخطّى'); process.exit(0); }

// ── ١. بترسم من غير أى locals اختيارية ──────────────────────────────────
const MARK = 'سبب-الخطأ-الحقيقى-للاختبار';
let html = null;
try {
  html = ejs.renderFile
    ? require('ejs').render(fs.readFileSync(path.join(VIEWS, 'error.ejs'), 'utf8'),
        { title: 'خطأ', message: MARK }, { filename: path.join(VIEWS, 'error.ejs') })
    : null;
} catch (e) {
  const last = String(e.message).split('\n').filter(Boolean).pop();
  errors.push(`صفحة الخطأ بترمى وهى بترسم: «${last}» — يعنى السبب الحقيقى هيتاكل`);
}
if (html && !html.includes(MARK)) {
  errors.push('صفحة الخطأ اترسمت من غير ما تعرض رسالة السبب — المستخدم مش هيعرف إيه اللى حصل');
}

// ── ٢. القيم الافتراضية العامة موجودة (شبكة الأمان للتطبيق الشغّال) ─────
if (fs.existsSync(APP)) {
  const app = fs.readFileSync(APP, 'utf8');
  for (const k of ['user', 'flash', 'title']) {
    if (!new RegExp(`app\\.locals\\.${k}\\s*=`).test(app)) {
      errors.push(`مفيش \`app.locals.${k}\` — أى قالب بيترسم قبل الـmiddleware هيقع عليه`);
    }
  }
  if (!/req\.session\?\.\s*user/.test(app)) {
    errors.push('قراءة `req.session.user` مش آمنة (?.) — خطأ قبل الجلسة هيرمى TypeError');
  }
}

if (errors.length) {
  console.error('❌ check-maintenance-error-page:');
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log('✅ check-maintenance-error-page: صفحة الخطأ بترسم من غير locals وبتعرض السبب');
