#!/usr/bin/env node
/**
 * مفتاح توقيع سكرو مايبقاش نص معروف، والكوكي `Secure` على HTTPS.
 *
 * ── الدليل اللي الفحص ده اتكتب بعده ────────────────────────────────────
 *
 * اختبار خارجي (٢٠٢٦-٠٨-٢٧) قرا `/health` على الموقع الحي فلقاه
 * `{"ok":true,"service":"sokro","env":"development"}`. يعني `NODE_ENV`
 * مش متظبّط في النشر — والكود كان معلّق حاجتين على القيمة دي:
 *
 *   ١. `tokenSecret()` كان بيرجّع النص الثابت `'sokro-dev-secret-…'`
 *      لما `NODE_ENV !== 'production'`. نص موجود في المستودع بيوقّع
 *      كل توكن دخول = أي حد يزوّر هوية أي مستخدم.
 *   ٢. `COOKIE.secure` كان بنفس الشرط، فكوكي الدخول كان بينزل من غير
 *      `Secure` على موقع HTTPS.
 *
 * الاتنين اتصلّحوا بإزالة الاعتماد على `NODE_ENV` مش بضبطه: الأمان
 * ماينفعش يبقى معلّق على متغيّر بيئة يتنسى.
 *
 * Usage: node scripts/check-sokro-auth.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
// التعليقات بتتشال: التعليق اللي بيشرح النص الممنوع مايصحّش يفشّل الفحص،
// ولا يعدّي كأنه الكود. (اتكرّرت الغلطة دي قبل كده في المشروع.)
const code = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const auth = code('sokro/auth/index.js');
const router = code('sokro/router.js');

// ── ١) مفيش أي نص ثابت بيتستخدم كمفتاح ────────────────────────────────

check('مفيش نص ثابت بيرجع كمفتاح توقيع',
  !/return\s+[^;]*['"][A-Za-z0-9_-]{8,}['"]/.test(
    (auth.match(/function tokenSecret\(\)\s*\{[\s\S]*?\n\}/) || [''])[0]
  ),
  'نص موجود في المستودع بيوقّع التوكنات = أي حد يزوّر هوية أي مستخدم.');

check('والمفتاح مايعتمدش على `NODE_ENV`',
  !/NODE_ENV/.test((auth.match(/function tokenSecret\(\)\s*\{[\s\S]*?\n\}/) || [''])[0]),
  'الموقع الحي بيرجّع env=development — أي أمان معلّق على المتغيّر ده مطفي.');

check('والبديل عشوائي لكل تشغيل', /crypto\.randomBytes\(32\)/.test(auth),
  'من غير بديل عشوائي، غياب الإعداد معناه مفتاح متوقّع.');

// والسلوك نفسه، مش النص بس: من غير أي إعداد، توقيعين من عمليتين
// مختلفتين لازم يختلفوا — ده اللي بيثبت إن المفتاح عشوائي فعلاً.
const { execFileSync } = require('child_process');
const sig = () => execFileSync(process.execPath, ['-e',
  "delete process.env.SOKRO_JWT_SECRET;delete process.env.SESSION_SECRET;delete process.env.NODE_ENV;"
  + "process.stdout.write(require('" + path.join(ROOT, 'sokro/auth') + "').sign({sub:1},99).split('.')[1])"
], { encoding: 'utf8' });
check('وتشغيلين مختلفين بيدّوا توقيعين مختلفين', sig() !== sig(),
  'نفس التوقيع من عمليتين معناه المفتاح متوقّع — مش عشوائي.');

// ── ٢) الكوكي `Secure` من العنوان مش من البيئة ────────────────────────

const cookie = (router.match(/const COOKIE = \{[^}]*\}/) || [''])[0];
check('كوكي الدخول httpOnly', /httpOnly:\s*true/.test(cookie));
check('و`secure` بيتحسب من العنوان مش من `NODE_ENV`',
  /secure:\s*\/\^https:/i.test(cookie) && !/config\.env/.test(cookie),
  'العنوان بيقول الحقيقة عن البروتوكول؛ متغيّر البيئة بيقول اللي حد '
  + 'افتكر يكتبه — والموقع الحي مكتوب فيه development.');

const config = require('../sokro/core/config');
check('والعنوان الافتراضي https فعلاً', /^https:/i.test(config.origin),
  `العنوان ${config.origin} — الكوكي مش هينزل Secure.`);

console.log(failed ? `\n❌ ${failed} مشكلة` : '\n✅ توقيع سكرو وكوكيه مش معلّقين على متغيّر بيئة');
process.exit(failed ? 1 : 0);
