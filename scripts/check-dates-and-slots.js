#!/usr/bin/env node
/**
 * Three sums that were wrong about time, in three different ways.
 *
 * **The warranty expired a day early.** `Math.floor((ends - now) / 86400000)`
 * reads like "days left" and measures instants: `ends` is midnight on the last
 * day and `now` is the middle of an afternoon, so a warranty whose last day is
 * TODAY came out at −1 and the screen said expired. The version of this bug
 * that reaches a person is a workshop turning a customer away on the last day
 * of their own warranty.
 *
 * **The nursery billed a whole month for eleven days.** A child starting on the
 * 20th was invoiced the full month, and so was a child collected for the last
 * time on the 3rd. That is not a rounding decision somebody made — it is the
 * absence of one, and the family is the party who notices, in the first week of
 * the relationship.
 *
 * **A full-day wedding did not block an evening one.** `collides()` gets the
 * rule right — `full` excludes everything — but the unique index underneath
 * cannot express it: it compares slots for EQUALITY, so a `full` and an
 * `evening` on the same day in the same hall both satisfy it. For that pair the
 * SELECT-then-INSERT was the only thing between two weddings and one hall.
 *
 *   node scripts/check-dates-and-slots.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const J = require('../src/workshop/jobs');
const F = require('../src/nursery/fees');
const HB = require('../src/hall/booking');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The warranty's last day is a day ──────────────────────────────────── */
{
  const ends = new Date(2026, 8, 1);                       // 1 Sep 2026
  check('آخر يوم في الضمان لسه فيه يوم (مش سالب)',
    J.daysBetween(new Date(2026, 8, 1, 14, 0), ends) === 0,
    String(J.daysBetween(new Date(2026, 8, 1, 14, 0), ends)));
  check('واليوم اللي قبله واحد', J.daysBetween(new Date(2026, 7, 31, 23, 30), ends) === 1);
  check('واليوم اللي بعده هو أول يوم منتهي', J.daysBetween(new Date(2026, 8, 2, 0, 30), ends) === -1);
  check('والساعة في اليوم مابتفرقش',
    J.daysBetween(new Date(2026, 8, 1, 0, 1), ends) === J.daysBetween(new Date(2026, 8, 1, 23, 59), ends));
  check('وتاريخ بايظ بيرجع null مش رقم', J.daysBetween('يلا', ends) === null);
  const wsh = code('src/routes/workshop_admin.js');
  check('وصفحة الضمان بتستخدمها', /J\.daysBetween\(now, ends\)/.test(wsh));
  check('ومفيش الطرح القديم بالملي‌ثانية', !/\(ends - now\) \/ 86400000/.test(wsh));
}

/* ── The share of a month a child was there ────────────────────────────── */
{
  const before = { enrolled_on: '2025-01-01' };
  check('شهر كامل = ١', F.monthShare(before, '2026-09') === 1);
  check('بدأ يوم ٢٠ سبتمبر = ١١/٣٠',
    Math.abs(F.monthShare({ enrolled_on: '2026-09-20' }, '2026-09') - 11 / 30) < 1e-9);
  // The leaving day counts: a child collected on the 3rd was there on the 3rd.
  check('مشي يوم ٣ = ٣/٣٠ (يوم المشي محسوب)',
    Math.abs(F.monthShare({ ...before, left_on: '2026-09-03' }, '2026-09') - 3 / 30) < 1e-9);
  check('وفبراير بيتقسّم على ٢٨ مش ٣٠',
    Math.abs(F.monthShare({ enrolled_on: '2026-02-15' }, '2026-02') - 14 / 28) < 1e-9);
  check('ومشي قبل الشهر = صفر', F.monthShare({ ...before, left_on: '2026-08-10' }, '2026-09') === 0);
  check('وبدأ بعد الشهر = صفر', F.monthShare({ enrolled_on: '2026-10-05' }, '2026-09') === 0);
  check('وشهر مش مكتوب صح بيرجع شهر كامل مش صفر', F.monthShare(before, 'يناير') === 1);

  const n = code('src/routes/nursery_admin.js');
  check('وتوليد الفواتير بيضرب في الحصة', /F\.monthShare\(k, period\)/.test(n));
  /* The setting is what makes this safe to ship: it changes what families are
     charged, so it cannot arrive as a new default on everybody's invoices. */
  check('وبس لما الحضانة تشغّلها', /req\.settings\.prorate \? F\.monthShare/.test(n));
  check('والخصم بيتقسّم بنفس النسبة (مش خصم شهر على أيام)',
    /const discount = Math\.round\(fee\.discount \* share \* 100\) \/ 100/.test(n));
  check('والإعداد بيتحفظ وبيظهر في الصفحة',
    /String\(b\.prorate\) === '1'/.test(n)
    && /name="prorate"/.test(fs.readFileSync(path.join(ROOT, 'src/views/nursery_admin/settings.ejs'), 'utf8')));
  check('وافتراضيه مقفول في المخطط',
    /prorate\s+BOOLEAN NOT NULL DEFAULT false/.test(code('src/nursery/schema.js')));
}

/* ── One hall, one day ─────────────────────────────────────────────────── */
{
  const held = (o) => Object.assign({ status: 'confirmed', event_date: '2026-12-12', venue_id: 1 }, o);
  const want = (o) => Object.assign({ event_date: '2026-12-12', venue_id: 1 }, o);
  check('يوم كامل بيمنع سهرة',
    !!HB.findCollision(want({ slot: 'evening' }), [held({ slot: 'full' })]));
  check('وسهرة بتمنع يوم كامل',
    !!HB.findCollision(want({ slot: 'full' }), [held({ slot: 'evening' })]));
  check('وسهرة مابتمنعش ضهرية',
    !HB.findCollision(want({ slot: 'afternoon' }), [held({ slot: 'evening' })]));
  check('وقاعة تانية مابتتأثرش',
    !HB.findCollision(want({ slot: 'full', venue_id: 2 }), [held({ slot: 'full' })]));
  check('والملغي مابيحجزش',
    !HB.findCollision(want({ slot: 'full' }), [held({ slot: 'full', status: 'cancelled' })]));
  check('وتعديل الحجز نفسه مش تعارض',
    !HB.findCollision({ ...want({ slot: 'full' }), id: 7 }, [held({ slot: 'full', id: 7 })]));

  const hall = code('src/routes/hall_admin.js');
  check('والفحص بيتعمل جوّه معاملة ورا قفل',
    /pg_advisory_xact_lock\(hashtext\(\$1\)\)/.test(hall) && /BEGIN/.test(hall));
  check('والقفل على (الشركة، القاعة، اليوم) بس',
    /hall:\$\{cid\}:\$\{venueId \|\| 0\}:\$\{eventDate\}/.test(hall));
  {
    /* Search from the lock onward: `FROM hall_bookings b` also appears in the
       listing route higher up the file, and matching that one would make the
       order look right no matter what the booking route does. */
    const iLock = hall.indexOf('pg_advisory_xact_lock');
    const iSel = hall.indexOf('FROM hall_bookings b', iLock);
    const iIns = hall.indexOf('INSERT INTO hall_bookings', iLock);
    check('والترتيب: قفل ← فحص ← إضافة',
      iLock > -1 && iSel > iLock && iIns > iSel, `lock@${iLock} check@${iSel} insert@${iIns}`);
  }
  check('والإضافة على نفس الاتصال بتاع القفل',
    /const r = await client\.query\(\s*\n?\s*`INSERT INTO hall_bookings/.test(hall));
  check('والاتصال بيترجع في كل الحالات', /finally \{\s*\n\s*client\.release\(\);/.test(hall));
  check('والفهرس الفريد لسه تحته للتصادم المطابق',
    /idx_hall_no_double_booking/.test(code('src/hall/schema.js')));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني ضمان بينتهي بدري، أو أسرة بتدفع شهر مامشتش فيه، أو فرحين في قاعة واحدة.`
  : '\nاليوم يوم، والشهر الناقص بيتحسب بأيامه، والقاعة مابتتحجزش مرتين.');
process.exit(fail ? 1 : 0);
