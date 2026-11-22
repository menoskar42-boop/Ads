// Flexible payday calculation — works for any pay system, not just a fixed day.
// salaryType: 'fixed' (use salaryDay) | 'last' (last day of month) |
//   'before_last' | 'irregular' (no payday at all — budget by calendar month).
// weekend: which days are non-working, so payday shifts EARLIER off them
//   'fri_sat' (EG/Gulf) | 'fri' | 'sat_sun' (western) | 'sun' | 'none'.
// (Public-holiday shifting can layer on top later; weekends cover the common case.)

const { isHoliday } = require('./holidays');

const WEEKEND_DAYS = {
  fri_sat: [5, 6], // Fri, Sat  (JS getDay: Sun=0 … Sat=6)
  fri: [5],
  sat_sun: [6, 0],
  sun: [0],
  none: [],
};

function lastDayOfMonth(year, month0) {
  return new Date(year, month0 + 1, 0).getDate();
}
function fmt(d) { const p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

// Returns the actual payday Date for the given calendar month (year, month0=0-11).
// `customSet` is an optional Set of 'YYYY-MM-DD' user-added holidays.
function paydayFor(profile, year, month0, customSet) {
  const type = (profile && profile.salary_type) || 'fixed';
  // Irregular income — freelance, commission, cash work, anything that arrives
  // when it arrives. There is no payday to compute, so the period people
  // actually budget against is the calendar month, and the boundary is the 1st.
  //
  // It returns EARLY, before the weekend/holiday shift: that shift exists
  // because an employer pays on the last working day before a holiday. The 1st
  // of the month is a date on a calendar, not a day anybody gets paid, so
  // sliding it back onto the previous month would only make the period wrong.
  if (type === 'irregular') return new Date(year, month0, 1);

  const last = lastDayOfMonth(year, month0);
  let day;
  if (type === 'last') day = last;
  else if (type === 'before_last') day = Math.max(1, last - 1);
  else day = Math.min(last, Math.max(1, parseInt(profile && profile.salary_day, 10) || 1));

  const weekendSet = WEEKEND_DAYS[(profile && profile.weekend) || 'fri_sat'] || WEEKEND_DAYS.fri_sat;
  const country = (profile && profile.country) || 'EG';
  const isOff = (d) => weekendSet.includes(d.getDay()) || isHoliday(d, country) || (customSet && customSet.has(fmt(d)));

  let d = new Date(year, month0, day);
  // Shift earlier while it lands on a weekend or official/custom holiday
  // (salary is paid on the last working day before it).
  let guard = 0;
  while (isOff(d) && guard < 20) { d.setDate(d.getDate() - 1); guard++; }
  return d;
}

// A month's payday can land in the PREVIOUS calendar month: the shift above
// walks backwards off weekends and holidays, so "the 1st of August 2026" (a
// Saturday, after a Friday) is paid on Thursday 30 July. Both helpers below
// therefore have to look at a window of months rather than assume month N's
// payday falls inside month N — the old versions checked exactly one fallback
// month and returned it unconditionally.
//
// The bug that showed: paid on the 1st, on 11 August 2026. nextPayday started
// from 31 July, found July's payday (1 July) in the past, and returned "next
// month's" — which was 30 July, still in the past. The dashboard got a period
// that had already ended: daysLeft 0, so spendableDays fell to 1 and the whole
// month's remaining money was offered as today's allowance.
const WINDOW = [-1, 0, 1, 2];

// The NEXT payday on/after `from` (defaults to today).
function nextPayday(profile, from, customSet) {
  const base = from ? new Date(from) : new Date();
  base.setHours(0, 0, 0, 0);
  let best = null;
  for (const off of WINDOW) {
    const d = paydayFor(profile, base.getFullYear(), base.getMonth() + off, customSet);
    if (d >= base && (best === null || d < best)) best = d;   // the earliest one that is not past
  }
  return best || paydayFor(profile, base.getFullYear(), base.getMonth() + 1, customSet);
}

// The payday that STARTED the current pay period (most recent payday on/before today).
function currentPeriodStart(profile, from, customSet) {
  const base = from ? new Date(from) : new Date();
  base.setHours(0, 0, 0, 0);
  let best = null;
  for (const off of WINDOW) {
    const d = paydayFor(profile, base.getFullYear(), base.getMonth() + off, customSet);
    if (d <= base && (best === null || d > best)) best = d;   // the latest one that has happened
  }
  return best || paydayFor(profile, base.getFullYear(), base.getMonth() - 1, customSet);
}

module.exports = { paydayFor, nextPayday, currentPeriodStart, lastDayOfMonth, WEEKEND_DAYS };
