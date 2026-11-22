#!/usr/bin/env node
/**
 * Three ways a message went out wrong — or a promise to send one was thrown
 * away.
 *
 * **The daily jobs ran twice.** They fired from a 30-minute timer that checked
 * `h === 8`. Hour 8 happens at 08:00 and again at 08:30, so every gym owner got
 * the same renewal alert twice each morning and so did every NeuroPilot user.
 * An in-process "already sent" flag would not have fixed it either: Autoscale
 * runs several instances, each with its own memory and its own timer. The day
 * is now claimed in the database — one row, one winner.
 *
 * **"Back in stock" marked itself sent when it had not sent.** With no mailer
 * configured the loop skipped the send and still set `notified = true`: the
 * customer who asked to be told never was, and the row that would have told
 * them was gone. A failed send did the same. And the link in the email pointed
 * at `/product/<notification id>` — the wrong product, or a 404 — so even the
 * ones that arrived did not work.
 *
 * **A class could be booked after it had finished.** The date was the next
 * occurrence of the weekday, today included, with no look at the time. At ten
 * at night a member could book the six o'clock class, take a place in a session
 * that no longer existed, and turn up to a locked studio.
 *
 *   node scripts/check-notifications.js
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
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── Once a day means once ─────────────────────────────────────────────── */
{
  const srv = code('server.js');
  const lib = code('src/lib/once_daily.js');
  check('اليوم بيتحجز في القاعدة مش في ذاكرة النسخة',
    /INSERT INTO app_meta[\s\S]{0,260}ON CONFLICT \(key\) DO NOTHING\s*\n?\s*RETURNING key/.test(lib));
  check('والمفتاح فيه تاريخ القاهرة مش تاريخ السيرفر',
    /now\(\) AT TIME ZONE 'Africa\/Cairo'\)::date, 'YYYY-MM-DD'/.test(lib));
  check('وفشل الحجز مابيبقاش «أيوه» بالسكوت',
    /catch \(e\)[\s\S]{0,700}return false;/.test(lib));
  check('والتنبيهين الاتنين ورا الحجز',
    /claimToday\(sessionPool, 'neuropilot_daily'\)/.test(srv)
    && /claimToday\(sessionPool, 'gym_expiry_alerts'\)/.test(srv));
  check('ومفيش نداء مباشر فاضل جوّه شرط الساعة',
    !/if \(h === 8\) \{\s*\n\s*neuroPush\.sendDaily/.test(srv));
  check('والمفاتيح القديمة بتتنضّف', /onceDaily\.sweep\(sessionPool\)/.test(srv));

  /* The claim is only worth anything if the key is unique. app_meta's key is
     its primary key — assert it, because ON CONFLICT on a non-unique column is
     an error at runtime, not a silent fallback. */
  const schema = code('src/pharmacy/schema.js');
  check('و`app_meta.key` مفتاح أساسي (وإلا ON CONFLICT بترمي)',
    /CREATE TABLE IF NOT EXISTS app_meta \(\s*\n\s*key TEXT PRIMARY KEY/.test(schema));
}

/* ── A promise to email is not kept by pretending ──────────────────────── */
{
  const n = code('src/lib/stock_notifier.js');
  check('من غير ميلر الصفوف بتفضل معلّقة مش بتتعلّم متبعتة',
    /if \(!mailer \|\| !mailer\.sendMail\)[\s\S]{0,220}return \{ sent: 0, pending/.test(n));
  check('والإرسال الفاشل بيكمّل من غير ما يعلّم',
    /catch \(e\) \{[\s\S]{0,300}failed\+\+;[\s\S]{0,200}continue;/.test(n));
  check('والتعليم بيحصل بعد نجاح الإرسال بس',
    n.indexOf("UPDATE stock_notifications SET notified = true") > n.indexOf('await mailer.sendMail'));
  check('ولينك الإيميل بيوديّ على المنتج مش على رقم التنبيه',
    /p\.id AS product_id/.test(n) && /\/product\/\$\{r\.product_id\}/.test(n));
  check('ومفيش `r.id` فاضل في اللينك', !/product\/\$\{r\.id\}/.test(n));
}

/* ── A class that has already run cannot be booked ─────────────────────── */
{
  const t = code('src/routes/tenant.js');
  const admin = code('src/routes/gym_admin.js');
  const q = (t.match(/WITH n AS \(SELECT \(now\(\) AT TIME ZONE[\s\S]{0,700}?FROM b`/) || [''])[0];
  check('لقيت حسبة تاريخ الحجز', !!q);
  check('واليوم بتوقيت القاهرة مش توقيت السيرفر', /now\(\) AT TIME ZONE 'Africa\/Cairo'/.test(q));
  check('ولو الكلاس النهاردة وميعاده عدّى بيروح الأسبوع الجاي',
    /starts <= ts::time[\s\S]{0,60}THEN d \+ 7/.test(q));
  check('وميعاد مش مكتوب صح مابيكسرش الحسبة',
    /\$2 ~ '\^\(\[01\]\[0-9\]\|2\[0-3\]\):\[0-5\]\[0-9\]\$'/.test(q));
  check('وميعاد الكلاس نفسه بيتحفظ HH:MM أو ولا حاجة',
    /\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$/.test(admin));
  check('ومفيش الحسبة القديمة اللي بتقف عند اليوم',
    !/SELECT \(CURRENT_DATE \+ \(\(\(7 \+ \$1 - EXTRACT\(DOW FROM CURRENT_DATE\)::int\) % 7\)\) \)::date AS d/.test(t));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني رسالة بتتبعت مرتين، أو مابتتبعتش وبتتعلّم إنها اتبعتت.`
  : '\nالتنبيه اليومي مرة واحدة، والميل مابيتعلّمش إلا لما يتبعت فعلاً.');
process.exit(fail ? 1 : 0);
