#!/usr/bin/env node
/**
 * مفاتيح الـcron وحدّ محاولات الدخول — تلات أغلاط من مراجعة كود خارجية.
 *
 * ── ١) السر كان مقبول في الـquery string ───────────────────────────────
 *
 *     const provided = req.query.key || req.get('x-cron-key') || '';
 *
 * السر في العنوان بيتسجّل في access logs، وفي تاريخ أي بروكسي، وفي أي
 * أداة مراقبة بتخزّن العناوين. **السر اللي دخل لوج مايخرجش منه** —
 * وتغييره بيحتاج تدخّل، مش بيحصل لوحده.
 *
 * والرفض دلوقتي صريح مش «مقبول مع تحذير»: لو كان مقبول مؤقتاً هيفضل
 * مقبول للأبد. الرد بيقول الإصلاح بالحرف عشان اللي cron بتاعه هيكسر
 * يعرف يعمل إيه من الرد نفسه.
 *
 * ── ٢) المقارنة كانت `!==` ─────────────────────────────────────────────
 *
 * بتقف عند أول حرف مختلف، فزمنها بيكشف كام حرف صح من الأول.
 *
 * ── ٣) حدّ الدخول كان بوكت واحد للحساب والـIP مع بعض ───────────────────
 *
 * التعليق كان بيقول «مربوط بالحساب بغض النظر عن الـIP»، والكود كان
 * `email + '|' + ip`. يعني تغيير الـIP بيفتح بوكت جديد بالكامل لنفس
 * الحساب: حساب واحد ينفع يتجرّب من عشر عناوين بمية وعشرين محاولة، وكل
 * واحدة «تحت الحد». التعليق والكود كانوا بيقولوا حاجتين مختلفتين.
 *
 * Usage: node scripts/check-cron-and-limits.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

// ── مفاتيح الـcron ─────────────────────────────────────────────────────

const cronAuth = require('../src/lib/cron_auth');
const server = code(read('server.js'));

check('مفيش قراءة للمفتاح من الـquery في `server.js`',
  !/req\.query\.key/.test(server),
  'السر في العنوان بيتسجّل في كل access log — ومايخرجش منه.');

check('مفيش `e.message` راجع للعميل من مسار cron',
  !/catch \(e\) \{ res\.status\(500\)\.json\(\{ ok: false, error: e\.message \}\)/.test(server),
  'رسالة الخطأ الخام ممكن تحتوي مسار ملف أو اسم عمود أو نص استعلام.');

check('المسارات بتنده الحارس المشترك',
  (server.match(/cronAuth\.guard\(req, res\)/g) || []).length >= 2,
  'كل مسار cron لازم يعدّي من نفس الحارس — نسختين بيفترقوا.');

// السلوك نفسه، مش شكل الكود.
{
  const mk = (q, h) => ({ query: q, get: (k) => (k.toLowerCase() === 'x-cron-key' ? h : undefined) });
  const res = () => {
    const r = { code: null, body: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    return r;
  };
  const OLD = process.env.PUSH_CRON_SECRET;
  process.env.PUSH_CRON_SECRET = 'topsecret123';

  let r = res();
  check('المفتاح في الـquery **مرفوض** حتى لو صح',
    cronAuth.guard(mk({ key: 'topsecret123' }, undefined), r) === false && r.code === 400,
    `رجّع ${r.code} — المفروض ٤٠٠ ورفض صريح.`);
  check('والرد بيقول الإصلاح',
    /x-cron-key/.test((r.body && r.body.error) || ''),
    `الرد «${r.body && r.body.error}» — اللي cron بتاعه هيكسر لازم يعرف السبب.`);

  r = res();
  check('المفتاح الصح في الهيدر بيعدّي',
    cronAuth.guard(mk({}, 'topsecret123'), r) === true, `رجّع ${r.code}.`);

  r = res();
  check('المفتاح الغلط بيترفض',
    cronAuth.guard(mk({}, 'wrong'), r) === false && r.code === 403, `رجّع ${r.code}.`);

  r = res();
  process.env.PUSH_CRON_SECRET = '';
  check('ومن غير سر مضبوط بيرجّع ٥٠٣ مش بيفتح',
    cronAuth.guard(mk({}, ''), r) === false && r.code === 503, `رجّع ${r.code}.`);
  if (OLD === undefined) delete process.env.PUSH_CRON_SECRET;
  else process.env.PUSH_CRON_SECRET = OLD;
}

/* ⚠️ **بنجرّد التعليقات الأول.**
 *
 * أول نسخة من الفحصين دول كانت بتقرا الملف خام. التعليق اللي بيشرح
 * `timingSafeEqual` كان بيخلّي الفحص يعدّي حتى بعد ما المقارنة اتغيّرت
 * لـ`===`. الفحص كان بيقرا **الشرح** مش الكود.
 *
 * ودي خامس مرة تحصل في المشروع ده. */
const cronSrc = code(read('src/lib/cron_auth.js'));
check('المقارنة ثابتة الزمن', /timingSafeEqual/.test(cronSrc),
  '`!==` بتقف عند أول حرف مختلف، فزمنها بيكشف كام حرف صح.');
check('وبتبصم قبل المقارنة عشان الطول مايسرّبش',
  /createHash\('sha256'\)[\s\S]{0,200}timingSafeEqual/.test(cronSrc),
  '`timingSafeEqual` بترمي لو الطولين مختلفين — وده في حد ذاته بيسرّب الطول.');

// ── حدّ محاولات الدخول ─────────────────────────────────────────────────

const rl = require('../src/middleware/rateLimit');
const mkRes = () => {
  const r = { headersSent: false, blocked: false };
  r.setHeader = () => {};
  r.status = () => r;
  r.json = () => { r.blocked = true; r.headersSent = true; return r; };
  return r;
};
const attempt = (email, ip) => {
  const res = mkRes();
  rl.loginLimiter({
    body: { email }, headers: { 'x-forwarded-for': ip },
    socket: { remoteAddress: ip }, get: () => undefined,
  }, res, () => {});
  return res.blocked;
};

// نفس الحساب من عناوين مختلفة — دي الحالة اللي كانت بتعدّي.
let blocked = 0;
for (let i = 0; i < 25; i += 1) if (attempt('victim-a@test', '10.0.0.' + i)) blocked += 1;
check('الحساب محمي حتى لو الـIP بيتغيّر كل محاولة', blocked > 0,
  '٢٥ محاولة على نفس الحساب من ٢٥ عنوان مختلف عدّت كلها. '
  + 'ده بالظبط شكل الهجمة اللي الحد اتعمل يمنعها.');

// وعنوان واحد على حسابات كتير.
let blocked2 = 0;
for (let i = 0; i < 45; i += 1) if (attempt(`u${i}@test`, '10.5.5.5')) blocked2 += 1;
check('والعنوان محمي حتى لو الحساب بيتغيّر كل محاولة', blocked2 > 0,
  '٤٥ محاولة من نفس العنوان على ٤٥ حساب عدّت كلها.');

check('البريد بيتخزّن مبصوم مش خام',
  !/@/.test(rl._accountKey({ body: { email: 'someone@example.com' } })),
  'مفاتيح الذاكرة بتظهر في أي dump أو تشخيص — مافيش سبب يخلّي بريد عميل فيها.');

check('والبوكتين منفصلين فعلاً',
  typeof rl._byAccount === 'function' && typeof rl._byIp === 'function'
  && rl._byAccount !== rl._byIp,
  'بوكت واحد بيجمع الاتنين معناه إن تغيير أي طرف بيفتح عدّاد جديد.');

process.exit(failed ? 1 : 0);
