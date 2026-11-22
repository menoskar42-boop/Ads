'use strict';

const AR_DAYS = { الأحد: 0, الاتنين: 1, الاثنين: 1, الثلاثاء: 2, الأربعاء: 3, الاربعاء: 3, الخميس: 4, الجمعة: 5, السبت: 6 };
function digits(s) { return String(s || '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)); }
function localParts(date, timezone) {
  if (!timezone) return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() };
  const p = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, hour: p.hour === 24 ? 0 : p.hour, minute: p.minute };
}
function inTimezone(parts, timezone) {
  if (!timezone) return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  const shown = localParts(guess, timezone);
  const asUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
  return new Date(guess.getTime() + (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - asUtc));
}
function parseNatural(text, now = new Date(), timezone) {
  const t = digits(text).toLowerCase();
  const tm = t.match(/(?:الساعة|ساعة|at|@)?\s*(\d{1,2})(?:[:٫.](\d{2}))?\s*(صباحا|مساء|am|pm)?/i);
  if (!tm) return { error: 'time_required' };
  let hour = Number(tm[1]), minute = Number(tm[2] || 0);
  const suffix = tm[3] || '';
  if (/مساء|pm/i.test(suffix) && hour < 12) hour += 12;
  if (/صباحا|am/i.test(suffix) && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return { error: 'bad_time' };
  const n = localParts(now, timezone);
  const d = { year: n.year, month: n.month, day: n.day, hour, minute };
  const base = new Date(Date.UTC(d.year, d.month - 1, d.day));
  if (/بعد بكرة|بعد غد|day after tomorrow/i.test(t)) base.setUTCDate(base.getUTCDate() + 2);
  else if (/بكرة|غدا|غدًا|tomorrow/i.test(t)) base.setUTCDate(base.getUTCDate() + 1);
  else {
    const day = Object.keys(AR_DAYS).find(k => t.includes(k));
    if (day) { let add = (AR_DAYS[day] - base.getUTCDay() + 7) % 7; if (!add) add = 7; base.setUTCDate(base.getUTCDate() + add); }
    else if (!/اليوم|today/i.test(t)) return { error: 'date_required' };
  }
  d.year = base.getUTCFullYear(); d.month = base.getUTCMonth() + 1; d.day = base.getUTCDate();
  const runAt = inTimezone(d, timezone);
  if (runAt <= now) return { error: 'past' };
  return { runAt, kind: 'once', timezone: timezone || null };
}
module.exports = { parseNatural };