'use strict';
/**
 * الحجز: إلغاء ونقل وقائمة انتظار.
 *
 * Booking worked. Everything after it did not.
 *
 * A member could take a place in a class and had no way to give it back — so a
 * class that filled up stayed full of people who were not coming, while the
 * waiting list sat there. And the waiting list only existed at booking time: it
 * put you on it when the class was full, and nothing ever took you off it. A
 * seat freed at 6pm was a seat nobody got.
 *
 * ── The rule that makes a waiting list real ─────────────────────────────────
 *
 * A cancelled place is IMMEDIATELY offered to the first person waiting, in the
 * same transaction that cancels it. Not by a nightly job, not by the trainer
 * noticing: a class is at 6pm and a nightly job promotes somebody at midnight.
 *
 * And exactly one person is promoted, chosen by who has waited longest — the
 * order the list was formed in is the only fair one, and it is also the only
 * one that cannot be argued with at the door.
 */

/** Statuses a booking can hold. */
const STATUSES = ['booked', 'waitlist', 'cancelled'];

/** A place that is still being held. */
function isHeld(booking) {
  const s = String((booking && booking.status) || '');
  return s === 'booked' || s === 'waitlist';
}

/**
 * May this booking be cancelled or moved?
 *
 * The past cannot be cancelled — a member who did not come to yesterday's class
 * is a no-show, and letting them cancel it afterwards rewrites the attendance
 * the gym runs on.
 */
function canCancel(booking, today) {
  if (!booking) return { ok: false, why: 'missing' };
  if (!isHeld(booking)) return { ok: false, why: 'already' };
  const day = String(booking.booking_date || '').slice(0, 10);
  const now = String(today || '').slice(0, 10);
  if (day && now && day < now) return { ok: false, why: 'past' };
  return { ok: true, why: 'ok' };
}

/**
 * Who gets a freed place: the person who has waited longest.
 * Returns null when nobody is waiting — and null is not an error.
 */
function nextInLine(waiting) {
  const list = (Array.isArray(waiting) ? waiting : [])
    .filter((b) => String(b.status) === 'waitlist')
    .slice()
    .sort((a, b) => {
      const at = new Date(a.created_at || 0).getTime();
      const bt = new Date(b.created_at || 0).getTime();
      if (at !== bt) return at - bt;
      return (a.id || 0) - (b.id || 0);
    });
  return list[0] || null;
}

/**
 * Where a booking stands in the queue, 1-based. Null when it is not waiting.
 * A member who can see "3rd in line" stops phoning the gym to ask.
 */
function placeInLine(booking, waiting) {
  if (!booking || String(booking.status) !== 'waitlist') return null;
  const list = (Array.isArray(waiting) ? waiting : [])
    .filter((b) => String(b.status) === 'waitlist')
    .slice()
    .sort((a, b) => {
      const at = new Date(a.created_at || 0).getTime();
      const bt = new Date(b.created_at || 0).getTime();
      if (at !== bt) return at - bt;
      return (a.id || 0) - (b.id || 0);
    });
  const i = list.findIndex((b) => Number(b.id) === Number(booking.id));
  return i < 0 ? null : i + 1;
}

/**
 * Moving a booking to another day of the same class.
 *
 * The new date has to be a day this class actually runs — a transfer to a
 * Tuesday for a Saturday class produces a booking nobody will ever be at.
 */
function canMove(booking, gymClass, newDate, today) {
  const base = canCancel(booking, today);
  if (!base.ok) return base;
  const d = String(newDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, why: 'date' };
  if (String(today || '').slice(0, 10) > d) return { ok: false, why: 'past' };
  if (d === String(booking.booking_date || '').slice(0, 10)) return { ok: false, why: 'same' };
  if (gymClass && gymClass.day_of_week !== null && gymClass.day_of_week !== undefined) {
    // 0=Sun … 6=Sat, matching the class table.
    const dow = new Date(d + 'T12:00:00Z').getUTCDay();
    if (Number(gymClass.day_of_week) !== dow) return { ok: false, why: 'wrong_day' };
  }
  return { ok: true, why: 'ok' };
}

module.exports = { STATUSES, isHeld, canCancel, nextInLine, placeInLine, canMove };
