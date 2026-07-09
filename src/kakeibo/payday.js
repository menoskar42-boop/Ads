// Flexible payday calculation — works for any pay system, not just a fixed day.
// salaryType: 'fixed' (use salaryDay) | 'last' (last day of month) | 'before_last'.
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

// The NEXT payday on/after `from` (defaults to today). Looks at this month then next.
function nextPayday(profile, from, customSet) {
  const base = from ? new Date(from) : new Date();
  base.setHours(0, 0, 0, 0);
  const thisMonth = paydayFor(profile, base.getFullYear(), base.getMonth(), customSet);
  if (thisMonth >= base) return thisMonth;
  return paydayFor(profile, base.getFullYear(), base.getMonth() + 1, customSet);
}

// The payday that STARTED the current pay period (most recent payday on/before today).
function currentPeriodStart(profile, from, customSet) {
  const base = from ? new Date(from) : new Date();
  base.setHours(0, 0, 0, 0);
  const thisMonth = paydayFor(profile, base.getFullYear(), base.getMonth(), customSet);
  if (thisMonth <= base) return thisMonth;
  return paydayFor(profile, base.getFullYear(), base.getMonth() - 1, customSet);
}

module.exports = { paydayFor, nextPayday, currentPeriodStart, lastDayOfMonth, WEEKEND_DAYS };
