// وضع العرض: الزائر يدخل لوحة التحكم التجريبية من غير كلمة سر، بس **للقراءة فقط**.
//
// المشكلة اللي بيحلّها: لينك «شاهد نموذج حي» كان بيفتح الصفحة العامة للعميل
// (حجز/تواصل)، مش النظام الإداري نفسه. اللي عايز يشوف الشغل الحقيقي كان لازم
// كلمة سر — يعني عمره ما يشوفه.
//
// الأمان هنا مش تفصيلة: إحنا بنفتح لوحة تحكم لأي حد على الإنترنت. فلازم:
//   ١) قايمة بيضا مقفولة — مستحيل حد يوصل لشركة عميل حقيقي بالطريقة دي.
//   ٢) قراءة فقط على مستوى السيرفر — أي طلب بيغيّر بيانات بيتمنع، مش بس
//      إخفاء الأزرار من الواجهة (اللي أي حد بيعديه بـcurl).
'use strict';

/**
 * الشركات التجريبية الوحيدة اللي وضع العرض شغّال عليها.
 * لازم تطابق السلَجات المعلَنة في الصفحة الرئيسية — وscripts/check-demo-links.js
 * بيتأكد من ده.
 *
 * ⛔ ماتضيفش هنا سلَج شركة عميل حقيقي أبداً. ده بيدّي دخول لبياناتها لأي زائر.
 */
const DEMO_SLUGS = new Set([
  'petra', 'delta', 'pharmacy', 'orders', 'gym', 'clinic',
  'nutrition', 'furniture', 'workshop', 'hall', 'nursery', 'installments',
]);

function isDemoSlug(slug) {
  return DEMO_SLUGS.has(String(slug || '').toLowerCase());
}

/** جلسة الزائر دي في وضع عرض؟ */
function isDemoSession(req) {
  return !!(req.session && req.session.demoReadOnly);
}

/**
 * الطلب ده بيغيّر بيانات؟ GET و HEAD و OPTIONS بس هي الآمنة.
 * أي حاجة تانية ممنوعة في وضع العرض.
 */
function isWriteRequest(req) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
}

/**
 * يمنع أي كتابة في وضع العرض. بيرجّع true لو الطلب اتمنع (والرد اتبعت).
 *
 * بنمنع على السيرفر مش بإخفاء الأزرار: الواجهة ممكن تتعدّى بـcurl أو
 * devtools في ثانية، والبيانات دي بيشوفها عملاء تانيين.
 */
function blockWrite(req, res) {
  if (!isDemoSession(req) || !isWriteRequest(req)) return false;
  const msg = 'دي نسخة عرض للاطّلاع فقط — التعديل والحذف متوقّفين فيها.';
  if (req.xhr || (req.get('accept') || '').includes('application/json')) {
    res.status(403).json({ ok: false, demo: true, error: msg });
  } else {
    res.status(403).send(
      '<!doctype html><meta charset="utf-8">' +
      '<div style="font-family:Cairo,system-ui,sans-serif;direction:rtl;text-align:center;padding:48px">' +
      '<h1 style="font-size:20px">' + msg + '</h1>' +
      '<p><a href="javascript:history.back()">رجوع</a></p></div>'
    );
  }
  return true;
}

/**
 * The visitor signed in for real — the demo is over.
 *
 * A merchant who once clicked "see a live demo" carried `demoReadOnly` into
 * their own account and found every save refused, with no way to clear it but
 * dropping the cookie. The flag has to end the moment a real credential is
 * accepted, at every door: owner, pharmacy staff, clinic staff, restaurant
 * staff, dietitian's staff.
 *
 * Note this does NOT regenerate the session id. That is a separate hardening
 * (session fixation) and a bigger change than this one; the flags are what
 * locked real merchants out.
 */
function endDemo(req) {
  if (!req || !req.session) return;
  delete req.session.demoReadOnly;
  delete req.session.demoSlug;
}

/**
 * Express middleware: no write, anywhere, in a demo session.
 *
 * Mounted once on the app rather than inside each area's own `requireLogin`.
 * Seven admin routers had written their own login check — none of them called
 * blockWrite — so a visitor could open a demo and then POST edits and deletes
 * into the very tenants that are shown to prospects. Seven routers each
 * remembering a rule is seven chances to forget it; the eighth, written next
 * year, forgets by default.
 *
 * Logging out is the one write a demo session must keep: without it the visitor
 * is stuck in read-only until the cookie expires.
 */
// الخروج **مش كتابة**.
//
// كانت القايمة فيها `/company/logout` بس، فالجلسة التجريبية اللي فتحت
// `/admin` أو `/customer` أو كاكيبو مكنش ينفع تخرج منها أصلاً — الحارس
// بيوقف كل POST، والخروج POST. شاشة مالكش منها باب أسوأ من شاشة مقفولة.
const ALWAYS_ALLOWED = [
  '/company/logout',
  '/admin/logout',
  '/customer/logout',
  '/logout',            // كاكيبو (بيتقدّم على نطاقه الفرعي)
];

function guard() {
  return function demoGuard(req, res, next) {
    if (ALWAYS_ALLOWED.includes(req.path)) return next();
    if (blockWrite(req, res)) return;
    next();
  };
}

module.exports = {
  DEMO_SLUGS, isDemoSlug, isDemoSession, isWriteRequest, blockWrite,
  endDemo, guard, ALWAYS_ALLOWED,
};
