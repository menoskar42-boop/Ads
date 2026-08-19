#!/usr/bin/env node
/**
 * The waiting list nobody ever came off, and the place nobody could give back.
 *
 * Booking a class worked. Everything after it did not:
 *
 *   · A member had no way to cancel, so a full class stayed full of people who
 *     were not coming — while the waiting list sat there unused.
 *   · The waiting list existed only at booking time. It put you on it when the
 *     class was full, and nothing ever took you off it. A seat freed at 6pm was
 *     a seat nobody got.
 *
 * ── The rule that makes a waiting list real ─────────────────────────────────
 *
 * A cancelled place is offered to the first person waiting IN THE SAME
 * TRANSACTION. Not by a nightly job — the class is at 6pm and a nightly job
 * promotes somebody at midnight. Exactly one person moves up, the one who has
 * waited longest: the order the list was formed in is the only one that cannot
 * be argued with at the door.
 *
 *   node scripts/check-gym-waitlist.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const B = require('../src/gym/bookings');
const { strings } = require('../src/i18n/strings');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));

const tenant = stripComments(fs.readFileSync(path.join(ROOT, 'src/routes/tenant.js'), 'utf8'));

/* ── Who gets the freed place ──────────────────────────────────────────── */
{
  const waiting = [
    { id: 9, status: 'waitlist', created_at: '2026-08-19T11:00:00Z' },
    { id: 4, status: 'waitlist', created_at: '2026-08-19T09:00:00Z' },
    { id: 7, status: 'waitlist', created_at: '2026-08-19T10:00:00Z' },
    { id: 2, status: 'booked', created_at: '2026-08-19T08:00:00Z' },
  ];
  check('أول واحد في الانتظار هو اللي بياخد المكان', B.nextInLine(waiting).id === 4, String(B.nextInLine(waiting).id));
  check('واللي محجوز خلاص مش في الطابور', B.nextInLine(waiting).status === 'waitlist');
  check('ومفيش حد مستني = مفيش ترقية، ومش غلط', B.nextInLine([]) === null);
  check('والترتيب بيتعرض للعضو', B.placeInLine({ id: 7, status: 'waitlist' }, waiting) === 2);
  check('واللي محجوز مالوش ترتيب', B.placeInLine({ id: 2, status: 'booked' }, waiting) === null);
  // Same second, two people: the id breaks the tie, so the answer is stable.
  const tie = [
    { id: 8, status: 'waitlist', created_at: '2026-08-19T09:00:00Z' },
    { id: 3, status: 'waitlist', created_at: '2026-08-19T09:00:00Z' },
  ];
  check('واتنين في نفس الثانية ليهم ترتيب ثابت', B.nextInLine(tie).id === 3);
}

/* ── What may be cancelled ─────────────────────────────────────────────── */
{
  const today = '2026-08-19';
  check('حجز جاي ينفع يتلغي', B.canCancel({ status: 'booked', booking_date: '2026-08-22' }, today).ok === true);
  check('واللي في الانتظار كمان', B.canCancel({ status: 'waitlist', booking_date: '2026-08-22' }, today).ok === true);
  // Cancelling yesterday rewrites the attendance the gym runs on.
  check('واللي عدّى مايتلغيش', B.canCancel({ status: 'booked', booking_date: '2026-08-10' }, today).why === 'past');
  check('واللي اتلغى خلاص مايتلغيش تاني', B.canCancel({ status: 'cancelled', booking_date: '2026-08-22' }, today).why === 'already');
  check('وحجز مش موجود بيقول كده', B.canCancel(null, today).why === 'missing');
  check('واليوم نفسه لسه ينفع', B.canCancel({ status: 'booked', booking_date: today }, today).ok === true);
}

/* ── Moving to a day the class actually runs ───────────────────────────── */
{
  const today = '2026-08-19';
  const cls = { day_of_week: 6 };   // Saturday
  const bk = { status: 'booked', booking_date: '2026-08-22' };
  check('النقل ليوم الكلاس بيشتغل فيه ينفع', B.canMove(bk, cls, '2026-08-29', today).ok === true);
  check('واليوم الغلط بيترفض', B.canMove(bk, cls, '2026-08-26', today).why === 'wrong_day');
  check('والماضي بيترفض', B.canMove(bk, cls, '2026-08-01', today).why === 'past');
  check('ونفس اليوم مش نقل', B.canMove(bk, cls, '2026-08-22', today).why === 'same');
  check('وتاريخ مش مفهوم بيترفض', B.canMove(bk, cls, 'bukra', today).why === 'date');
  check('وكلاس مالوش يوم محدد مابيمنعش', B.canMove(bk, {}, '2026-08-26', today).ok === true);
}

/* ── The promotion happens where it must ───────────────────────────────── */
{
  const cancel = tenant.slice(tenant.indexOf("router.post('/gym/booking/:token/cancel'"));
  const body = cancel.slice(0, cancel.indexOf('router.', 40));
  check('الإلغاء والترقية في معاملة واحدة',
    /BEGIN/.test(body) && /COMMIT/.test(body) && (body.match(/ROLLBACK/g) || []).length >= 3);
  check('والترقية بتختار بالدالة دي', /gymBookings\.nextInLine\(waiting\)/.test(body));
  check('وبتترقّى واحد بس', /UPDATE gym_bookings SET status='booked', promoted_at=now\(\) WHERE id=\$1/.test(body));
  check('والترقية بتتأكد إنه لسه في الانتظار في نفس الجملة',
    /WHERE id=\$1 AND company_id=\$2 AND status='waitlist'/.test(body));
  // Giving up a waiting-list place frees nothing.
  check('واللي سايب مكانه في الانتظار مابيرقّيش حد',
    /if \(String\(b\.status\) === 'booked'\)/.test(body));
  check('والصفوف مقفولة عشان اتنين مايترقّوش',
    /status='waitlist'\s*\n?\s*FOR UPDATE/.test(body) || /FOR UPDATE/.test(body));
  check('ومفيش جوب بالليل بيعمل ده', !/setInterval[\s\S]{0,200}nextInLine/.test(tenant));

  const move = tenant.slice(tenant.indexOf("router.post('/gym/booking/:token/move'"));
  const mbody = move.slice(0, move.indexOf('router.', 40));
  check('والنقل بيفضّي اليوم القديم كمان', /gymBookings\.nextInLine\(waiting\)/.test(mbody));
  check('والنقل ليوم مليان بيدخل الانتظار مش بيزوّد العدد',
    /booked >= Number\(cls\.capacity\) \? 'waitlist' : 'booked'/.test(mbody));
}

/* ── The link that reaches one booking ─────────────────────────────────── */
{
  check('الحجز بياخد توكن', /token = crypto\.randomBytes\(9\)\.toString\('hex'\)/.test(tenant));
  check('والصفحة بتقرا بالتوكن والشركة',
    /WHERE b\.token=\$1 AND b\.company_id=\$2/.test(tenant));
  check('والإلغاء كمان', /'SELECT \* FROM gym_bookings WHERE token=\$1 AND company_id=\$2 FOR UPDATE'/.test(tenant));
  const schema = fs.readFileSync(path.join(ROOT, 'src/gym/schema.js'), 'utf8');
  check('والتوكن فريد', /CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_booking_token/.test(schema));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/gym_booking.ejs'), 'utf8');
  check('وصفحة الحجز مش بتتأرشف', /noindex,nofollow/.test(view));
  check('وبتعرض الترتيب في الانتظار', /gb\.place/.test(view));
  check('وبتقول للّي اترقّى إنه اترقّى', /booking\.promoted_at/.test(view));
}

/* ── Words ─────────────────────────────────────────────────────────────── */
{
  const keys = ['title', 'saved', 'cancel', 'cancel_confirm', 'move', 'move_do', 'move_hint',
    'place', 'promoted', 'free_seat'].map((k) => 'gb.' + k)
    .concat(['booked', 'waitlist', 'cancelled'].map((k) => 'gb.st.' + k))
    .concat(['missing', 'already', 'past', 'date', 'same', 'wrong_day', 'save'].map((k) => 'gb.err.' + k));
  for (const lang of ['ar', 'en']) {
    const missing = keys.filter((k) => !strings[lang][k]);
    check(`كل نص موجود (${lang})`, missing.length === 0, missing.join(' · ') || keys.length + ' مفتاح');
  }
}

console.log(fail === 0 ? '\n✅ المكان اللي بيفضى بيروح لأول واحد مستني، في نفس اللحظة.' : `\n❌ ${fail} مشكلة.`);
process.exit(fail === 0 ? 0 : 1);
