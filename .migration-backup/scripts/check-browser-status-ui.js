#!/usr/bin/env node
/**
 * The chip that said the same thing either way.
 *
 * The app showed one static «🧩 المتصفح» whether the user's extension was
 * connected, never installed, or connected an hour ago and since closed. So
 * somebody asked Sokro to open a site, waited, and got an apology — while the
 * one fact that explained it sat on screen the whole time, saying nothing.
 *
 * Three honest states, and only one of them asks for anything:
 *
 *   · **متصل بمتصفّحك** — their own browser, with their logged-in sessions;
 *   · **متصفّح السيرفر** — public pages only, and the chip says so, because a
 *     user who expects their own account to be visible is going to be surprised
 *     in the middle of a task otherwise;
 *   · **وصّل الإضافة** — nothing at all, and the hint says what to do.
 *
 * It also refreshes: an extension can connect mid-session or be closed, and a
 * status checked once at load is the same lie with a timestamp on it.
 *
 *   node scripts/check-browser-status-ui.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const router = fs.readFileSync(path.join(ROOT, 'sokro/router.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
const ui = fs.readFileSync(path.join(ROOT, 'sokro/ui/app.html'), 'utf8');

/* ── The endpoint, and what it is allowed to say ───────────────────────── */
{
  check('فيه راوت بيقول حالة المتصفّح', /router\.get\('\/api\/browser\/status'/.test(router));
  check('ومحتاج تسجيل دخول', /'\/api\/browser\/status', auth\.requireAuth/.test(router));
  check('وبيسأل الإضافة والسيرفر الاتنين',
    /extBridge\.connected\(req\.sokroUser\.id\)/.test(router) && /browser\.status\(\)/.test(router));
  check('والترتيب: متصفّح المستخدم الأول', /ext \? 'extension' : \(srv\.ok \? 'server' : 'none'\)/.test(router));
  check('والتلات حالات ليها أسماء عربية',
    /extension: 'متصل بمتصفّحك'/.test(router) && /server: 'متصفّح السيرفر'/.test(router) && /none: 'وصّل الإضافة'/.test(router));
  // The server browser cannot see the user's accounts. Saying only "connected"
  // would surprise them mid-task.
  check('وحالة السيرفر بتقول إنها من غير حساباتك', /من غير حساباتك/.test(router));
  check('وحالة «مفيش» بتقول اعمل إيه', /unavailableMessage\(srv\.why\)/.test(router) && /\/ext/.test(router));
}

/* ── Run the three states through the real function ────────────────────── */
{
  // The route body, evaluated with fakes: the states have to be produced, not
  // just mentioned in the source.
  const body = (router.match(/router\.get\('\/api\/browser\/status'[\s\S]*?\n\}\);/) || [''])[0];
  check('لقيت جسم الراوت', !!body);
  const run = (extConnected, serverOk) => {
    let out = null;
    const fakeRouter = { get: (_p, _auth, fn) => fn({ sokroUser: { id: 1 } }, { json: (j) => { out = j; } }) };
    // eslint-disable-next-line no-new-func
    new Function('router', 'auth', 'extBridge', 'browser', body)(
      fakeRouter,
      { requireAuth: null },
      { connected: () => extConnected },
      { status: () => ({ ok: serverOk, why: serverOk ? '' : 'not-installed' }), unavailableMessage: () => 'نزّل Chromium.' }
    );
    return out;
  };
  const a = run(true, true);
  check('الإضافة موصولة = «متصل بمتصفّحك»', a.mode === 'extension' && /متصل بمتصفّحك/.test(a.label));
  const b = run(false, true);
  check('ومن غير إضافة ومعاه سيرفر = «متصفّح السيرفر»', b.mode === 'server' && /السيرفر/.test(b.label));
  check('وبيحذّر إنها من غير حسابات المستخدم', /من غير حساباتك/.test(b.hint));
  const c = run(false, false);
  check('ومن غير الاتنين = «وصّل الإضافة»', c.mode === 'none' && /وصّل الإضافة/.test(c.label));
  check('والتلميح بيقول الخطوة', /Chromium|\/ext/.test(c.hint));
}

/* ── The chip on the screen ────────────────────────────────────────────── */
{
  check('الواجهة بتسأل الراوت', /fetch\('\/api\/browser\/status'\)/.test(ui));
  check('وبتحدّث نفسها كل شوية', /setInterval\(refreshBrowser, \d+\)/.test(ui));
  check('وبتسأل أول ما التطبيق يفتح', /refreshBrowser\(\); setInterval/.test(ui));
  check('وليها تلات ألوان', /#extlink\.on\{/.test(ui) && /#extlink\.srv\{/.test(ui) && /#extlink\.off\{/.test(ui));
  check('والنص بيتغيّر من الرد مش متصلّب', /el\.textContent=\(d\.mode==='extension'/.test(ui));
  // Sending a user whose browser is already connected to an install page is the
  // small version of the same bug.
  check('واللي موصول مابيتبعتش لصفحة التثبيت', /if\(d\.mode==='extension'\)\{ el\.removeAttribute\('href'\)/.test(ui));
  check('ولو الطلب فشل الشريحة مابتكدبش في الاتجاه التاني', /leave the chip as it is/.test(ui));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني المستخدم ممكن يستنى مهمة مستحيلة من غير ما حاجة تقوله.`
  : '\nالشريحة بتقول الحقيقة: متصفّحك، ولا متصفّح السيرفر، ولا محتاج توصّل الإضافة.');
process.exit(fail ? 1 : 0);
