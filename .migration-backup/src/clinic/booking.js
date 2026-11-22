'use strict';
/**
 * Two people cannot have the same doctor at the same time.
 *
 * Nothing checked. The public booking form and the receptionist's screen both
 * inserted whatever slot they were given, so the same doctor could be booked
 * twice at 6pm — and nobody found out until both patients were sitting in the
 * waiting room. A slot in the past went in just as happily, which is how a
 * typed year of 2025 quietly disappears from the queue.
 *
 * The conflict test is part of the INSERT, not a SELECT before it. Two people
 * booking the same slot in the same second is not a hypothetical for a clinic
 * that shares its link on WhatsApp: a check-then-insert lets both through.
 *
 * `SLOT_MINUTES` is how much of the doctor's time one appointment takes. It is
 * deliberately a single number rather than per-doctor configuration: the point
 * is to stop a genuine double-booking, and a clinic that wants 12-minute slots
 * is better served by a real calendar than by a setting nobody will find.
 */

const SLOT_MINUTES = 20;

/** How late a slot may be before it counts as "in the past". */
const GRACE_MINUTES = 5;

/**
 * @returns null when the slot is fine, or a reason string:
 *   'past'  — the time has already gone
 *   'far'   — more than a year out (a typo, not a booking)
 */
function slotProblem(slotAt, now) {
  if (!slotAt) return null;                       // no time given: nothing to clash with
  const t = new Date(slotAt).getTime();
  if (!Number.isFinite(t)) return 'past';
  const ref = (now ? new Date(now) : new Date()).getTime();
  if (t < ref - GRACE_MINUTES * 60000) return 'past';
  if (t > ref + 366 * 86400000) return 'far';
  return null;
}

/**
 * SQL that inserts an appointment ONLY when the doctor is free at that time.
 * Returns { text, values }; `rows.length === 0` means the slot was taken.
 *
 * Params, in order: companyId, doctorId, name, phone, slotAt, reason, status.
 */
function insertIfFree({ companyId, doctorId, name, phone, slotAt, reason, status, minutes }) {
  const window = Math.max(1, Number(minutes) || SLOT_MINUTES);
  return {
    text: `
      INSERT INTO clinic_appointments
        (company_id, doctor_id, patient_name, patient_phone, slot_at, reason, status)
      SELECT $1::int, $2::int, $3, $4, $5::timestamptz, $6, $7
       WHERE $2::int IS NULL OR $5::timestamptz IS NULL OR NOT EXISTS (
         SELECT 1 FROM clinic_appointments
          WHERE company_id = $1 AND doctor_id = $2
            AND status <> 'cancelled'
            AND slot_at IS NOT NULL
            AND abs(extract(epoch from (slot_at - $5::timestamptz))) < $8 * 60
       )
      RETURNING id`,
    values: [companyId, doctorId, name, phone, slotAt, reason, status || 'pending', window],
  };
}

/**
 * Book a slot, atomically.
 *
 * `insertIfFree` puts the clash test inside the INSERT, which beats a SELECT
 * beforehand and is still not enough: under READ COMMITTED the `NOT EXISTS`
 * cannot see a row another transaction has inserted and not yet committed. Two
 * people tapping the same slot in the same second both find it free.
 *
 * Two things close it, and they close different halves:
 *
 *  · **An advisory lock on (company, doctor)** for the length of the
 *    transaction. Bookings for one doctor queue behind each other, so the
 *    ±window test — which no index can express, because the window is a
 *    per-clinic setting — actually sees the bookings ahead of it. Two doctors,
 *    or two clinics, never wait on each other.
 *
 *  · **A unique index on (company, doctor, slot_at)**, in the schema. It only
 *    catches exact collisions, which is precisely what a slot picker produces,
 *    and it holds even for a code path that forgets to take the lock. The lock
 *    makes the common case correct; the index makes the mistake survivable.
 *
 * Returns the new row, or null when the slot was taken.
 */
async function book(pool, opts) {
  const q = insertIfFree(opts);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (opts.doctorId) {
      // Two int4 keys: no hashing, no chance of two unrelated pairs colliding.
      await client.query('SELECT pg_advisory_xact_lock($1::int, $2::int)',
        [opts.companyId, opts.doctorId]);
    }
    const ins = await client.query(q.text, q.values);
    await client.query('COMMIT');
    return ins.rows[0] || null;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    // The index fired — somebody committed the same slot first. That is the
    // same answer as "taken", not an error to show a patient.
    if (e && e.code === '23505') return null;
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { SLOT_MINUTES, GRACE_MINUTES, slotProblem, insertIfFree, book };
