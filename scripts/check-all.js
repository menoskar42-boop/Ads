#!/usr/bin/env node
/**
 * Run every check in one go. Added after a full-codebase audit so the same
 * sweep is one command instead of eight remembered ones.
 *
 * Usage: node scripts/check-all.js
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const CHECKS = [
  ['check-i18n',            'القاموس ثنائي اللغة'],
  ['check-schema-order',    'ترتيب الـDDL (ALTER بعد CREATE)'],
  ['check-schema-columns',  'أعمدة الـINSERT موجودة في المخطط'],
  ['check-async-routes',    'أخطاء الـasync لا تعلّق الطلب'],
  ['check-page-types',      'أنواع النشاط مكتملة في كل الأماكن'],
  ['check-route-order',     'ترتيب الـroutes (الصفحات العامة قبل المحميّة)'],
  ['check-shared-pool',     'بوول قاعدة البيانات المشترك + حماية الباسورد'],
  ['check-no-secrets',      'مفيش بيانات دخول في الكود'],
  ['check-neuropilot-app',  'تطبيق NeuroPilot وصفحته'],
  ['render-clinic-pages',   'صفحات العيادة بالعربي والإنجليزي'],
  ['render-kakeibo-pages',  'شاشات كاكيبو'],
  ['seo-audit',             'SEO و AdSense للصفحات العامة'],
];

let failed = 0;
for (const [name, what] of CHECKS) {
  process.stdout.write(name.padEnd(24));
  try {
    execFileSync(process.execPath, [path.join(__dirname, name + '.js')], { stdio: 'pipe' });
    console.log('✅  ' + what);
  } catch (e) {
    failed += 1;
    console.log('❌  ' + what);
    const out = ((e.stdout || '') + (e.stderr || '')).toString();
    out.split('\n').filter((l) => /^(❌|\s+·|\s{3})/.test(l)).slice(0, 8)
      .forEach((l) => console.log('    ' + l.trim()));
  }
}
console.log(failed ? `\n⚠️  ${failed} فحص فشل.` : '\nكل الفحوص عدّت.');
process.exit(failed ? 1 : 0);
