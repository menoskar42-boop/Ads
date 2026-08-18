#!/usr/bin/env node
/**
 * Two patients on the same doctor at the same minute.
 *
 * The booking INSERT already carries its own clash test — `NOT EXISTS (… within
 * the slot window …)` in the same statement, which is genuinely better than a
 * SELECT beforehand. It is still not enough: under READ COMMITTED that
 * `NOT EXISTS` cannot see a row another transaction has inserted and not yet
 * committed. A clinic that shares its booking link on WhatsApp really does get
 * two people tapping the same slot in the same second, and both are told yes.
 *
 * Two mechanisms, closing different halves:
 *
 *   · **an advisory lock on (company, doctor)** for the transaction, so
 *     bookings for one doctor queue up and the ±window test sees the ones ahead
 *     of it. The window is a per-clinic setting, so no index can express it.
 *     Two doctors never wait on each other.
 *   · **a unique index on (company, doctor, slot_at)** — exact collisions only,
 *     which is exactly what a slot picker produces, and it holds even for a
 *     code path that forgets the lock. The lock makes the common case correct;
 *     the index makes the mistake survivable.
 *
 * And both callers go through one function, because the guarantee is worth
 * nothing if the second booking route reimplements it.
 *
 *   node scripts/check-appointment-slot.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const booking = require('../src/clinic/booking');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

/* ── The SQL still refuses a taken slot on its own ─────────────────────── */
{
  const q = booking.insertIfFree({
    companyId: 1, doctorId: 2, name: 'x', phone: 'y',
    slotAt: '2026-09-01T10:00:00Z', reason: null, status: 'pending',
  });
  check('الجملة لسه بتحطّ اختبار التعارض جوّاها', /NOT EXISTS/.test(q.text));
  check('والملغي مابيحجزش الميعاد', /status <> 'cancelled'/.test(q.text));
  check('والنافذة بالدقايق مش بالمساواة', /abs\(extract\(epoch from/.test(q.text));
  check('والمواعيد بتتقيّد بالعيادة', /company_id = \$1/.test(q.text));
}

/* ── The lock ──────────────────────────────────────────────────────────── */
{
  const src = code('src/clinic/booking.js');
  const fn = (src.match(/async function book\([\s\S]*?\n\}/) || [''])[0];
  check('في دالة واحدة بتحجز، والحجز جوّه معاملة', /BEGIN/.test(fn) && /COMMIT/.test(fn));
  check('وبتاخد قفل استشاري على (العيادة، الدكتور)',
    /pg_advisory_xact_lock\(\$1::int, \$2::int\)/.test(fn));
  const iLock = fn.indexOf('pg_advisory_xact_lock');
  const iIns = fn.indexOf('client.query(q.text');
  check('والقفل قبل الإضافة', iLock > -1 && iIns > iLock, `lock@${iLock} insert@${iIns}`);
  check('ومن غير دكتور مفيش قفل (مفيش حاجة تتصادم)', /if \(opts\.doctorId\)/.test(fn));
  check('وتصادم الفهرس بيترجم لـ«الميعاد اتحجز» مش خطأ',
    /e\.code === '23505'\) return null/.test(fn));
  check('والاتصال بيترجع في كل الحالات', /finally \{[\s\S]{0,60}client\.release\(\)/.test(fn));
}

/* ── Both callers go through it ────────────────────────────────────────── */
for (const [label, rel] of [['الحجز العام', 'src/routes/tenant.js'],
                            ['حجز الاستقبال من رسالة صوتية', 'src/routes/clinic_admin.js']]) {
  const src = code(rel);
  check(label + ': بيستخدم `booking.book`', /booking\.book\(pool,/.test(src));
  // A caller running the SQL itself has its own transaction, or none.
  check(label + ': ومش بينفّذ الجملة بنفسه', !/booking\.insertIfFree\(/.test(src));
}

/* ── The index underneath ──────────────────────────────────────────────── */
{
  const schema = code('src/clinic/schema.js');
  check('فيه فهرس فريد لميعاد واحد لكل دكتور',
    /CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_one_appt_per_slot[\s\S]{0,200}\(company_id, doctor_id, slot_at\)/.test(schema));
  check('والملغي وبدون ميعاد وبدون دكتور مستثنيين',
    /WHERE status <> 'cancelled' AND slot_at IS NOT NULL AND doctor_id IS NOT NULL/.test(schema));
  const iFix = schema.indexOf("SET status = 'cancelled'\n       WHERE a.status");
  const iIdx = schema.indexOf('idx_clinic_one_appt_per_slot');
  check('والتعارضات القديمة بتتظبّط قبل ما الفهرس يتعمل',
    iFix > -1 && iIdx > iFix, `backfill@${iFix} index@${iIdx}`);
  check('والمكرر بيتلغى مش بيتمسح (مريضين اتقالهم أيوه)',
    !/DELETE FROM clinic_appointments/.test(schema));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني مريضين ممكن يتقالهم نفس الميعاد مع نفس الدكتور.`
  : '\nالميعاد بيتحجز ورا قفل، وتحته فهرس فريد لو حد نسي القفل.');
process.exit(fail ? 1 : 0);
