'use strict';
/**
 * Workshop wall-clock time is Cairo's — the server's is not.
 *
 * The host runs Node in UTC while the database session runs in Africa/Cairo.
 * A datetime-local value ("2026-10-05T22:00") parsed with `new Date()` became
 * 22:00 UTC = 01:00 Cairo the next day, so an evening appointment showed up on
 * tomorrow's list, "today" rolled over at 2–3am local, and the public booking
 * page offered "9:00" slots that were really noon. Every form time goes in
 * through cairoWallToDate() and every "today" comes from cairoToday().
 * Egypt has summer time again since 2023, so the offset is looked up per
 * instant (+2 / +3), never hard-coded.
 */
const TZ = 'Africa/Cairo';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Cairo wall-clock parts of an instant. */
function cairoParts(d) {
  const o = {};
  for (const p of partsFmt.formatToParts(d)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

/** Cairo's offset from UTC in ms at instant t (+2h winter, +3h summer). */
function cairoOffset(t) {
  const p = cairoParts(new Date(t));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(t / 1000) * 1000;
}

/** "YYYY-MM-DDTHH:mm" (or "YYYY-MM-DD HH:mm") read as Cairo wall time → Date. Invalid → null. */
function cairoWallToDate(value) {
  const m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  let t = wall - cairoOffset(wall);
  t = wall - cairoOffset(t);           // second pass settles the DST edge
  const d = new Date(t);
  return isNaN(d) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');

/** Today's date in Cairo, "YYYY-MM-DD". */
function cairoToday(now = new Date()) {
  const p = cairoParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** A Cairo calendar day shifted by n days, "YYYY-MM-DD" → "YYYY-MM-DD". */
function shiftDay(day, n) {
  const [y, mo, d] = String(day).split('-').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** An instant as a datetime-local value in Cairo time ("YYYY-MM-DDTHH:mm"). */
function cairoInputValue(v) {
  const d = v instanceof Date ? v : new Date(v);
  if (!v || isNaN(d)) return '';
  const p = cairoParts(d);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

module.exports = { TZ, cairoParts, cairoWallToDate, cairoToday, shiftDay, cairoInputValue };
