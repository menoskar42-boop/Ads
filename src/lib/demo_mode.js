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

/**
 * حساب شركة العرض **مايدخلش بكلمة سر** — أبداً.
 *
 * ── المشكلة ────────────────────────────────────────────────────────────
 *
 * الديمو نفسه مفتوح بلا كلمة سر (`/demo/<slug>`) وبيدّي جلسة **قراءة
 * فقط**. لكن شركات الديمو ليها كمان حسابات عادية في `company_users`،
 * وكلمات سرها كانت مكتوبة في `src/db/seed.js` — واتمسحت من الشجرة بس
 * **لسه في تاريخ Git**.
 *
 * يعني أي حد يقرا التاريخ يقدر يدخل من `/company/login` بحساب الديمو،
 * و**الدخول العادي بيلغّي وضع القراءة فقط** (`endDemo`) — فبياخد صلاحية
 * كتابة كاملة على بيانات الديمو المعروضة لكل الناس.
 *
 * ── ليه ده أحسن من تدوير كلمات السر ────────────────────────────────────
 *
 * التدوير بيقفل الباب **مرة**. أي تسريب جديد بيفتحه تاني، والتاريخ
 * مايتمسحش. القفل ده بيخلّي كلمة السر **بلا معنى**: حتى لو حد عرفها،
 * الباب مقفول من ناحية الكود.
 *
 * ── وده مش بيمنع شغل ───────────────────────────────────────────────────
 *
 * محتوى الديمو بيتحدّث بسكربتات `scripts/enable-demo-*.js` مش بالدخول،
 * وإعدادات الشركة من لوحة الأدمن. فمافيش سير شغل بيتكسر.
 */
function isDemoLogin(slug) {
  return isDemoSlug(slug);
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
    // صفحة منسّقة بدل سطر على صفحة بيضا (تقرير الإكستنشن ٢٠٢٦-١٠-٠٦): الزائر هنا
    // عميل محتمل بيجرّب — لازم يفهم إن ده مقصود ويلاقى طريقه (رجوع / ابدأ نسختك).
    res.status(403).send(
      '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<meta name="robots" content="noindex,nofollow"><title>نسخة عرض للاطّلاع فقط</title>' +
      '<style>body{margin:0;background:#f3f6f8;color:#263746;font-family:Cairo,Tahoma,system-ui,sans-serif;line-height:1.8}' +
      '.w{max-width:480px;margin:12vh auto;padding:0 16px}.c{background:#fff;border:1px solid #dbe5eb;border-radius:16px;padding:28px 22px;text-align:center}' +
      'h1{font-size:20px;margin:0 0 8px}p{margin:0 0 18px;color:#5b6f7c}.b{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}' +
      '.b a{padding:9px 18px;border-radius:10px;text-decoration:none;font-weight:600}.p{background:#2563eb;color:#fff}.s{border:1px solid #c9d6de;color:#263746}' +
      '@media (prefers-color-scheme:dark){body{background:#121a20;color:#e3eaef}.c{background:#1b252d;border-color:#2c3a44}p{color:#9fb1bd}.s{color:#e3eaef;border-color:#3a4b57}}</style></head>' +
      '<body><div class="w"><div class="c"><h1>' + msg + '</h1>' +
      '<p>ده نظام حقيقي بتتفرّج عليه — الحفظ بيشتغل في نسختك إنت بعد التسجيل.</p>' +
      '<div class="b"><a class="s" href="javascript:history.back()">رجوع</a>' +
      '<a class="p" href="/ar/apply">ابدأ نسختك</a></div></div></div></body></html>'
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

// ── أبواب عامة مش كتابة فى بيانات الديمو (٢٠٢٦-١٠-٠٦) ───────────────────────
//
// الحارس كان بيقفل **أى** POST طول ما الجلسة تجريبية — ومن ضمنهم:
//   · **الدخول نفسه**: endDemo() متنادية جوّه كل باب دخول، بس الحارس كان بيرد قبلها
//     بـ«نسخة عرض للاطّلاع فقط»، فاللى فتح الديمو مكنش يقدر يسجّل دخول حسابه الحقيقى
//     أصلاً (اتكشف والمالك بيحاول يدخل ورشة تجربة بعد ما الإكستنشن فتح الديمو).
//   · **التقديم** (`/apply`): أهم خطوة بعد الديمو — الزائر اللى اقتنع ويقدّم كان بيترفض.
//   · **التواصل** (`/contact`).
// ودول مالهمش علاقة بشركة الديمو: الدخول بيبدّل الجلسة، والتقديم والتواصل بيكتبوا
// طلب جديد مش بيانات شركة. أى كتابة تانية (لوحات الإدارة كلها) فاضلة ممنوعة.
// الطلب بيوصل هنا **قبل** lang_prefix، فـ`/ar/apply` بيوصل بالبادئة.
const PUBLIC_DOORS = /^(?:\/(?:ar|en))?\/(?:apply(?:\/status)?|contact)\/?$/;
const LOGIN_DOOR = /\/login\/?$/;

function isPublicDoor(path) {
  const p = String(path || '');
  return PUBLIC_DOORS.test(p) || LOGIN_DOOR.test(p);
}

// ── الحارس بيقفل **لوحات الشركات بس** (٢٠٢٦-١٠-٠٦) ───────────────────────────
//
// كان بيقفل **أى** كتابة على oscardevs.com طول ما المتصفح شايل جلسة ديمو. والجلسة
// بتفضل فى المتصفح أسبوع — فاللى فتح «شوف نموذج حي» مرة واحدة كان بيتمنع بعدها من:
// موافقة الأدمن على طلب تسجيل (اتكشف بـ«موافقة وإنشاء» على طلب ٣)، سلة ودفع /shop،
// حساب العميل /customer، موافقة العميل على عرض الورشة /workshop/status، الأقساط
// العامة /qastly/s، تتبّع الطلبات، المدوّنة والتواصل…
//
// وده مالوش أى لازمة: الصفحات العامة دى **أى حد** بيكتب فيها من غير ديمو أصلاً، والهويات
// التانية (الأدمن، العميل، الدكتور) جلسة الديمو مابتدّيش صلاحيتها. الجلسة التجريبية
// بتدّى صلاحية حاجة واحدة: **لوحة إدارة شركة الديمو** (session.companyId). فالقفل هناك بس.
//
// ⚠️ لوحة جديدة = لازم تتضاف لـBACK_OFFICE، وscripts/check-demo-readonly.js بيوقّع لو
// فيه mount فى server.js مش متصنّف (BACK_OFFICE أو NOT_BACK_OFFICE) — مفيش نسيان صامت.
const BACK_OFFICE = [
  '/company', '/accounting', '/pharmacy', '/food', '/clinic', '/gym', '/furniture',
  '/workshop', '/einvoice', '/hall', '/nursery', '/qastly', '/nutrition',
];
// مسارات عامة جوّه بادئة لوحة: صفحة العميل بالتوكن (موافقة عرض الورشة) والأقساط العامة.
const PUBLIC_INSIDE_BACK_OFFICE = [/^\/workshop\/status(?:\/|$)/, /^\/qastly\/s(?:\/|$)/];
// كل الـmounts التانية فى server.js — متصنّفة صراحةً (الفحص بيقارن بيها).
const NOT_BACK_OFFICE = [
  '/admin', '/shop', '/customer', '/radiology', '/research', '/portal', '/track',
  '/workshop/status', '/qastly/s', '/',
  // «مراقب السرعة»: حسابات أساطيل منفصلة بكلمة سرها — مش لوحة شركة، ومالهاش جلسة عرض
  '/fleet',
];

function isBackOfficePath(path) {
  const p = String(path || '').replace(/^\/(?:ar|en)(?=\/|$)/, '') || '/';
  if (PUBLIC_INSIDE_BACK_OFFICE.some((r) => r.test(p))) return false;
  return BACK_OFFICE.some((b) => p === b || p.startsWith(b + '/'));
}

function guard() {
  return function demoGuard(req, res, next) {
    if (ALWAYS_ALLOWED.includes(req.path) || isPublicDoor(req.path)) return next();
    if (!isBackOfficePath(req.path)) return next();
    if (blockWrite(req, res)) return;
    next();
  };
}

module.exports = {
  isDemoLogin,
  DEMO_SLUGS, isDemoSlug, isDemoSession, isWriteRequest, blockWrite,
  endDemo, guard, ALWAYS_ALLOWED, isPublicDoor, isBackOfficePath, BACK_OFFICE, NOT_BACK_OFFICE,
};
