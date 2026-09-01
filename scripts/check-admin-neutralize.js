#!/usr/bin/env node
/**
 * شلّ حساب الأدمن الافتراضي القديم لازم ينجح فعلاً — مش يفشل بالصمت.
 *
 * الغلط اللي الفحص ده اتعمل عشانه: الكود كان بيعمل
 *
 *     DELETE FROM admins WHERE email = 'admin@oscardevs.com'
 *
 * و`signup_applications.reviewer_id` بيشاور على `admins(id)`. فلو الحساب
 * القديم راجع أي طلب تقديم، بوستجرس بيرفض المسح:
 *
 *     update or delete on table "admins" violates foreign key
 *
 * والخطأ كان بيتلمّ في `catch` بتاع `initDb` كـ«DB init warning» — يعني
 * **الحماية كانت بتفشل كل إقلاع والحساب الافتراضي فاضل شغّال في قاعدة
 * الإنتاج**، ومحدش واخد باله لأن اللوج بيقول «warning» مش «failed».
 *
 * والمسح غلط من ناحية تانية كمان: لو نجح كان هيضيّع سجل مين راجع أنهي طلب.
 *
 * الفحص بيتأكد من تلاتة:
 *   ١. مفيش `DELETE FROM admins` تاني.
 *   ٢. الشلّ بيتعمل بـ`UPDATE … password_hash` بقيمة مولّدة من crypto.
 *   ٣. الهاش مش نص ثابت في الكود — ثابت معناه إن أي حد قرا الكود يعرفه.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')       // الكومنتات الأول — درس متكرر
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

let fail = 0;
const check = (label, ok, detail) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok || !detail ? '' : ' — ' + detail));
  if (!ok) fail += 1;
};

check('مفيش DELETE على جدول الأدمنز',
  !/DELETE\s+FROM\s+admins/i.test(src),
  'المسح بيصطدم بالمفتاح الأجنبي بتاع reviewer_id وبيفشل بالصمت.');

const block = (src.match(/adminEmail\s*!==\s*'admin@oscardevs\.com'[\s\S]{0,700}/) || [''])[0];
check('الحساب الافتراضي القديم بيتشلّ بـUPDATE على password_hash',
  /UPDATE\s+admins\s+SET\s+password_hash/i.test(block),
  block ? 'مالقيتش UPDATE في البلوك' : 'مالقيتش بلوك الشلّ أصلاً');

check('والهاش مولّد عشوائياً مش ثابت في الكود',
  /randomBytes\(/.test(block),
  'قيمة ثابتة معناها إن اللي بيقرا الكود يعرف يدخل.');

console.log(fail
  ? `\n${fail} مشكلة — الحساب الافتراضي ممكن يفضل شغّال في الإنتاج.`
  : '\nالحساب الافتراضي القديم بيتقفل فعلاً، وسجل المراجعات بيفضل سليم.');
process.exit(fail ? 1 : 0);
