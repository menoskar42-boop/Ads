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
  ['check-canonical-urls',  'الكانونيكال بيتركّب صح + مفيش محتوى مخترع'],
  ['check-inline-json',     'مفيش JSON خام جوّه <script> (XSS مخزّن)'],
  ['check-demo-readonly',   'وضع العرض قراءة فقط في التطبيق كله'],
  ['check-sql-reserved',    'مفيش كلمة محجوزة كاسم مستعار في SQL'],
  ['check-order-idempotency','ضغطتين على «اشتري» = أوردر واحد'],
  ['check-order-reversal',  'الإلغاء بيرجّع الفلوس والنقاط والمخزون مرة واحدة'],
  ['check-money-input',     'أرقام الفلوس من الفورم محدودة (مفيش خصم سالب)'],
  ['check-revenue-truth',   'الإيراد بيعدّ اللي اتباع بس (مش الملغي)'],
  ['check-coupon-bounds',   'الكوبون مايعديش السلة (مفيش ١٥٠٪)'],
  ['check-pay-intent',      'نيّة الدفع بتتعمل مرة (مفيش دفع مزدوج)'],
  ['check-shipping-zone',   'الشحن بيتسعّر من مناطق التاجر (مفيش شحن ببلاش)'],
  ['check-installment-cap', 'التحصيل في العيادة متقصوص على المستحق'],
  ['check-pay-callback',    'كولباك الدفع بيتحقّق من المبلغ مش من التوقيع بس'],
  ['check-random-codes',    'الأكواد اللي بفلوس مولّدة من crypto'],
  ['check-robots',          'robots.txt: كل بوت شايل قواعد المنع'],
  ['check-pharmacy-expiry', 'متابعة صلاحيات الصيدلية + صدق الادعاء'],
  ['check-gs1',             'باركود العلب المصرية (GS1 DataMatrix)'],
  ['check-batches',         'التشغيلات: الأقرب انتهاءً بيتباع الأول + سحب دفعة'],
  ['check-returns',         'المرتجعات: التحصيل بيطرح نفسه + الرجوع للتشغيلة'],
  ['check-pos-till',        'التل: خصم باعتماد مدير + تعليق فاتورة'],
  ['check-installments-down','المقدّم في قسّطلي: تحصيل مش قسط'],
  ['check-portfolio',       'البورتفوليو: مفيش أعمال مخترعة ولا وعد كاذب'],
  ['check-pricing',         'الأسعار متطابقة في كل مكان بتتذكر فيه'],
  ['check-tracking',        'أحداث التسويق بتتبعت فعلاً (مش PageView بس)'],
  ['check-tenant-isolation','عزل المستأجرين: مفيش كتابة على مريض عيادة تانية'],
  ['check-audit-log',       'سجل الوصول للبيانات الطبية (بيتضاف عليه بس)'],
  ['check-clinic-perms',    'صلاحيات العيادة: الاستقبال مايقراش تشخيص'],
  ['check-food-perms',      'صلاحيات المطعم: المطبخ مايشوفش عنوان العميل'],
  ['check-nutrition-perms', 'صلاحيات التغذية: الاستقبال مايفتحش تحليل'],
  ['check-dicom-deident',   'هوية المريض بتتشال من هيدر الـDICOM'],
  ['check-order-flow',      'الحالة النهائية مابترجعش (مفيش بيع مرتين)'],
  ['check-nutrition',       'محرّك سعرات التغذية + عزل بوابة المريض'],
  ['check-payment-secrets', 'مفاتيح الدفع مشفّرة ومش بتتعرض'],
  ['check-apply-track',     'متابعة الطلب بالتوكن + الفورم مايكشفش'],
  ['check-route-order',     'ترتيب الـroutes (الصفحات العامة قبل المحميّة)'],
  ['check-shared-pool',     'بوول قاعدة البيانات المشترك + حماية الباسورد'],
  ['check-no-secrets',      'مفيش بيانات دخول في الكود'],
  ['check-neuropilot-app',  'تطبيق NeuroPilot وصفحته'],
  ['check-demo-links',      'روابط «شاهد نموذج حي» تفتح فعلاً'],
  ['render-clinic-pages',   'صفحات العيادة بالعربي والإنجليزي'],
  ['render-kakeibo-pages',  'شاشات كاكيبو'],
  ['seo-audit',             'SEO و AdSense للصفحات العامة'],
  ['seo-audit-tenants',     'SEO و AdSense لصفحات المستأجرين (١٢ قطاع)'],
  ['check-sitemap',         'السايت‌ماب مايدرجش صفحة noindex'],
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
