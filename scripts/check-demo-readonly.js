#!/usr/bin/env node
/**
 * A visitor could edit and delete the demo tenants we sell with.
 *
 * `/demo/<slug>` opens a real admin dashboard to anybody on the internet, with
 * `demoReadOnly` on the session. The read-only rule was enforced in exactly one
 * place — `src/middleware/auth.js` — and seven admin routers had each written
 * their own login check that stopped at "is there a companyId?":
 *
 *   furniture · workshop · einvoice · hall · nursery · installments · nutrition
 *
 * So `/demo/furniture` followed by a POST wrote into the very tenant a prospect
 * is looking at. (And `/einvoice` would let a stranger file invoices with the
 * tax authority in the company's name.)
 *
 * Seven routers each remembering a rule is seven chances to forget it, and the
 * eighth — written next year — forgets by default. So the guard is mounted ONCE
 * on the app, above every admin area including the ones that do not exist yet.
 * That is what this asserts: not "those seven are fixed" but "no router has to
 * be fixed".
 *
 * The other half: the flag has to END at a real login. A merchant who once
 * clicked "see a live demo" carried read-only into their own account and found
 * every save refused.
 *
 *   node scripts/check-demo-readonly.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const D = require('../src/lib/demo_mode');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The rule, run ─────────────────────────────────────────────────────── */
const run = (req) => {
  let nexted = false, status = null, body = '';
  const res = {
    status(c) { status = c; return this; },
    json(o) { body = JSON.stringify(o); return this; },
    send(h) { body = h; return this; },
  };
  D.guard()(req, res, () => { nexted = true; });
  return { nexted, status, body };
};
const demo = (method, url) => ({
  method, path: url, url, session: { demoReadOnly: true, companyId: 3 },
  xhr: false, get: () => '',
});
const real = (method, url) => ({
  method, path: url, url, session: { companyId: 3 }, xhr: false, get: () => '',
});

check('زائر العرض بيقرا عادي', run(demo('GET', '/furniture/sales')).nexted);
for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  check(`و${m} بيترفض`, run(demo(m, '/furniture/sales')).status === 403);
}
// The seven that had their own login check — each by its real mount path.
for (const p of ['/furniture/x', '/workshop/x', '/einvoice/x', '/hall/x',
  '/nursery/x', '/qastly/x', '/nutrition/x']) {
  check(`و${p} مقفول برضه`, run(demo('POST', p)).status === 403);
}
// An unknown path is NOT the demo's back-office: it used to be refused too, and
// that "deny everything" rule is what locked admins, shoppers and customers out of
// every public form for a week after one demo click (2026-10-06). A NEW back-office
// is covered instead by the mount classification below — an unclassified router
// in server.js fails this check, so it cannot slip in unguarded.
check('مسار عام جديد مش لوحة شركة فمابيتقفلش', run(demo('POST', '/something-new-2027')).nexted);
// A real session is untouched, or the guard would break the whole product.
check('والمستخدم الحقيقي مابيتلمسش', run(real('POST', '/furniture/sales')).nexted);
// Without this the visitor is stuck read-only until the cookie expires.
check('والخروج مسموح عشان الزائر مايتحبسش',
  run(demo('POST', '/company/logout')).nexted);

/* ── The flag ends at a real login ─────────────────────────────────────── */
{
  const req = { session: { demoReadOnly: true, demoSlug: 'furniture', companyId: 9 } };
  D.endDemo(req);
  check('الدخول الحقيقي بينهي وضع العرض',
    !req.session.demoReadOnly && !req.session.demoSlug && req.session.companyId === 9);
  D.endDemo({});           // no session
  D.endDemo(null);         // no request
  check('وendDemo مابتقعش على جلسة ناقصة', true);
}

/* ── Public doors stay open in a demo session (٢٠٢٦-١٠-٠٦) ──────────────────
 * The guard used to refuse every POST — the login form included, so the
 * endDemo() inside each door never ran and a visitor who had opened a demo
 * could not sign in to their real account. /apply (the conversion the demo
 * exists for) and /contact were refused the same way. The function test above
 * passed the whole time: it called endDemo() directly, never through the guard.
 * So this goes through the guard itself. */
{
  const g = D.guard();
  const run = (method, p) => {
    let passed = false;
    const req = { method, path: p, session: { demoReadOnly: true, demoSlug: 'workshop', companyId: 9 }, xhr: false, get: () => '' };
    const res = { status() { return this; }, send() {}, json() {} };
    g(req, res, () => { passed = true; });
    return passed;
  };
  const open = ['/company/login', '/admin/login', '/customer/login', '/apply', '/ar/apply', '/en/apply/status', '/contact', '/ar/contact'];
  const shut = ['/workshop/jobs', '/workshop/customers/1', '/company/settings', '/company/login-as', '/pharmacy/sales', '/ar/company/settings', '/qastly/plans', '/nutrition/patients/1'];
  const wrongOpen = open.filter((p) => !run('POST', p));
  const wrongShut = shut.filter((p) => run('POST', p));
  check('الدخول والتقديم والتواصل بيعدّوا من جلسة الديمو', wrongOpen.length === 0, wrongOpen.join(' ') || 'كلهم');
  check('وأى كتابة تانية لسه ممنوعة', wrongShut.length === 0, wrongShut.join(' ') || 'كلهم ممنوعين');

  // أدمن المنصة مسجّل والمتصفح فتح ديمو (٢٠٢٦-١٠-٠٦): «موافقة وإنشاء» اتقفلت بـ«نسخة عرض».
  const runAs = (session, method, p) => {
    let passed = false;
    const req = { method, path: p, session, xhr: false, get: () => '' };
    g(req, { status() { return this; }, send() {}, json() {} }, () => { passed = true; });
    return passed;
  };
  const adminDemo = { demoReadOnly: true, demoSlug: 'workshop', companyId: 9, adminId: 1 };
  check('أدمن المنصة بيوافق على الطلبات حتى لو المتصفح فاتح ديمو',
    runAs(adminDemo, 'POST', '/admin/applications/3/approve') && runAs(adminDemo, 'POST', '/admin/companies/5/edit'));
  check('بس لوحات الشركات فاضلة قراءة فقط فى جلسة الديمو حتى مع الأدمن',
    !runAs(adminDemo, 'POST', '/workshop/jobs') && !runAs(adminDemo, 'POST', '/company/settings'));
  // الصفحات العامة وحسابات الهويات التانية: أى حد بيكتب فيها من غير ديمو، فالديمو مايقفلهاش.
  const demoOnly = { demoReadOnly: true, demoSlug: 'workshop', companyId: 9 };
  const publicWrites = ['/shop/delta/cart/add', '/shop/delta/checkout', '/customer/addresses/add',
    '/workshop/status/tok123/approve', '/qastly/s/abc/pay', '/contact/delta', '/track/abc', '/radiology/upload'];
  const blockedPublic = publicWrites.filter((p) => !runAs(demoOnly, 'POST', p));
  check('الصفحات العامة (سلة/دفع/حساب عميل/موافقة عرض/أقساط/تواصل) شغّالة لزائر فتح الديمو قبل كده',
    blockedPublic.length === 0, blockedPublic.join(' ') || 'كلهم شغّالين');
}

/* ── كل mount فى server.js متصنّف: لوحة شركة (بتتقفل) أو لأ ───────────────── */
{
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const iGuard = srv.indexOf('app.use(demoMode.guard());');
  const after = [...srv.matchAll(/^app\.use\('(\/[a-z/-]*)'/gm)].filter((m) => m.index > iGuard).map((m) => m[1]);
  const known = new Set([...D.BACK_OFFICE, ...D.NOT_BACK_OFFICE]);
  const unclassified = [...new Set(after)].filter((p) => !known.has(p));
  check('كل لوحة/راوتر فى server.js متصنّف فى demo_mode (BACK_OFFICE أو NOT_BACK_OFFICE)',
    unclassified.length === 0, unclassified.join(' ') || 'كلهم');
  const missingBO = D.BACK_OFFICE.filter((b) => !after.includes(b));
  check('وكل بادئة فى BACK_OFFICE ليها راوتر فعلاً', missingBO.length === 0, missingBO.join(' ') || 'كلهم');
}

/* ── Mounted once, above everything ────────────────────────────────────── */
{
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  check('الحارس مركّب على التطبيق كله', /app\.use\(demoMode\.guard\(\)\);/.test(srv));
  // Order matters twice: after the session (or there is no flag to read) and
  // before the routers (or they answer first).
  const iSess = srv.indexOf('app.use(session({');
  const iGuard = srv.indexOf('app.use(demoMode.guard());');
  const iCompany = srv.indexOf("app.use('/company', companyRouter);");
  check('بعد الجلسة وقبل الراوترات', iSess < iGuard && iGuard < iCompany,
    `${iSess} < ${iGuard} < ${iCompany}`);

  // Every admin mount must come after the guard — a router mounted above it
  // would be outside the rule.
  const mounts = [...srv.matchAll(/^app\.use\('(\/[a-z-]+)', /gm)]
    .filter((m) => m.index < iGuard)
    .map((m) => m[1])
    // These are public/static and carry no admin writes.
    .filter((p) => !['/uploads', '/public', '/static', '/webhooks'].includes(p));
  check('ومفيش لوحة إدارة مركّبة فوقه', mounts.length === 0, mounts.join(' ') || 'ولا واحدة');
}

/* ── Every door clears the flag ────────────────────────────────────────── */
{
  // Counted, not listed: each new staff system adds a door (the gym's was the
  // sixth), and a check that names a number goes red for the wrong reason while
  // the real rule — every door that OPENS a session also ends the demo — stays
  // exactly as strict.
  const company = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  const sets = (company.match(/req\.session\.companyId = (?:st|user)\.company_id;/g) || []).length;
  const ends = (company.match(/demoMode\.endDemo\(req\);/g) || []).length;
  check('كل باب دخول بينهي وضع العرض', sets === ends && ends >= 5, `${ends}/${sets}`);
}

/* The platform admin login is another real credential door. */
{
  const admin = fs.readFileSync(path.join(ROOT, 'src/routes/admin.js'), 'utf8');
  check('ودخول أدمن المنصة بينهي وضع العرض',
    (admin.match(/demoMode\.endDemo\(req\);/g) || []).length >= 2);
}

/* ── The login form shows even inside a demo session (2026-10-06) ───────── */
{
  // The demo session carries the demo company's id. GET /company/login used to
  // send any session with a companyId to the dashboard — so whoever had opened
  // a demo landed in the demo («ورشة الأمانة») every time they tried to log in.
  const company = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
  check('صفحة الدخول بتظهر حتى لو المتصفح فاتح ديمو (مابتحوّلش على لوحة الديمو)',
    /router\.get\('\/login', \(req, res\) => \{[\s\S]{0,800}?if \(req\.session\.companyId && !demoMode\.isDemoSession\(req\)\) return res\.redirect\('\/company\/dashboard'\);/.test(company));
}

/* ── The seven no longer need their own copy ───────────────────────────── */
{
  // Stated as a fact about the routers: none of them enforces this itself, and
  // none of them needs to. If one starts to, the rule has two homes again.
  const seven = ['furniture_admin', 'workshop_admin', 'einvoice_admin', 'hall_admin',
    'nursery_admin', 'installments_admin', 'nutrition_admin'];
  const local = seven.filter((f) => /blockWrite/.test(
    fs.readFileSync(path.join(ROOT, 'src/routes/' + f + '.js'), 'utf8')));
  check('والسبعة مابيكرّروش القاعدة عندهم', local.length === 0, local.join(' ') || 'ولا واحد');
}

console.log(fail
  ? `\n${fail} مشكلة — يعني زائر لسه يقدر يعدّل في النماذج اللي بنبيع بيها.`
  : '\nوضع العرض: قراءة فقط في التطبيق كله، وبينتهي بأول دخول حقيقي.');
process.exit(fail ? 1 : 0);
