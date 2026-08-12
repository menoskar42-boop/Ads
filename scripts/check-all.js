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
  ['check-kakeibo-i18n',    'قاموس كاكيبو + توازن القوالب'],
  ['check-payday',          'فترة الراتب: البداية ≤ النهارده < الجاي'],
  ['check-kakeibo-stats',   'حساب «تقدر تصرف النهارده» (مفيش خصم مزدوج)'],
  ['check-kakeibo-routes',  'راوتات كاكيبو بتردّ صح (redirects + الحفظ)'],
  ['check-schema-order',    'ترتيب الـDDL (ALTER بعد CREATE)'],
  ['check-schema-columns',  'أعمدة الـINSERT موجودة في المخطط'],
  ['check-async-routes',    'أخطاء الـasync لا تعلّق الطلب'],
  ['check-page-types',      'أنواع النشاط مكتملة في كل الأماكن'],
  ['check-robots',          'robots.txt: كل بوت شايل قواعد المنع'],
  ['check-apply-track',     'متابعة الطلب بالتوكن + الفورم مايكشفش'],
  ['check-route-order',     'ترتيب الـroutes (الصفحات العامة قبل المحميّة)'],
  ['check-shared-pool',     'بوول قاعدة البيانات المشترك + حماية الباسورد'],
  ['check-no-secrets',      'مفيش بيانات دخول في الكود'],
  ['check-neuropilot-app',  'تطبيق NeuroPilot وصفحته'],
  ['check-demo-links',      'روابط «شاهد نموذج حي» تفتح فعلاً'],
  ['render-clinic-pages',   'صفحات العيادة بالعربي والإنجليزي'],
  ['render-kakeibo-pages',  'شاشات كاكيبو'],
  ['seo-audit',             'SEO و AdSense للصفحات العامة'],
];

let failed = 0;
let skipped = 0;
for (const [name, what] of CHECKS) {
  process.stdout.write(name.padEnd(24));
  try {
    execFileSync(process.execPath, [path.join(__dirname, name + '.js')], { stdio: 'pipe' });
    console.log('✅  ' + what);
  } catch (e) {
    // Exit 2 means the check could not run (missing node_modules), not that it
    // found something. Showing that as a pass would turn an environment gap
    // into a green tick nobody questions.
    if (e.status === 2) {
      skipped += 1;
      console.log('⏭️   ' + what + ' — اتخطّى (حزم ناقصة، مش نتيجة)');
      continue;
    }
    failed += 1;
    console.log('❌  ' + what);
    const out = ((e.stdout || '') + (e.stderr || '')).toString();
    out.split('\n').filter((l) => /^(❌|\s+·|\s{3})/.test(l)).slice(0, 8)
      .forEach((l) => console.log('    ' + l.trim()));
  }
}
const tail = skipped ? ` (و${skipped} اتخطّى)` : '';
console.log(failed ? `\n⚠️  ${failed} فحص فشل${tail}.` : `\nكل الفحوص عدّت${tail}.`);
process.exit(failed ? 1 : 0);
