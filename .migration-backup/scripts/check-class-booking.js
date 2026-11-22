#!/usr/bin/env node
/**
 * A class of twenty with thirty-nine people in it.
 *
 * The public booking route counted the bookings, compared the count with the
 * class capacity, and then inserted. Twenty requests arriving in the same
 * second each read "19 booked", each conclude there is room, and each insert.
 * No request is wrong; the sequence is. The gym finds out at the door.
 *
 * And nothing stopped the same phone number booking the same class fifty
 * times, so a class could be filled without a single real member.
 *
 * Both fixes live where the guarantee can actually hold:
 *
 *   · **the class row is locked** before the count. Every booking for that
 *     class queues behind the same row, so each count includes the bookings
 *     ahead of it. The lock is on `gym_classes` and not on the bookings,
 *     because there is no booking row yet to lock.
 *   · **a unique partial index** on (class, date, phone). Two requests both
 *     asking "has this phone booked?" both get "no" — the database is the only
 *     place that question has one answer.
 *
 * The phone is stored digits-only alongside the typed one, or "one booking
 * each" is defeated by a space bar.
 *
 *   node scripts/check-class-booking.js
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

const tenant = code('src/routes/tenant.js');
const route = (tenant.match(/router\.post\('\/book-class'[\s\S]*?\n\}\);/) || [''])[0];
check('لقيت راوت الحجز', !!route);

/* ── The capacity decision is serialised ───────────────────────────────── */
check('الحجز كله في معاملة واحدة', /BEGIN/.test(route) && /COMMIT/.test(route));
check('وصف الكلاس بيتقفل قبل العدّ',
  /FROM gym_classes WHERE id=\$1 AND company_id=\$2 AND is_active=true FOR UPDATE/.test(route));
{
  // Locking after counting protects nothing.
  const iLock = route.indexOf('FOR UPDATE');
  const iCount = route.indexOf('COUNT(*)');
  const iInsert = route.indexOf('INSERT INTO gym_bookings');
  check('والترتيب: قفل ← عدّ ← إضافة',
    iLock > -1 && iCount > iLock && iInsert > iCount, `lock@${iLock} count@${iCount} insert@${iInsert}`);
}
check('والفشل بيعمل ROLLBACK ويسيب الاتصال', /ROLLBACK/.test(route) && /client\.release\(\)/.test(route));
check('والامتلاء لسه بيوديّ لقائمة انتظار مش رفض',
  /booked >= gymClass\.capacity \? 'waitlist' : 'booked'/.test(route));

/* ── One booking per person, enforced by the database ──────────────────── */
{
  const schema = code('src/gym/schema.js');
  check('فيه فهرس فريد لحجز واحد للشخص في الكلاس واليوم',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_one_booking_per_person[\s\S]{0,200}\(class_id, booking_date, phone_key\)/.test(schema));
  check('والملغي مستثنى منه (يعرف يحجز تاني بعد الإلغاء)',
    /WHERE status <> 'cancelled' AND phone_key <> ''/.test(schema));
  check('والرقم بيتخزّن أرقام بس فالمسافات مابتخدعش الفهرس',
    /ALTER TABLE gym_bookings ADD COLUMN IF NOT EXISTS phone_key TEXT/.test(schema)
    && /phone\.replace\(\/\[\^0-9\]\/g, ''\)/.test(route));
  /* A partial unique index over rows that already violate it is not created at
     all — and a boot that logs the error and carries on has no index and no
     sign of it. The backfill has to come first. */
  const iFix = schema.indexOf("SET status = 'cancelled'");
  const iIdx = schema.indexOf('idx_gym_one_booking_per_person');
  check('والصفوف المكررة القديمة بتتظبّط قبل ما الفهرس يتعمل',
    iFix > -1 && iIdx > iFix, `backfill@${iFix} index@${iIdx}`);
  check('والتكرار بيتلغى مش بيتمسح (حد ضغط الزرار فعلاً)',
    !/DELETE FROM gym_bookings/.test(schema));
}

/* ── And the person is told, in words, what happened ───────────────────── */
{
  const view = fs.readFileSync(path.join(ROOT, 'src/views/tenant_gym.ejs'), 'utf8');
  check('الحجز المكرر بيرجع برسالة مش بخطأ عام', /bookerr=dup/.test(route));
  check('والصفحة بتقولها', /gymBookError === 'dup'/.test(view));
  check('والرسالة مش من الرابط — أكواد بس',
    /\['booked', 'waitlist'\]\.includes/.test(tenant)
    && /\['1', 'dup', 'closed', 'members'\]\.includes\(String\(req\.query\.bookerr/.test(tenant));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني كلاس ٢٠ ممكن يتحجزله ٣٩ مكان.`
  : '\nالسعة بتتقرّر ورا قفل، وشخص واحد = حجز واحد بقرار من القاعدة.');
process.exit(fail ? 1 : 0);
