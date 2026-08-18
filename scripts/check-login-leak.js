#!/usr/bin/env node
/**
 * The login form was answering questions nobody had authenticated to ask.
 *
 * Type any email into `/company/login` and the page told you:
 *
 *   · whether that address had applied to the platform at all,
 *   · whether the application was rejected,
 *   · and on a rejection, `admin_notes` **verbatim** — the reviewer's own
 *     internal note about that business.
 *
 * No password. No token. The note is the kind of sentence a reviewer writes
 * for colleagues ("no licence", "a customer complained"), and it was being
 * read out to whoever typed the address — including to the applicant's
 * competitor, who only needs to guess their email.
 *
 * `/apply/track/:token` already answers "how is my application doing", to the
 * person holding the token, and deliberately does not select `admin_notes`.
 * The login form's job is to say whether these credentials work.
 *
 * The rule here: **every failure path renders the same sentence**, and it
 * carries the pointer to the tracking page so a waiting applicant is still
 * guided — shown to everyone, it discloses nothing.
 *
 *   node scripts/check-login-leak.js
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
const raw = fs.readFileSync(path.join(ROOT, 'src/routes/company.js'), 'utf8');
/* The comment explaining the bug names the column and quotes the old strings. */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const login = (code.match(/router\.post\('\/login'[\s\S]*?\n\}\);/) || [''])[0];
check('لقيت راوت الدخول', !!login);

/* ── Nothing about the application reaches the login page ──────────────── */
check('الدخول مابيسألش عن `signup_applications` خالص',
  !/signup_applications/.test(login));
check('و`admin_notes` مش متذكورة في الراوت',
  !/admin_notes/.test(login));
check('ومفيش رسالة «طلبك قيد المراجعة» بتأكّد إن الإيميل ده قدّم',
  !/قيد المراجعة/.test(login));
check('ومفيش رسالة رفض',
  !/لم يتم قبول/.test(login) && !/السبب: /.test(login));

/* ── Every failure says the same thing ─────────────────────────────────── */
{
  // Each `renderLogin({ error: … })` inside the login route. If any of them
  // carries a literal instead of the shared constant, the wording varies by
  // cause again and the form is an oracle again.
  // The catch block is allowed its own wording: "something went wrong" is not
  // an authentication outcome and reads the same for every email. Every branch
  // that DECIDES about credentials must be identical.
  const errs = [...login.matchAll(/renderLogin\(\{\s*error:\s*([^,}]+)/g)]
    .map((m) => m[1].trim())
    .filter((e) => !/حدث خطأ ما/.test(e));
  check('كل مسارات الفشل بتقول نفس الجملة', errs.length > 0 && errs.every((e) => e === 'LOGIN_FAILED'),
    errs.join(' | ') || 'مالقيتش ولا واحد');
  check('والجملة معرّفة مرة واحدة برّه الراوت', /const LOGIN_FAILED = /.test(code));
  check('وفيها الإشارة لصفحة متابعة الطلب (للي مستني الموافقة)',
    /متابعة الطلب/.test(raw.slice(raw.indexOf('const LOGIN_FAILED'), raw.indexOf('const LOGIN_FAILED') + 300)));
}

/* ── The timing half of the same oracle ────────────────────────────────── */
{
  check('وإيميل مش موجود بيدفع تكلفة bcrypt زي الموجود',
    /bcrypt\.compare\(password, DUMMY_HASH\)/.test(login));
  check('والهاش الوهمي متعمول مرة عند التشغيل', /const DUMMY_HASH = bcrypt\.hashSync/.test(code));
  // Same cost factor, or the two paths still measure differently.
  const real = (code.match(/bcrypt\.hash\([^,]+,\s*(\d+)\)/) || [])[1];
  const dummy = (code.match(/bcrypt\.hashSync\([^,]+,\s*(\d+)\)/) || [])[1];
  check('وبنفس تكلفة الهاش الحقيقي', !real || real === dummy, `حقيقي ${real} · وهمي ${dummy}`);
}

/* ── The page that IS allowed to answer still does not over-answer ─────── */
{
  const apply = fs.readFileSync(path.join(ROOT, 'src/routes/apply.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, nl)
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));
  check('وصفحة متابعة الطلب بالتوكن لسه مابتجيبش `admin_notes`',
    !/admin_notes/.test(apply));
  check('ولسه عليها rate limit', /statusLimiter/.test(apply));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني حد يكتب إيميل ويعرف حاجات مالوش دعوة بيها.`
  : '\nالدخول بيقول حاجة واحدة لكل فشل، وملاحظات المراجعة مابتخرجش منه.');
process.exit(fail ? 1 : 0);
