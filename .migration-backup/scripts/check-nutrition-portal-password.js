#!/usr/bin/env node
/**
 * مريض التغذية بيغيّر كلمة السر بنفسه — من غير ما يفتح باب.
 *
 * الأخصائي بيعمل كلمة سر عشوائية وبيبعتها على واتساب، فهي عدّت على أكتر من
 * موبايل. المريض من حقه يغيّرها. والغلطات اللي الفحص ده بيمنعها:
 *
 * ١) **تغيير من غير كلمة السر الحالية**: موبايل متساب مفتوح يكفي حد يقفل
 *    صاحبه برّه ويفتح ملفه الطبي بعدين.
 * ٢) **id جاي من الطلب**: الصف لازم يتجاب بـ patient_id من الجلسة و
 *    company_id من الدومين — زي باقي البوابة بالظبط.
 * ٣) **كتابة فوق كلمة سر الأخصائي لسه عاملها**: التحديث مشروط بالـhash
 *    القديم.
 * ٤) الصفحة **مش ورا بوابة الاشتراك** — أمان الحساب مايتقفلش ورا فلوس.
 * ٥) حد أدنى ٨ حروف، وحد لمعدّل المحاولات (بيختبر الحالية = تخمين).
 *
 *   node scripts/check-nutrition-portal-password.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const errors = [];
const check = (label, ok) => { if (!ok) errors.push(label); };

const r = code('src/routes/nutrition_portal.js');
const post = (r.match(/router\.post\('\/password'[\s\S]*?\n\}\);/) || [''])[0];
check('راوت تغيير كلمة السر موجود (GET و POST)', /router\.get\('\/password'/.test(r) && !!post);
check('وعليه حد لمعدّل المحاولات', /router\.post\('\/password', pwLimiter,/.test(post) && /const pwLimiter = rateLimit\(/.test(r));
check('كلمة السر الحالية مطلوبة ومتقارنة', /bcrypt\.compare\(current, u\.password_hash\)/.test(post) && /err=current/.test(post));
check('حد أدنى ٨ حروف', /next\.length < 8/.test(post));
check('والتأكيد لازم يطابق', /next !== confirm/.test(post));
check('الصف بالمريض من الجلسة والعيادة من الدومين',
  /WHERE patient_id=\$1 AND company_id=\$2 AND is_active`,\s*\[req\.patientId, req\.practice\.id\]/.test(post));
check('مفيش id جاي من الطلب', !/req\.params|b\.id|req\.query\.id|b\.patient/.test(post));
check('التحديث مشروط بالـhash القديم والعيادة',
  /UPDATE nutrition_patient_users SET password_hash=\$1\s+WHERE id=\$2 AND company_id=\$3 AND password_hash=\$4/.test(post));
check('والتشفير بنفس تكلفة باقي الموقع', /bcrypt\.hash\(next, BCRYPT_COST\)/.test(post));
check('الصفحة مش ورا بوابة الاشتراك', /const SUB_FREE = \[[^\]]*'\/password'/.test(r));
check('وهي بعد requirePatient (لازم يكون داخل)',
  r.indexOf('router.use(requirePatient);') > 0 && r.indexOf("router.get('/password'") > r.indexOf('router.use(requirePatient);'));

const head = code('src/views/nutrition_portal/head.ejs');
check('رابط «كلمة السر» في هيدر البوابة', /href="\/portal\/password"/.test(head));
const v = code('src/views/nutrition_portal/password.ejs');
check('الفورم بيطلب الحالية والجديدة والتأكيد',
  /name="current"/.test(v) && /name="password"[^>]*minlength="8"/.test(v) && /name="confirm"/.test(v));

const s = code('src/i18n/strings.js');
for (const k of ['link', 'title', 'back', 'sub', 'current', 'new', 'confirm', 'go', 'saved', 'forgot',
  'err_current', 'err_short', 'err_match', 'err_same', 'err_save']) {
  check(`النص np.pw.${k} بالعربي والإنجليزي`, (s.match(new RegExp(`'np\\.pw\\.${k}':`, 'g')) || []).length === 2);
}

if (errors.length) {
  console.log('❌ check-nutrition-portal-password:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log('✅ check-nutrition-portal-password: المريض بيغيّر كلمة السر بالحالية، على صفّه بس، ومش ورا الاشتراك.');
