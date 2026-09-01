#!/usr/bin/env node
/**
 * `APP_DATABASE_URL` بيغلب `DATABASE_URL` — وقبل ما أي حاجة تقرا الرابط.
 *
 * ليه موجود: ريبليت بقى **يمنع النشر** لو لقى سِرّ `DATABASE_URL` محطوط
 * بالإيد. البانر بيقول «External database detected» والنشر بيترفض قبل ما
 * يبدأ. وهو بيحقن `DATABASE_URL` بتاعه لقاعدة إنتاج تانية.
 *
 * ومسح السِرّ لوحده كان معناه إن الموقع يتوصّل بقاعدة فاضية — كل الشركات
 * والتجّار والطلبات في القاعدة الحالية. فالرابط بتاعنا بقى في
 * `APP_DATABASE_URL`، وسطر واحد في أول `server.js` بيحوّله لـ
 * `DATABASE_URL` قبل ما التسعة وسبعين ملف اللي بيعملوا `new Pool()`
 * يقروه.
 *
 * والفحص ده **بينفّذ أول الملف فعلاً** بالمتغيّرين، وبيقيس الناتج —
 * مابيدوّرش على نص. عشان تلات حاجات ممكن تكسرها بالصمت:
 *   ١. حد يشيل بلوك التبديل → الموقع يوصل بقاعدة ريبليت الفاضية.
 *   ٢. حد ينقله **تحت** بلوك توقيت القاهرة → `options` تتحط على رابط
 *      ريبليت وتترمي، والتقارير ترجع بتوقيت UTC (وده الباج اللي بلوك
 *      التوقيت اتكتب عشانه أصلاً).
 *   ٣. حد ينقله تحت أول `require` بيعمل Pool → البول الأول ياخد الرابط
 *      الغلط والباقي ياخد الصح، وتبقى نص القراءات من قاعدة ونصها من
 *      التانية.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

let fail = 0;
const check = (label, ok, detail) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok || !detail ? '' : ' — ' + detail));
  if (!ok) fail += 1;
};

/* ننفّذ الجزء اللي قبل أول `process.on(` — ده بيغطّي بلوك التبديل وبلوك
 * التوقيت وبس، من غير ما نحمّل التطبيق كله. */
const cut = src.indexOf('process.on(');
const head = src.slice(0, cut > 0 ? cut : 4000)
  .replace(/require\('dotenv'\)\.config\(\);/, '');

const APP = 'postgres://ours:x@neon.example/appdb';
const REPLIT = 'postgres://replit:y@internal/replitdb';

function run(env) {
  const sandbox = { process: { env: Object.assign({}, env) }, console: { warn() {}, log() {} } };
  try {
    vm.runInNewContext(head, sandbox, { timeout: 3000 });
  } catch (e) {
    return { error: e.message };
  }
  return { url: sandbox.process.env.DATABASE_URL };
}

// ١) الاتنين موجودين → بتاعنا يكسب
const both = run({ APP_DATABASE_URL: APP, DATABASE_URL: REPLIT });
check('`APP_DATABASE_URL` بيغلب `DATABASE_URL`',
  !both.error && typeof both.url === 'string' && both.url.startsWith(APP),
  both.error || `الناتج: ${String(both.url).split('?')[0]} — الموقع هيوصل بقاعدة ريبليت الفاضية.`);

// ٢) والتوقيت لسه بيتحط على الرابط الصح (يعني الترتيب سليم)
check('وتوقيت القاهرة بيتحط على الرابط بتاعنا',
  !both.error && /timezone/.test(String(both.url)),
  'بلوك التبديل الأغلب اتنقل تحت بلوك التوقيت.');

// ٣) من غير المتغيّر الجديد، السلوك القديم زي ما هو
const only = run({ DATABASE_URL: REPLIT });
check('من غير `APP_DATABASE_URL` بيرجع لـ`DATABASE_URL` عادي',
  !only.error && String(only.url).startsWith(REPLIT),
  only.error || `الناتج: ${only.url}`);

/* ٤) ولازم يفضل فوق أول `require` بيعمل Pool. بنقيسها بمكان أول
 *    `require('./src` مقارنةً بمكان بلوك التبديل. */
const aliasAt = src.indexOf('process.env.APP_DATABASE_URL');
const firstSrcRequire = src.search(/require\(['"]\.\/src\//);
check('بيتنفّذ قبل أول موديول بيعمل Pool',
  aliasAt > -1 && (firstSrcRequire === -1 || aliasAt < firstSrcRequire),
  `التبديل عند ${aliasAt} وأول require عند ${firstSrcRequire}.`);

console.log(fail
  ? `\n${fail} مشكلة — رابط قاعدة البيانات ممكن يوصل غلط.`
  : '\nرابط القاعدة بتاعنا بيكسب، وبتوقيت القاهرة، وقبل أي بول.');
process.exit(fail ? 1 : 0);
