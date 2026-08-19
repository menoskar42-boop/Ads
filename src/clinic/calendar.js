'use strict';
/**
 * التقويم اليومي والأسبوعي.
 *
 * The clinic had a list of appointments and no way to see a day. Which means
 * nobody could answer the two questions a calendar exists for: is this doctor
 * free at five, and is anything booked for a time they do not work.
 *
 * ── Two things this refuses to lose ─────────────────────────────────────────
 *
 * **An appointment with no time.** People book by phone and say "any time
 * Tuesday". A calendar built by bucketing on `slot_at` drops those rows
 * silently — and the patient turns up to a clinic that has no record of them.
 * They get their own bucket per day, on the screen.
 *
 * **An appointment outside the doctor's hours.** Booked for 9pm when the
 * doctor leaves at 6 — the row exists and the calendar would draw it neatly in
 * a column nobody reads. It is marked, because the whole value of showing the
 * hours is noticing what falls outside them.
 *
 * Cairo, not the server's timezone, everywhere. A calendar that draws Tuesday's
 * 11pm appointment on Wednesday is worse than no calendar.
 */

const TZ = 'Africa/Cairo';
const DAY_MS = 24 * 60 * 60 * 1000;

/** The Cairo calendar date of an instant, as YYYY-MM-DD. */
function cairoDate(at) {
  const d = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(d.getTime())) return null;
  // en-CA formats as YYYY-MM-DD, which is the one thing it is good for.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Minutes since midnight, in Cairo. */
function cairoMinutes(at) {
  const d = at instanceof Date ? at : new Date(at);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  const [h, m] = parts.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Which weekday a Cairo date falls on, 0=Sun … 6=Sat (the schema's numbering). */
function cairoWeekday(ymd) {
  const d = new Date(String(ymd) + 'T12:00:00Z');   // midday, so no offset flips the day
  if (!Number.isFinite(d.getTime())) return null;
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** "HH:MM[:SS]" → minutes since midnight. */
function timeToMinutes(v) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ''));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi)) return null;
  return h * 60 + mi;
}

/** The days a view covers. A week starts Saturday, as it does in Egypt. */
function daysFor(anchor, view) {
  const start = String(anchor || cairoDate(new Date()));
  if (view !== 'week') return [start];
  const wd = cairoWeekday(start);            // 0=Sun … 6=Sat
  const back = wd === null ? 0 : (wd + 1) % 7;   // Saturday is the first day
  const base = new Date(start + 'T12:00:00Z').getTime() - back * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => cairoDate(new Date(base + i * DAY_MS)));
}

/**
 * The grid.
 *
 * @param {object} input
 *   days         array of YYYY-MM-DD
 *   doctors      [{id, name, room}]
 *   schedules    [{doctor_id, day_of_week, start_time, end_time, is_active}]
 *   appointments [{id, doctor_id, slot_at, patient_name, status, …}]
 */
function layout(input) {
  const { days = [], doctors = [], schedules = [], appointments = [] } = input || {};
  const byDay = new Map(days.map((d) => [d, { date: d, weekday: cairoWeekday(d), doctors: [], unscheduled: [] }]));

  // Hours per (doctor, weekday), only the active rows.
  const hours = new Map();
  for (const sc of schedules) {
    if (sc.is_active === false) continue;
    const key = sc.doctor_id + ':' + sc.day_of_week;
    const from = timeToMinutes(sc.start_time), to = timeToMinutes(sc.end_time);
    if (from === null || to === null) continue;
    if (!hours.has(key)) hours.set(key, []);
    hours.get(key).push({ from, to, start_time: sc.start_time, end_time: sc.end_time });
  }

  for (const d of byDay.values()) {
    for (const doc of doctors) {
      const open = (hours.get(doc.id + ':' + d.weekday) || []).slice().sort((a, b) => a.from - b.from);
      d.doctors.push({ id: doc.id, name: doc.name, room: doc.room || null, open, appts: [] });
    }
    d.doctors.push({ id: null, name: null, room: null, open: [], appts: [] });   // unassigned
  }

  for (const a of appointments) {
    // No time at all: booked "some time Tuesday". Kept, in its own bucket.
    if (!a.slot_at) {
      const d = byDay.get(a.day_hint || days[0]);
      if (d) d.unscheduled.push(a);
      continue;
    }
    const ymd = cairoDate(a.slot_at);
    const d = byDay.get(ymd);
    if (!d) continue;                       // outside the range being drawn
    const col = d.doctors.find((c) => (c.id === null && !a.doctor_id) || Number(c.id) === Number(a.doctor_id))
      || d.doctors[d.doctors.length - 1];
    const mins = cairoMinutes(a.slot_at);
    // Outside the hours the doctor works: drawn, and marked. The point of
    // showing hours is seeing what falls outside them.
    const inside = col.open.some((w) => mins !== null && mins >= w.from && mins < w.to);
    col.appts.push(Object.assign({}, a, { minutes: mins, outside: col.open.length > 0 && !inside }));
  }

  for (const d of byDay.values()) {
    for (const c of d.doctors) c.appts.sort((x, y) => (x.minutes || 0) - (y.minutes || 0));
  }
  return [...byDay.values()];
}

/** Anything on this day at all? Used to say "nothing booked" honestly. */
function isEmptyDay(day) {
  if (!day) return true;
  if ((day.unscheduled || []).length) return false;
  return (day.doctors || []).every((c) => !(c.appts || []).length);
}

module.exports = { TZ, cairoDate, cairoMinutes, cairoWeekday, timeToMinutes, daysFor, layout, isEmptyDay };
