#!/usr/bin/env node
/**
 * البنود المتوسطة والصغيرة من المراجعة الخارجية (١٠٣ + ١٠٤).
 *
 * كلها من نوع واحد: **حاجة اتعملت صح في مكان واحد، وناقصة في مكان تاني.**
 *
 * ١) **الأسماء المحجوزة كانت قايمتين.** واحدة في `apply.js` (٢١ اسم) وواحدة
 *    في `admin.js` (١٠). والقايمتين ناقصتين في الاتجاهين: الأدمن مكنش عنده
 *    `legal` (فيقدر يعمل شركة بالاسم ده و`legal.oscardevs.com` تبقى موقع
 *    تاجر بدل صفحة الشروط)، والتقديم مكنش عنده `contact`. كل واحدة بتحمي من
 *    اللي التانية بتسيبه.
 *
 * ٢) **باب دخول كاكيبو كان مفتوح بلا حد** — الجزء الوحيد في المنصّة كده.
 *
 * ٣) **تعديل السلة كان بيكتب الرقم من الفورم على طول.** `9999` من قطعة
 *    الموجود منها اتنين بتتخزّن، والصفحة تحسب إجمالي لطلب مستحيل. الطلب نفسه
 *    كان بيفحص المخزون — بس «الرقم بيتصلّح بعدين» مش زي «الصفحة بتقول
 *    الحقيقة دلوقتي».
 *
 * ٤) **`replace` من غير `/g`** بتبدّل أول وجود بس، فأصل متكرّر بيفضل بلا رقم
 *    نسخة ويتجاب من الكاش القديم بعد النشر.
 *
 * ٥) **الخروج من وضع العرض** كان مسموح لـ`/company` بس، فالجلسة التجريبية في
 *    `/admin` أو `/customer` مكنش ينفع تخرج منها.
 *
 * ٦) **تمديد الجلسة اللي بيفشل** كان بيتبلع تماماً — قاعدة واقعة بتفضل ساكتة.
 *
 *   node scripts/check-audit-followups.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { isReserved, RESERVED_SLUGS } = require('../src/lib/reserved_slugs');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── ١. قايمة واحدة للأسماء المحجوزة ──────────────────────────────────── */
{
  check('القايمة في ملف مشترك', RESERVED_SLUGS instanceof Set && RESERVED_SLUGS.size >= 30,
    RESERVED_SLUGS.size + ' اسم');
  // الأسماء اللي كانت ناقصة من ناحية أو التانية — لازم كلها محجوزة دلوقتي.
  const wasMissing = ['legal', 'login', 'logout', 'dashboard', 'settings', 'www',
    'mail', 'root', 'assets', 'css', 'js', 'apply', 'contact'];
  const still = wasMissing.filter((x) => !isReserved(x));
  check('وكل اللي كان ناقص من ناحية أو التانية بقى محجوز', still.length === 0, still.join(', ') || 'تمام');
  check('والمقارنة مابتفرّقش بين كبير وصغير ومسافات',
    isReserved(' Admin ') && isReserved('LEGAL'));
  check('والاسم العادي لسه بيعدّي', !isReserved('hand') && !isReserved('delta'));

  for (const rel of ['src/routes/admin.js', 'src/routes/apply.js']) {
    const s = code(rel);
    check(`و${rel.split('/').pop()} بيستعمل المشترك`, /require\('\.\.\/lib\/reserved_slugs'\)/.test(s));
    check(`ومفيش قايمة تانية جوّاه`, !/RESERVED_SLUGS = /.test(s));
  }
}

/* ── ٢. باب كاكيبو ─────────────────────────────────────────────────────── */
{
  const k = code('src/kakeibo/router.js');
  check('الدخول في كاكيبو وراه حدّ', /router\.post\('\/login', loginLimiter,/.test(k));
  check('والتسجيل كمان', /router\.post\('\/signup', signupLimiter,/.test(k));
  check('والحدّ من نفس الوحدة المشتركة', /require\('\.\.\/middleware\/rateLimit'\)/.test(k));
}

/* ── ٣. تعديل السلة ────────────────────────────────────────────────────── */
{
  const s = code('src/routes/shop.js');
  check('التعديل بيتقصّ على الموجود فعلاً', /const use = Math\.min\(qty, avail\)/.test(s));
  check('وفيه سقف عاقل قبل أي استعلام', /Math\.min\(qty, 999\)/.test(s));
  check('و«مش قادرين نتأكّد» مش «صفر»',
    /if \(avail === null\) continue;/.test(s));
  check('والعميل بيتقاله لما الرقم يتقصّ', /trimmed \? '\?errorCode=stock'/.test(s));
  check('وقراية فشلت مابتوقفش السلة',
    /catch \(e\) \{[\s\S]{0,160}cart\[key\] = qty;/.test(s));
  check('ومفيش كتابة مباشرة للرقم من الفورم',
    !/else cart\[key\] = qty;/.test(s));
}

/* ── ٤. رقم النسخة على كل الأصول ──────────────────────────────────────── */
{
  const s = code('server.js');
  check('استبدال الأصول بـ`/g`', /new RegExp\([\s\S]{0,120}'g'\)/.test(s) && /const stamp = \(name\) =>/.test(s));
  check('ومفيش استبدال بنص عادي فاضل',
    !/\.replace\('\/(styles\.css|native\.js|app\.js)'/.test(s));
}

/* ── ٥. الخروج من وضع العرض ───────────────────────────────────────────── */
{
  const d = require('../src/lib/demo_mode');
  const s = code('src/lib/demo_mode.js');
  for (const p of ['/company/logout', '/admin/logout', '/customer/logout', '/logout']) {
    check('الخروج مسموح من ' + p, new RegExp("'" + p + "'").test(s));
  }
  check('والوحدة لسه بتصدّر الحارس', typeof d.guard === 'function');
}

/* ── ٦. تمديد الجلسة ──────────────────────────────────────────────────── */
{
  const s = code('src/lib/pg_session_store.js');
  check('فشل التمديد بيتكتب في اللوج', /console\.error\('\[session touch\]'/.test(s));
  check('وبيفضل مايوقعش الطلب', /if \(cb\) cb\(null\)/.test(s));
}

/* ── ٧. الفخ المؤجَّل في `pageError` ───────────────────────────────────── */
{
  const s = code('src/routes/company.js');
  check('`pageError` مابترميش على مفتاح مجهول',
    /\(PAGE_ERRORS\[page\] \|\| \{\}\)/.test(s));
}

console.log(fail === 0
  ? '\n✅ اللي اتعمل صح في مكان بقى معمول صح في كل مكان.'
  : `\n⚠️  ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
