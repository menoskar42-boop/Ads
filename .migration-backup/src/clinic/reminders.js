// Appointment reminders over WhatsApp.
//
// The clinic already stores its own credentials and a reminder_template, but
// until now nothing ever sent them — the template was saved and never read.
// This is the job that closes that gap: the evening before an appointment,
// every patient booked for tomorrow gets one message from the clinic's own
// number.
//
// Safety properties that matter here, because these are real messages to real
// patients and a duplicate is worse than a miss:
//   - A successful send is written to clinic_whatsapp_log with a unique index
//     on (appointment_id, kind) WHERE ok. A second attempt hits that index and
//     is skipped, so the job can run as often as we like.
//   - Only clinics that switched sending on (active) AND have the whatsapp
//     module enabled are touched.
//   - One clinic's failure never stops the others.
'use strict';

const { sendWhatsApp, renderTemplate } = require('../lib/whatsapp');

const DEFAULT_REMINDER_TPL =
  'تذكير: لديك موعد في {clinic}{doctor} يوم {time}. برجاء الحضور قبل الموعد بـ10 دقائق.';

// Reminders go out in the evening — early enough that the patient can still
// rearrange their next day, late enough that it is not forgotten by morning.
const SEND_HOUR_CAIRO = 18;

function cairoHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo', hour: 'numeric', hour12: false,
  }).format(now));
}

// Formats a slot the way a patient reads it: "الأربعاء 6 أغسطس، 5:30 م".
function formatSlot(slotAt) {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit',
    }).format(new Date(slotAt));
  } catch (_) {
    return '';
  }
}

/**
 * Send reminders for appointments happening tomorrow (Cairo).
 * @param {import('pg').Pool} pool
 * @param {{force?: boolean}} [opts] force skips the hour check (used by the
 *        clinic's "send now" button and by tests).
 * @returns {Promise<{clinics:number, sent:number, failed:number, skipped:number}>}
 */
async function sendDueReminders(pool, opts = {}) {
  const stats = { clinics: 0, sent: 0, failed: 0, skipped: 0 };
  if (!opts.force && cairoHour() !== SEND_HOUR_CAIRO) return stats;

  let clinics;
  try {
    clinics = await pool.query(
      `SELECT w.*, c.company_name
         FROM clinic_whatsapp w
         JOIN companies c ON c.id = w.company_id
         JOIN clinic_modules m
           ON m.company_id = w.company_id AND m.module_key = 'whatsapp' AND m.enabled
        WHERE w.active = true`
    );
  } catch (e) {
    console.error('[reminders] cannot list clinics:', e.message);
    return stats;
  }

  for (const w of clinics.rows) {
    stats.clinics += 1;
    let appts;
    try {
      // "Tomorrow" is resolved in Cairo, not UTC — a 9pm appointment must not
      // drift into the wrong day for a clinic operating on local time.
      appts = await pool.query(
        `SELECT a.id, a.patient_name, a.patient_phone, a.slot_at, d.name AS doctor_name
           FROM clinic_appointments a
           LEFT JOIN clinic_doctors d ON d.id = a.doctor_id
          WHERE a.company_id = $1
            AND a.status IN ('pending','confirmed')
            AND a.slot_at IS NOT NULL
            AND (a.slot_at AT TIME ZONE 'Africa/Cairo')::date
                = ((now() AT TIME ZONE 'Africa/Cairo')::date + 1)
            AND NOT EXISTS (
              SELECT 1 FROM clinic_whatsapp_log l
               WHERE l.appointment_id = a.id AND l.kind = 'reminder' AND l.ok
            )`,
        [w.company_id]
      );
    } catch (e) {
      console.error('[reminders] query failed for company', w.company_id, e.message);
      continue;
    }

    for (const a of appts.rows) {
      if (!a.patient_phone) { stats.skipped += 1; continue; }
      const msg = renderTemplate(w.reminder_template || DEFAULT_REMINDER_TPL, {
        name: a.patient_name || '',
        clinic: w.company_name || '',
        doctor: a.doctor_name ? ' مع ' + a.doctor_name : '',
        time: formatSlot(a.slot_at),
      });
      const r = await sendWhatsApp(w, a.patient_phone, msg);
      if (r.ok) stats.sent += 1; else stats.failed += 1;
      try {
        await pool.query(
          `INSERT INTO clinic_whatsapp_log (company_id, appointment_id, kind, phone, ok, error)
           VALUES ($1,$2,'reminder',$3,$4,$5)`,
          [w.company_id, a.id, a.patient_phone, r.ok, r.ok ? null : String(r.error || '').slice(0, 300)]
        );
      } catch (e) {
        // A duplicate-key here means another run already logged success for
        // this appointment — exactly what the index is for, so stay quiet.
        if (e.code !== '23505') console.error('[reminders] log failed:', e.message);
      }
    }
  }

  if (stats.sent || stats.failed) {
    console.log(`[reminders] clinics=${stats.clinics} sent=${stats.sent} failed=${stats.failed} skipped=${stats.skipped}`);
  }
  return stats;
}

module.exports = { sendDueReminders, formatSlot, DEFAULT_REMINDER_TPL, SEND_HOUR_CAIRO };
