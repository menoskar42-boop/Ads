// Official public holidays for the payday shift. Two layers:
//  FIXED[country]  — Gregorian fixed national holidays (accurate, never change).
//  ISLAMIC[year]   — movable Islamic holidays (Eid al-Fitr/Adha, Hijri New Year,
//                    Mawlid). Lunar → dates shift ~11 days earlier each year and
//                    vary ±1–2 days by country's moon sighting, so these are a
//                    REGION-WIDE APPROXIMATION and should be refreshed yearly.
// Users can also add their own days in kkb_holidays (handled by the caller).

const FIXED = {
  EG: ['01-07', '01-25', '04-25', '05-01', '06-30', '07-23', '10-06'],
  SA: ['02-22', '09-23'],
  AE: ['01-01', '12-01', '12-02', '12-03'],
  KW: ['01-01', '02-25', '02-26'],
  QA: ['12-18'],
  BH: ['01-01', '12-16', '12-17'],
  OM: ['01-01', '07-23', '11-18', '11-19'],
  JO: ['01-01', '05-25'],
  IQ: ['01-01', '07-14', '10-03'],
  LB: ['01-01', '05-01', '11-22'],
  PS: ['01-01'],
  SY: ['01-01', '04-17', '05-01'],
  YE: ['05-22', '09-26'],
  MA: ['01-01', '01-11', '05-01', '07-30', '08-14', '08-20', '08-21', '11-06', '11-18'],
  DZ: ['01-01', '05-01', '07-05', '11-01'],
  TN: ['01-01', '03-20', '05-01', '07-25', '08-13', '10-15'],
  LY: ['02-17', '12-24'],
  SD: ['01-01', '12-19'],
};

// Region-wide approximate Islamic holiday dates (apply to all Arab countries).
const ISLAMIC = {
  2025: ['03-30', '03-31', '04-01', '06-06', '06-07', '06-08', '06-09', '06-26', '09-04'],
  2026: ['03-20', '03-21', '03-22', '05-27', '05-28', '05-29', '05-30', '06-16', '08-25'],
  2027: ['03-10', '03-11', '03-12', '05-17', '05-18', '05-19', '05-20', '06-06', '08-15'],
  2028: ['02-27', '02-28', '02-29', '05-05', '05-06', '05-07', '05-08', '05-25', '08-03'],
};

function pad(n) { return (n < 10 ? '0' : '') + n; }

// date: a JS Date (local). country: 'EG'/'SA'/… Returns true if it's an official
// holiday (national fixed OR Islamic approx). Weekends are handled separately.
function isHoliday(date, country) {
  const mmdd = pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  const list = FIXED[country] || FIXED.EG;
  if (list.indexOf(mmdd) !== -1) return true;
  const isl = ISLAMIC[date.getFullYear()];
  if (isl && isl.indexOf(mmdd) !== -1) return true;
  return false;
}

const COUNTRIES = Object.keys(FIXED);

// Built-in holiday dates for a country + year (national fixed + Islamic approx),
// as sorted 'YYYY-MM-DD' strings — for showing the user what's already covered.
function listBuiltin(country, year) {
  const out = [];
  (FIXED[country] || FIXED.EG).forEach((mmdd) => out.push(year + '-' + mmdd));
  (ISLAMIC[year] || []).forEach((mmdd) => out.push(year + '-' + mmdd));
  return out.sort();
}

module.exports = { FIXED, ISLAMIC, isHoliday, COUNTRIES, listBuiltin };
