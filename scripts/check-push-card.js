#!/usr/bin/env node
/**
 * كارت «إشعارات الموبايل» مابيكدبش.
 *
 * فحص مانوس (٢٠٢٦-٠٩-٢٤) لقى الكارت بيقول «تعذّر التحميل» في الديمو. لسببين:
 *   · الديمو بيمنع أي كتابة، فالاشتراك (POST /company/push/subscribe) عمره ما
 *     كان هينجح — الكارت لازم يقول «بتتفعّل من حسابك» ومايسجّلش Service Worker.
 *   · فشل تسجيل الـService Worker (تصفّح خفي، متصفح جوّه تطبيق، متصفح آلي)
 *     كان بيطلع نفس «تعذّر التحميل» اللي بيطلع لو السيرفر وقع. دول حاجتين:
 *     الأولى المتصفح، والتانية إحنا.
 *
 *   node scripts/check-push-card.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../src/views/company/_push_setup.ejs'), 'utf8');

const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const demoAt = src.indexOf('if (isDemo) {');
check('الكارت عارف إنه في ديمو (session.demoReadOnly)', /var isDemo = <%= \(typeof session !== 'undefined' && session && session\.demoReadOnly\) \? 'true' : 'false' %>;/.test(src));
check('الديمو بيرجع قبل أي fetch أو Service Worker',
  demoAt > 0 && demoAt < src.indexOf("fetch('/company/push/config'") && /if \(isDemo\) \{[\s\S]*?return;\s*\}/.test(src));
check('فشل تسجيل الـService Worker ليه رسالة خاصة بالمتصفح',
  /serviceWorker\.register\('\/sw\.js'\)\.catch\(function \(\) \{[\s\S]*?مش متاحة على المتصفح ده/.test(src));
check('رد إعدادات مش 200 بيتعامل كفشل (مش JSON بايظ)', /if \(!r\.ok\) throw/.test(src));
check('«تعذّر التحميل» معاها سطر بيقول يعمل إيه', /تعذّر التحميل[\s\S]{0,120}hint\.textContent = '[^']+'/.test(src));

if (errors.length) {
  console.log('❌ check-push-card:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-push-card: الديمو بيقول «بتتفعّل من حسابك»، وفشل المتصفح غير فشل السيرفر.');
