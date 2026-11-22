#!/usr/bin/env node
/**
 * The CSRF hole that `SameSite=Lax` leaves open on this platform.
 *
 * The session cookie is lax already, so a POST from `attacker.com` arrives with
 * no cookie — that half was never broken. The half that was: **every tenant is
 * a subdomain of the same site**. A merchant we host can put a form on their
 * own page that POSTs into `/company/…` or `/admin/…`, and as far as the
 * cookie is concerned `evil.oscardevs.com` and `oscardevs.com` are the same
 * site, so the victim's session rides along.
 *
 * A token in every form would fix it and would mean editing several hundred
 * templates — where the one form somebody forgets is the one that stays
 * exploitable. One mount comparing `Origin` covers every route, including the
 * ones not written yet.
 *
 * This check RUNS the middleware. The decision it makes is invisible in normal
 * use (a correct request looks like no middleware at all), so grepping for the
 * mount would prove nothing about what it actually allows.
 *
 *   node scripts/check-csrf.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const csrf = require('../src/middleware/csrf');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* A request through the real middleware. Returns 'pass' or the status it
   refused with, so the assertions read as outcomes rather than mock calls. */
function run(method, urlPath, headers) {
  const req = {
    method,
    path: urlPath,
    headers: Object.assign({}, headers),
    hostname: (headers && headers.host) || 'oscardevs.com',
    accepts: () => false,
  };
  let out = null;
  const res = {
    status(c) { out = c; return this; },
    send() { return this; },
    json() { return this; },
  };
  // The middleware logs every refusal. That is right in production and noise
  // here, where a refusal is the expected result.
  const warn = console.warn;
  console.warn = () => {};
  try { csrf.guard()(req, res, () => { out = 'pass'; }); } finally { console.warn = warn; }
  return out;
}

const SELF = { host: 'oscardevs.com', origin: 'https://oscardevs.com' };

/* ── The attack the report described ───────────────────────────────────── */
check('تاجر مستضاف عندنا بيبعت فورم من دومينه لـ/company → بيترفض',
  run('POST', '/company/products/9/delete',
    { host: 'oscardevs.com', origin: 'https://evil.oscardevs.com' }) === 403);
check('ولـ/admin كمان',
  run('POST', '/admin/companies/3/approve',
    { host: 'oscardevs.com', origin: 'https://evil.oscardevs.com' }) === 403);
check('وموقع بره خالص برضه بيترفض',
  run('POST', '/company/orders/1/status',
    { host: 'oscardevs.com', origin: 'https://attacker.example' }) === 403);

/* ── And the ordinary use of the site keeps working ────────────────────── */
check('فورم عادي من نفس الموقع بيعدّي', run('POST', '/company/products/add', SELF) === 'pass');
check('وصفحة تاجر بتبعت لنفس دومينها بتعدّي',
  run('POST', '/order', { host: 'hand.oscardevs.com', origin: 'https://hand.oscardevs.com' }) === 'pass');
check('والبورت في الـOrigin مابيكسرش المقارنة',
  run('POST', '/company/x', { host: 'localhost:3000', origin: 'http://localhost:3000' }) === 'pass');
check('و`Referer` بيقوم مقام `Origin` لما مايتبعتش',
  run('POST', '/company/x', { host: 'oscardevs.com', referer: 'https://oscardevs.com/company/products' }) === 'pass');
check('و`Referer` من دومين تاني بيترفض',
  run('POST', '/company/x', { host: 'oscardevs.com', referer: 'https://evil.oscardevs.com/p' }) === 403);
check('وGET مابيتحرسش (القراءة مش تغيير)',
  run('GET', '/company/products', { host: 'oscardevs.com', origin: 'https://evil.oscardevs.com' }) === 'pass');

/* ── The Cloudflare rewrite ────────────────────────────────────────────── */
check('الهوست بيتاخد من `x-tenant-host` زي باقي التطبيق',
  run('POST', '/order', { host: 'oscardevs.com', 'x-tenant-host': 'hand.oscardevs.com',
    origin: 'https://hand.oscardevs.com' }) === 'pass');
check('ولو الورکر رمى الطلب على تينانت تاني بيترفض',
  run('POST', '/order', { host: 'oscardevs.com', 'x-tenant-host': 'hand.oscardevs.com',
    origin: 'https://other.oscardevs.com' }) === 403);

/* ── The deliberate gaps, stated out loud ──────────────────────────────── */
check('طلب من غير `Origin` ولا `Referer` بيعدّي (موبايل/curl — والمهاجم مش قادر يشيلهم)',
  run('POST', '/company/x', { host: 'oscardevs.com' }) === 'pass');
check('و`Origin: null` (iframe مسنبَك) بيترفض',
  run('POST', '/company/x', { host: 'oscardevs.com', origin: 'null',
    referer: 'https://evil.oscardevs.com/x' }) === 403);
check('و`Origin` مكسور بيترفض مش بيتحسب «مش متصفح»',
  run('POST', '/company/x', { host: 'oscardevs.com', origin: 'يلا' }) === 403);
check('وكولباك بيمبوب معفي (متحقّق بـHMAC أقوى من ده)',
  run('POST', '/shop/pay/paymob/callback', { host: 'oscardevs.com' }) === 'pass'
  && run('POST', '/order/pay/paymob/callback', { host: 'oscardevs.com', origin: 'https://paymob.com' }) === 'pass');

/* ── Mounted once, above everything, and after the session ─────────────── */
{
  const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const iSession = srv.indexOf('app.use(session(');
  const iCsrf = srv.indexOf('app.use(csrfGuard.guard())');
  /* The FIRST router in the file, not the first admin one. Kakeibo is
     host-routed and returns without touching the rest of the pipeline, so a
     guard mounted after it would simply not exist for that whole product —
     which is what happened the first time this was mounted. */
  const iFirstRouter = Math.min(
    ...[srv.indexOf('const kakeiboRouter = require'), srv.indexOf("app.use('/company', companyRouter)")]
      .filter((i) => i > -1)
  );
  check('الحارس متركّب بعد الجلسة وقبل **أول** راوتر (كاكيبو مضمّن)',
    iSession > -1 && iCsrf > iSession && iFirstRouter > iCsrf,
    `session@${iSession} csrf@${iCsrf} أول راوتر@${iFirstRouter}`);
  check('والكوكي لسه lax (ده النص التاني من الحماية)',
    /sameSite: 'lax'/.test(srv));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني تاجر مستضاف عندنا يقدر يشغّل أوامر في حساب حد تاني.`
  : '\nالطلب اللي جاي من صفحة تانية بيتوقف، والاستخدام العادي شغّال.');
process.exit(fail ? 1 : 0);
