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
  // FIRST, always. Everything below reads source files as text, so all of them
  // pass happily on a codebase that does not compile — which is exactly what
  // happened: src/pharmacy/schema.js stopped parsing, server.js requires it,
  // and the whole suite stayed green while the site would not boot.
  ['check-syntax',          'كل ملف بيتقرا فعلاً (الموقع بيقوم)'],
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
  ['check-csrf',            'طلب من صفحة تانية بيتوقف (CSRF عبر السَبدومين)'],
  ['check-request-identity','«الطلب جاي منين» من عندنا مش من كلام العميل (IP + استثناء CSRF)'],
  ['check-upstream-bounds','مفيش انتظار بلا مهلة ولا مدخل بلا حد'],
  ['check-audit-followups','اللي اتعمل صح في مكان معمول صح في كل مكان'],
  ['check-sokro-whatsapp','كل مستخدم بيبعت من رقم واتساب بتاعه هو'],
  // تلات فحوص كانوا موجودين في `scripts/` **ومش مسجّلين هنا** — واحد منهم
  // (`check-sokro-six`) كان واقع من غير ما حد ياخد باله، لأنه بيختبر شكل
  // الواتساب القديم. الفحص اللي مش في القايمة دي فحص بيسوّس.
  ['check-sokro-six',       'فحوص سوكرو الجديدة (وقت · حجز · قنوات)'],
  ['check-sokro-security',  'أمن سوكرو (SSRF والصلاحيات)'],
  ['check-clinic-i18n',     'قاموس العيادة باللغتين'],
  ['check-compare-page','صفحة المقارنة بأرقامنا من الكود وبلا اسم منافس'],
  ['check-tenant-clone','خطة نسخ المستأجر: الشركة الجديدة، والمفتاح المعلّق بيترفض'],
  ['check-trace-judge','«كتب الحرف صح» عن كتابة مش عن شخبطة'],
  ['check-deals','موقع Deals: امتثال أمازون، أرشفة الصفحات، وقوالب بترندر'],
  ['check-company-facts','حقائق الشركة من مصدر واحد — والعدد محسوب مش مخزّن'],
  ['check-static-apps','mykid و neuropilot: محتوى مرئي حقيقي، ومفيش cloaking'],
  ['check-demo-lead','الديمو بيلتقط عميل — من غير ما يقفل الديمو'],
  ['check-articles','روابط المقالات بتوصل، ومفيش موضوع مكرّر يأكل التاني'],
  ['check-services','خدمات التطوير المخصّص خدمات — مش أنظمة تتزوّد على الـ١٢'],
  ['check-lang-routes','اللغة في الرابط: التحويلات ٣٠١، والتجّار والتوكنات ماتتلمسش'],
  ['check-social-prompts','برومبتات البوستات مطابقة للأسعار والديموهات والروابط'],
  ['check-demo-ads','الديمو مايتأرشفش ومايشيلش إعلانات — والترتيب هو الضمان'],
  ['check-contact-form','نموذج التواصل بيرفض الإيميل والرقم الغلط، والخليج مفتوح'],
  ['check-card-theme','زراير الأنظمة كلها زراير — مفيش زرار شفاف وسط ملوّنة'],
  ['check-lead-import','استيراد العملاء المحتملين: مفيش رقم مخمّن ولا تصنيف غلط'],
  ['check-form-labels','كل حقل في النماذج العامة له label مرتبط فعلاً'],
  ['check-schema-urls','عناوين البيانات المنظّمة = الكانونيكال بالظبط'],
  ['check-404','صفحة الخطأ: بلا إعلانات، noindex، وكل رابط بيوصل على طول'],
  ['check-cron-and-limits','مفاتيح cron بالهيدر بس، وحدّ الدخول ببوكتين'],
  ['check-kid-mic','ميكروفون الأطفال بيتطلب وقت الضغطة، والرفض بيقول سببه'],
  ['check-login-leak',      'الدخول مابيكشفش حالة الطلب ولا ملاحظات المراجعة'],
  ['check-upload-type',     'الملف المرفوع بيتفحص من بايتاته مش من كلام العميل'],
  ['check-receipt-privacy', 'إيصالات كاكيبو مابتتفتحش غير لصاحبها'],
  ['check-session-secret',  'مفيش سرّ جلسة افتراضي في الكود'],
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
  ['check-foreign-ids',     'كل معرّف من الطلب متقيّد بالشركة (كنس شامل)'],
  ['check-class-booking',   'سعة كلاس الجيم ورا قفل + حجز واحد للشخص'],
  ['check-appointment-slot','ميعاد العيادة ورا قفل + فهرس فريد'],
  ['check-offline-sync',    'مزامنة POS الأوفلاين مابتخصمش مرتين'],
  ['check-reserved-stock',  'المحجوز مايعديش الموجود في الصيدلية'],
  ['check-negative-stock',  'مفيش بيع ولا صرف لمخزون مش موجود'],
  ['check-medicine-sync',   'المزامنة مابتمسحش تصحيح الصيدلي ولا بتكرّر دوا'],
  ['check-branch-scope',    'فلتر الفرع بيوصل للأرقام في موبيليا'],
  ['check-gym-members',     'أرقام الجيم عن أعضاءه (عدّ · كود · حضور · تجميد)'],
  ['check-receivables',     'كارت المستحقات = كشف العميل (حسبة واحدة)'],
  ['check-notifications',   'التنبيه اليومي مرة واحدة + الميل مابيكدبش'],
  ['check-subscription-skip','التجديد اللي مامشيش بيتقال مش بيعدّي شهر'],
  ['check-timezone',        'كل اتصال بالقاعدة بتوقيت القاهرة'],
  ['check-dates-and-slots', 'الضمان بالأيام · شهر الحضانة الناقص · فرح واحد للقاعة'],
  ['check-einvoice-submit', 'المستند الضريبي مايتقدّمش مرتين'],
  ['check-booking-switch',  'زر تفعيل الحجز بيوقف الحجز فعلاً'],
  ['check-save-truth',      '«اتحفظ» مابتظهرش على حاجة مااتحفظتش'],
  ['check-food-numbers',    'قيم الأطعمة مابتتحوّلش صفر بصمت'],
  ['check-status-labels',   'كل حالة طلب ليها اسم يتقري باللغتين'],
  ['check-customer-i18n',   'صفحات العميل بلغته وبعملة المتجر'],
  ['check-site-dict',       'قاموس الدومينات: الاسم العربي بيرجّع الموقع'],
  ['check-site-discovery',  'الموقع المش معروف بيتلاقى بالبحث مش بالتخمين'],
  ['check-site-message',    'اللي مابيتفتحش بيتقال ليه بجملة مفهومة'],
  ['check-mobile-tools',    'الموبايل بياخد الأدوات اللي بتشتغل عليه بس'],
  ['check-browser-available','«فيه متصفّح» معناها Chromium موجود فعلاً'],
  ['check-fill-truth',      'الفورم الناقص مابيتبعتش ومابيترجعش نجاح'],
  ['check-booking-state',   'الحجز ليه حالة منظمة والناقص محسوب'],
  ['check-booking-confirm', 'التأكيد مرحلة ليها بوابة مش نص زرار'],
  ['check-no-retry',        'اللي بيبعت أو بيدفع مابيتعادش'],
  ['check-op-tabs',         'كل مهمة في تبويبها وأوامرها ورا قفل'],
  ['check-browser-status-ui','الواجهة بتقول متصل بالمتصفّح ولا لأ'],
  ['check-page-trust',      'كلام الصفحة بيانات مش أوامر + قايمة مواقع الكتابة'],
  ['check-reminders',       'التذكير له ميعاد وبيوصل فعلاً'],
  ['check-agenda',          'بنود الاجتماع صفوف: مفيش تكرار ولا فجوة'],
  ['check-secrets-ui',      'للخزنة باب: كلمة السر مابتعديش من الشات'],
  ['check-whatsapp',        '«اتبعت» معناها الصفحة أكّدت الإرسال'],
  ['check-social-publish',  'النشر بموافقة على النص وبتأكيد إنه ظهر'],
  ['check-sokro-docs',      'وصف سوكرو مايتعداش الكود'],
  ['check-pay-reach',       'كل لوحة بتبيع فيها مدخل لاستلام الفلوس'],
  ['check-nutrition-subscription','اشتراك البوابة اختياري ومابيقفلش على حد ملفه'],
  ['check-gym-desk',        'شاشة استقبال الجيم: خانة واحدة وتلات أزرار'],
  ['check-gym-perms',       'صلاحيات الجيم: كل دور بيشوف شغله'],
  ['check-shop-perms',      'فريق المتجر: صفحات المالك مالهاش دور موزّع'],
  ['check-gym-booking-spam','حجز الجيم العام: حدّ وفخّ و«أعضاء بس»'],
  ['check-furniture-quotes','عرض السعر له صلاحية وبيتحوّل لفاتورة واحدة'],
  ['check-shop-setup','معالج إعداد المتجر بيتحسب من البيانات مش محفوظ'],
  ['check-cart-recovery','تذكير السلة المتروكة بيتبعت مرة واحدة وبيقول الحقيقة'],
  ['check-purchase-orders','أمر الشراء محسوب من أسطره والاستلام بيتسجّل مرة'],
  ['check-pharmacy-reports','تقارير الصيدلية بتطرح المرتجع من المبيعات'],
  ['check-branch-transfers','التحويل بين الفروع بينزل من رف ويطلع على رف مرة واحدة'],
  ['check-food-options','السعر بيتحسب على السيرفر، والاستلام مابيدفعش توصيل'],
  ['check-food-pos','الطاولة محسوبة من الطلب، والكاشير بيسعّر بنفس القائمة'],
  ['check-food-ingredients','التكلفة غير المعروفة بتقول كده، والمكوّنات بتنزل مرة'],
  ['check-food-delivery','الأجرة بتتبع المنطقة، والسائق بيشوف طلباته هو بس'],
  ['check-clinic-board','لوحة العيادة بتجاوب على أسئلة، والقراءة اللي تفشل بتقول كده'],
  ['check-clinic-queue','الطابور بأزراره الخمسة، والتقويم مابيضيّعش موعد'],
  ['check-clinic-file-tabs','ملف المريض بتبويبات، والجزء اللي ما اتقراش بيقول كده'],
  ['check-clinic-refunds','المرتجع مابيزيدش عن المحصّل، والإيصال والسجل موجودين'],
  ['check-nutrition-diary','دفتر الأكل بيقول اللي مش محسوب، وفحص الحساسية بيحذّر'],
  ['check-gym-waitlist','المكان اللي بيفضى بيروح لأول واحد مستني في نفس اللحظة'],
  ['check-furniture-photos','كتالوج موبيليا بقى يشيل صور والمعرض بيعرضها'],
  ['check-furniture-variants','مقاسات وخامات موبيليا، وخيار المنتج بسعره'],
  ['check-production-orders','أوامر التصنيع: صرف الخامات مرة واحدة و«مش عارفين» مش صفر'],
  ['check-order-track','متابعة الطلب بالتوكن، و«اتسلّم» ليها إثبات أو ليها اسم'],
  ['check-no-nul','مفيش بايت صفر خام يخلّي ملف سورس يتقرا binary'],
  ['check-rad-intake','الأشعة: الملف الزيادة بيتشال باسمه، وسقف تكلفة الـAI بيقفل لما يعمى'],
  ['check-rad-worklist','قايمة شغل الأشعة محسوبة، والقياس مافيهوش مليمتر مخترع'],
  ['check-pixel-ids','رقم البيكسل بيتفحص شكله، وزرار الاختبار بيقول اللي شايفه'],
  ['check-capi-consent','الشراء بيتحسب مرة مش مرتين، والبيكسل بيستنى موافقة الزائر'],
  ['check-portfolio-edit','الست خدمات بتتعدّل، و«قبل/بعد» بتوصل للصفحة'],
  ['check-thin-pages','مفيش قالب معفي من حد الرقّة، والصفحات بتعرض بيانات التاجر'],
  ['check-tailwind-build','الـCSS مبني عندنا مش في متصفح الزائر، وكل كلاس له قاعدة'],
  ['check-nutrition-booking','حجز التغذية بخانات حقيقية، واتنين في نفس الثانية واحد بينجح'],
  ['check-nutrition-templates','القالب العلاجي مايتطبّقش أعمى — اللي بيتعارض مع المريض بيترفض باسمه'],
  ['check-nutrition-messages','رسايل المريض جوّه النظام — و«اتبعت» غير «اتقرت»'],
  ['check-nutrition-micros','العناصر الدقيقة بقيم الأخصائي، والمجموع الناقص بيقول إنه ناقص'],
  ['check-shop-loyalty','نقاط الولاء بمعدّل التاجر، والقفل بيقفل الكتابة مش الشاشة'],
  ['check-merchant-pwa','لوحة التاجر بتتثبّت باسم متجره، وزرار التثبيت مابيوعدش'],
  ['check-shop-themes','مكتبة الثيمات بتكتب في خانات التاجر مش طبقة فوقها'],
  ['check-shop-i18n','المتجر بيتكلّم لغة الزائر — مفيش عربي متصلّب في القوالب'],
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
/* ── الفحص اللي مش في القايمة دي فحص بيسوّس ──────────────────────────────
 *
 * حصلت فعلاً: `check-sokro-six` كان موجود في `scripts/` ومش مسجّل هنا، فقعد
 * **واقع** من غير ما حد ياخد باله — لأنه بيختبر شكل الواتساب القديم بعد ما
 * الشكل اتغيّر. فحص محدش بيشغّله مش حماية، ده ملف بيدّي إحساس بالحماية.
 *
 * فالقايمة بتتقارن بالمجلّد نفسه قبل أي حاجة.
 */
const fs = require('fs');
const EXEMPT = new Set([
  'check-all',                 // ده أنا
  'check-sokro-concurrency',   // بيكتب في قاعدة بيانات حيّة — اختياري بقرار
]);
{
  const listed = new Set(CHECKS.map(([n]) => n));
  const files = fs.readdirSync(__dirname).filter((f) => /\.js$/.test(f))
    .map((f) => f.replace(/\.js$/, ''));
  // اليتيم: ملف `check-*` موجود ومش مسجّل.
  const orphans = files.filter((n) => /^check-/.test(n) && !EXEMPT.has(n) && !listed.has(n));
  // والشبح: اسم مسجّل ومالوش ملف (بأي بادئة — فيه فحوص اسمها `seo-audit`
  // و`render-*` مش `check-*`).
  const ghosts = [...listed].filter((n) => !files.includes(n));
  if (orphans.length || ghosts.length) {
    if (orphans.length) console.log('❌ فحوص موجودة ومش مسجّلة: ' + orphans.join(', '));
    if (ghosts.length) console.log('❌ فحوص مسجّلة ومش موجودة: ' + ghosts.join(', '));
    console.log('\nسجّلها في CHECKS أو شيلها — الفحص اللي محدش بيشغّله بيسوّس.');
    process.exit(1);
  }
}

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
