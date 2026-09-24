#!/usr/bin/env node
/**
 * كل شاشة في لوحة الشركة بتاخد `session`.
 *
 * `_layout_top.ejs` بيقرا `session.themeColor` و`session.companyName` في أول
 * سطور — فأي `res.render('company/…')` لقالب بيستخدم الـlayout ومن غير
 * `session: req.session` بيرمي ReferenceError، والشاشة كلها 500. ده اللي حصل
 * في «الفريق» (/company/staff) — مانوس لقاها ٢٠٢٦-٠٩-٢٤ بالمرجع
 * muf6ufit-5x2y2، وكانت واقعة لكل تاجر مش للديمو بس.
 *
 * وكمان كل قالب بيستخدم الـlayout لازم يحدّد `pageTitle`. «الفريق» و«إعداد
 * المتجر» و«ممنوع» ماكانوش بيحدّدوه، فكانوا شغّالين **بالصدفة**: قالب تاني
 * بيكتب `pageTitle = …` فبيتسرّب متغيّر global. أول زيارة بعد تشغيل السيرفر
 * (بعد كل Republish) كانت 500، واللي بعدها بعنوان الشاشة اللي قبلها.
 *
 *   node scripts/check-company-render-session.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIRS = ['src/routes', 'src/shop', 'src/middleware', 'src/lib'].map((d) => path.join(ROOT, d));
const VIEWS = path.join(ROOT, 'src/views/company');

const errors = [];
let checked = 0;
const sources = DIRS.filter((d) => fs.existsSync(d)).flatMap((d) =>
  fs.readdirSync(d).filter((f) => f.endsWith('.js')).map((f) => path.join(d, f)));
for (const file of sources) {
  const name = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(/res\.render\('company\/([\w/]+)'/g)) {
    const tpl = path.join(VIEWS, m[1] + '.ejs');
    if (!fs.existsSync(tpl) || !/_layout_top/.test(fs.readFileSync(tpl, 'utf8'))) continue;
    // The whole call, to its closing parenthesis.
    let k = src.indexOf('(', m.index) + 1;
    for (let depth = 1; depth && k < src.length; k++) {
      if (src[k] === '(') depth++;
      else if (src[k] === ')') depth--;
    }
    checked++;
    if (!/\bsession\b/.test(src.slice(m.index, k))) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${name}:${line} — company/${m[1]} من غير session (الشاشة هتبقى 500)`);
    }
  }
}

for (const f of fs.readdirSync(VIEWS).filter((x) => x.endsWith('.ejs'))) {
  const v = fs.readFileSync(path.join(VIEWS, f), 'utf8');
  if (!/include\('_layout_top'/.test(v)) continue;
  if (!/pageTitle\s*=/.test(v)) errors.push(`src/views/company/${f} مابيحدّدش pageTitle (500 على أول زيارة بعد التشغيل)`);
}
check_layout: {
  const lay = fs.readFileSync(path.join(VIEWS, '_layout_top.ejs'), 'utf8');
  if (/<title><%= pageTitle %>/.test(lay)) errors.push('_layout_top بيقرا pageTitle من غير typeof — قالب ناقص = 500');
}

if (!checked) errors.push('مالقيتش ولا res.render(\'company/…\') — الفحص نفسه بايظ.');
if (errors.length) {
  console.log('❌ check-company-render-session:');
  errors.forEach((e) => console.log('   · ' + e));
  process.exit(1);
}
console.log(`✅ check-company-render-session: ${checked} شاشة في لوحة الشركة كلها بتاخد session.`);
