#!/usr/bin/env node
/**
 * Two hours wrong, every night.
 *
 * The host runs UTC. `CURRENT_DATE`, `timestamptz::date` and
 * `date_trunc('month', …)` all answer in the SESSION's timezone — so between
 * midnight and 2am Cairo, the database's "today" was still yesterday:
 *
 *   · a membership expiring today read as expiring tomorrow, so the renewal
 *     list missed it;
 *   · a 1am check-in landed on the previous day's attendance;
 *   · a sale in the first two hours of the 1st counted toward last month.
 *
 * None of these throw. They are quietly wrong, in whichever direction makes the
 * month-end harder to reconcile, and nobody can point at the moment it happened.
 *
 * The fix is one line at boot rather than forty `AT TIME ZONE` rewrites,
 * because the forty-first is what started this. `options=-c timezone=…` on the
 * connection string is sent as a startup parameter, so every pool in the
 * project inherits it — including the ones created inside modules that are
 * required later, which is most of them.
 *
 *   node scripts/check-timezone.js
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
const srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const srvCode = srv
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The connection string carries the zone ────────────────────────────── */
check('الاتصال بيتظبّط على توقيت القاهرة',
  /options=' \+ encodeURIComponent\('-c timezone=Africa\/Cairo'\)/.test(srvCode));
check('و`options` اللي المالك حاططها بتفضل زي ما هي',
  /!\/\[\?&\]options=\/\.test\(process\.env\.DATABASE_URL\)/.test(srvCode));

/* ── Before anything opens a pool ──────────────────────────────────────── */
{
  const iSet = srvCode.indexOf('timezone=Africa/Cairo');
  const iFirstRequire = srvCode.search(/require\('\.\/src\//);
  const iPool = srvCode.search(/new (?:Session)?Pool\(/);
  check('والتظبيط قبل أول require لموديول بيفتح بوول',
    iSet > -1 && iFirstRequire > iSet, `set@${iSet} require@${iFirstRequire}`);
  check('وقبل أول بوول في server.js نفسه',
    iPool === -1 || iPool > iSet, `set@${iSet} pool@${iPool}`);
}

/* ── Run the transformation, including the awkward cases ───────────────── */
{
  const block = (srv.match(/if \(process\.env\.DATABASE_URL && ![\s\S]*?\n\}/) || [''])[0];
  check('لقيت الكود', !!block);
  const apply = (url) => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    // eslint-disable-next-line no-eval
    eval(block);
    const out = process.env.DATABASE_URL;
    process.env.DATABASE_URL = saved;
    return out;
  };
  check('رابط عادي بياخد الزون',
    apply('postgres://u:p@h/db').endsWith('?options=-c%20timezone%3DAfrica%2FCairo'));
  check('ورابط فيه باراميتر تاني بياخدها بـ&',
    apply('postgres://u:p@h/db?sslmode=require').includes('&options='));
  {
    // Neon and friends use `options` for endpoint routing. Overwriting it would
    // break the connection entirely — far worse than a two-hour date error.
    const already = 'postgres://u:p@h/db?options=endpoint%3Dxyz';
    check('ورابط فيه `options` أصلاً مابيتلمسش', apply(already) === already);
  }
  {
    const once = apply('postgres://u:p@h/db');
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = once;
    // eslint-disable-next-line no-eval
    eval(block);
    const twice = process.env.DATABASE_URL;
    process.env.DATABASE_URL = saved;
    check('والتشغيل مرتين مابيضاعفش الباراميتر', once === twice);
  }
  check('ومن غير `DATABASE_URL` مفيش انفجار', apply('') === '');
}

/* ── The queries that already say it out loud keep saying it ───────────── */
{
  /* Belt and braces on purpose: these are the ones where being wrong is
     invisible, so they name the zone even though the session now sets it. If
     the connection option is ever dropped, they stay right. */
  for (const [what, rel, re] of [
    ['حجز اليوم للتنبيه اليومي', 'src/lib/once_daily.js', /AT TIME ZONE 'Africa\/Cairo'\)::date, 'YYYY-MM-DD'/],
    ['تاريخ حجز الكلاس', 'src/routes/tenant.js', /WITH n AS \(SELECT \(now\(\) AT TIME ZONE 'Africa\/Cairo'\)/],
    ['يوم حضور الجيم', 'src/routes/tenant.js', /\(now\(\) AT TIME ZONE 'Africa\/Cairo'\)::date\)/],
    ['ترحيل الحضور القديم', 'src/gym/schema.js', /checked_in_at AT TIME ZONE 'Africa\/Cairo'\)::date/],
  ]) {
    check(what + ' لسه بيسمّي المنطقة صراحةً',
      re.test(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني التقارير ممكن تبقى غلط ساعتين كل ليلة.`
  : '\nكل اتصال بالقاعدة بتوقيت القاهرة، و«النهاردة» تعني النهاردة.');
process.exit(fail ? 1 : 0);
