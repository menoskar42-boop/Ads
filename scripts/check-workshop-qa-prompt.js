#!/usr/bin/env node
/**
 * برومبت اختبار الورش (docs/WORKSHOP_QA_PROMPT.md) مربوط بالكود.
 *
 * كل رقم متوقَّع فيه محسوب من J.jobTotals، وكل مسار ولافتة لازم يكونوا موجودين فعلاً —
 * عشان البرومبت مايقدمش لوحده: لو اتغيّرت حسبة الفاتورة أو اسم زرار أو مواعيد الديمو،
 * الفحص ده بيقع بدل ما الإكستنشن يرجّع ❌ على حاجة سليمة (أو ✅ على حاجة مكسورة).
 *
 *   node scripts/check-workshop-qa-prompt.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let fail = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) fail++; };

const doc = read('docs/WORKSHOP_QA_PROMPT.md');
const block = (doc.match(/````\n([\s\S]*?)\n````/) || [])[1] || '';
ok(block.length > 2000, 'البرومبت موجود جوّه بلوك ```` واحد');
const has = (s) => block.includes(s);

// ── الديمو والتقديم ─────────────────────────────────────────────────────────────
const demo = require('../src/lib/demo_mode');
ok(demo.isDemoSlug('workshop') && demo.isDemoLogin('workshop') && has('/demo/workshop'),
  'الديمو `workshop` قراءة فقط ومابيدخلش بكلمة سر');
ok(require('../src/lib/business_types').KEYS.includes('workshop') && doc.includes('apply?type=workshop'),
  'التقديم `?type=workshop` نوع موجود');
ok(/withLang\('\/car-workshop-management-egypt', 'ar'\)/.test(read('server.js'))
  && has('/workshop') && has('/ar/car-workshop-management-egypt'), '`/workshop` للزائر بيحوّل لصفحة البيع');
ok(has('`https://oscardevs.com/company/login`'), 'رابط الدخول');

// ── الفلوس — من jobTotals نفسه ─────────────────────────────────────────────────
const J = require('../src/workshop/jobs');
const t1 = J.jobTotals({ discount: 50, tax_percent: 14 }, [{ qty: 2, unit_price: 150 }], [{ amount: 200 }]);
const t1p = J.jobTotals({ discount: 50, tax_percent: 14, paid: 100 }, [{ qty: 2, unit_price: 150 }], [{ amount: 200 }]);
const t2 = J.jobTotals({ discount: 0, tax_percent: 14 }, [{ qty: 1, unit_price: 100 }], [{ amount: 50 }]);
ok(t1.subtotal === 500 && t1.tax === 63 && t1.total === 513 && has('المجموع **500**') && has('الضريبة **63**') && has('**الإجمالي 513**'),
  `أمر ١: ${t1.subtotal} / ${t1.tax} / ${t1.total}`);
ok(t1p.due === 413 && has('المتبقّي **413**'), `أمر ١ بعد دفعة 100: المتبقّي ${t1p.due}`);
const noTax = J.jobTotals({ discount: 50, tax_percent: 0 }, [{ qty: 2, unit_price: 150 }], [{ amount: 200 }]).total;
ok(noTax === 450 && has('ظهر **450**'), `الرقم القديم من غير ضريبة (${noTax}) متسمّى عشان يتكشف`);
ok(t2.total === 171 && has('**171** (150 + ضريبة 21)'), `أمر ٢: ${t2.total}`);
ok(J.deliveryCheck(t1p).ok === false && /allow_credit === '1'/.test(read('src/routes/workshop_admin.js')),
  'التسليم بمتبقّي مرفوض إلا بالآجل صراحةً');
ok(/if \(!qualityReady\(data\.quality\)\)/.test(read('src/routes/workshop_admin.js')) && has('التسليم قبل فحص الجودة'),
  'التسليم قبل فحص الجودة بيرجّع لقسم الجودة');

// ── المواعيد ────────────────────────────────────────────────────────────────────
const demoSeed = read('scripts/enable-demo-workshop.js');
const demoHours = (demoSeed.match(/hours: '([^']+)'/) || [])[1];
const { workshopHours } = require('../src/routes/tenant.js');
const h = workshopHours(demoHours);
const lastSlot = Math.floor((h.end - 1) / 60);   // المواعيد كل ساعة من البداية وطول ما < النهاية
ok(demoHours === 'السبت–الخميس ٩ص–٨م' && h.start === 540 && lastSlot === 19 && has('«٩ص–٨م»')
  && has('أول ميعاد في اليوم ٩:٠٠ ص، وآخر ميعاد ٧:٠٠ م'), `مواعيد الديمو «${demoHours}» ← ٩ ص لـ ٧ م`);
ok(!/INSERT INTO workshop_appointments/.test(demoSeed) && doc.includes('الديمو مافيهوش مواعيد متسجّلة'),
  'الديمو مابيزرعش مواعيد (عشان كده اختبار الساعة فى ورشة التجربة)');
const tenant = read('src/routes/tenant.js');
ok(/limits: \{ files: 3, fileSize: 5 \* 1024 \* 1024 \}/.test(tenant) && /image\\\/\(png\|jpeg\|jpg\|gif\|webp\)/.test(tenant)
  && has('الحد 3 صور، صور بس، 5 ميجا للصورة'), 'حدود رفع صور الحجز = الكود');

// ── اللافتات اللي البرومبت بيقول عليها ──────────────────────────────────────────
const i18n = fs.readdirSync(path.join(ROOT, 'src/i18n')).map((f) => read('src/i18n/' + f)).join('\n');
for (const label of ['نسبة الضريبة %', 'مواعيد العمل', 'استقبال حجوزات من الموقع', 'متبقّي على العملاء', 'تسجيل دفعة',
  'اتستلمت', 'اتعمل عرض سعر', 'العميل وافق', 'في انتظار قطع', 'تحت الشغل', 'فحص الجودة', 'خلصت', 'جاهزة للاستلام', 'اتسلّمت']) {
  ok(i18n.includes(`'${label}'`) && has(label), `«${label}» موجودة فى الواجهة وفى البرومبت`);
}
ok(read('src/views/workshop_admin/dashboard.ejs').includes('مواعيد اليوم') && has('«مواعيد اليوم»'), '«مواعيد اليوم»');
ok(read('src/views/workshop_admin/job.ejs').includes('فتح رابط العميل ↗') && has('«فتح رابط العميل ↗»'), '«فتح رابط العميل ↗»');
ok(read('src/views/workshop_admin/appointments.ejs').includes("cancelled:'ملغي'") && has('«ملغي»'), 'حالة الميعاد «ملغي»');
const flagLabels = [...read('src/workshop/flags.js').matchAll(/label: '([^']+)'/g)].map((m) => m[1])
  .filter((l) => !['صور قبل وبعد', 'الفحص الرقمي', 'رابط العميل', 'سجل النشاط'].includes(l));
const missing = flagLabels.filter((l) => !has(l));
ok(missing.length === 0, 'كل صفحات القايمة الجانبية فى أ٢' + (missing.length ? ': ناقص ' + missing.join('، ') : ''));

// ── الخطوط الحمرا ───────────────────────────────────────────────────────────────
for (const line of ['ماتبعتش طلب حجز من صفحة حجز الديمو', 'ماتكتبش أي وصف ولا «نبذة»', 'مفيش دفع إلكتروني',
  'مفيش رسايل', 'ماتستخدمش أي كلمة سر متحفوظة', 'ماتكتبش كلمة السر في التقرير']) {
  ok(has(line), `خط أحمر: ${line}`);
}

if (fail) { console.log(`\n❌ ${fail} فحص فشل`); process.exit(1); }
console.log('\n✅ برومبت اختبار الورش مطابق للكود');
