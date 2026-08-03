// Child growth percentiles (WHO Child Growth Standards).
//
// A weight trending upward tells a parent nothing on its own. What matters is
// where the child sits against children of the same age and sex — a 12kg
// two-year-old is unremarkable, a 12kg four-year-old is not. This module turns
// a recorded measurement into that reading.
//
// IMPORTANT — coverage is deliberately partial. Only the tables actually loaded
// in growth_data.js are answered; everything else returns null and the UI says
// the table is not loaded. A growth curve drawn from invented numbers tells a
// parent their child is fine when they are not, and that is not the kind of
// mistake that gets corrected at the next visit. docs/GROWTH_TABLES_PROMPT.md
// is the brief for collecting the rest.
'use strict';

const { TABLES } = require('./growth_data');

// Measures we chart, and which WHO table each age reads against.
//
// Stature is one thing the clinic measures but TWO WHO standards: under two
// years the child is measured lying down (length-for-age), from two years
// standing (height-for-age), and the two differ by about 0.7cm. So a single
// recorded "height" is read against whichever table covers the child's age —
// merging them into one curve would misread every toddler by that offset.
const MEASURES = {
  weight: {
    unit: 'kg',
    tables: [{ table: 'wfa', from: 0, to: 60 }],
  },
  height: {
    unit: 'cm',
    tables: [{ table: 'lhfa', from: 0, to: 23 }, { table: 'hfa', from: 24, to: 60 }],
  },
  head_circumference: {
    unit: 'cm',
    tables: [{ table: 'hcfa', from: 0, to: 60 }],
  },
};

function windowFor(measure, ageMonths) {
  const cfg = MEASURES[measure];
  if (!cfg) return null;
  if (ageMonths == null) return cfg.tables[0];
  return cfg.tables.find((w) => ageMonths >= w.from && ageMonths <= w.to) || null;
}

/** Full age span this measure is defined over, across all its tables. */
function spanOf(measure) {
  const cfg = MEASURES[measure];
  return { from: cfg.tables[0].from, to: cfg.tables[cfg.tables.length - 1].to };
}

// Patient gender is stored in Arabic; WHO tables are keyed boys/girls.
const SEXES = { 'ذكر': 'boys', 'أنثى': 'girls', male: 'boys', female: 'girls', boys: 'boys', girls: 'girls' };

// The five curves drawn behind the child's points, and the z-score each sits at.
const CURVES = [
  { key: 'p3',  z: -1.88079, label: '3' },
  { key: 'p15', z: -1.03643, label: '15' },
  { key: 'p50', z: 0,        label: '50' },
  { key: 'p85', z: 1.03643,  label: '85' },
  { key: 'p97', z: 1.88079,  label: '97' },
];

function sexKey(gender) {
  return SEXES[String(gender || '').trim()] || null;
}

function tableFor(measure, gender, ageMonths) {
  const w = windowFor(measure, ageMonths);
  const sex = sexKey(gender);
  if (!w || !sex) return null;
  return TABLES[w.table + '_' + sex] || null;
}

/** Is there a loaded table that covers this measure, sex and age? */
function hasTable(measure, gender, ageMonths) {
  const rows = tableFor(measure, gender, ageMonths);
  if (!rows) return false;
  if (ageMonths == null) return true;
  return ageMonths >= rows[0][0] && ageMonths <= rows[rows.length - 1][0];
}

/** Which measures we can chart for this child right now. */
function availableMeasures(gender, ageMonths) {
  return Object.keys(MEASURES).filter((k) => hasTable(k, gender, ageMonths));
}

// ── The LMS maths ────────────────────────────────────────────────────────────
// WHO publishes L (skewness), M (median) and S (coefficient of variation) per
// month. Everything below is derived from those three numbers.

/** Value at a given z-score. */
function valueAtZ(L, M, S, z) {
  return Math.abs(L) > 1e-9 ? M * Math.pow(1 + L * S * z, 1 / L) : M * Math.exp(S * z);
}

/** z-score of a measured value — the inverse of valueAtZ. */
function zOfValue(L, M, S, x) {
  if (!(x > 0)) return null;
  return Math.abs(L) > 1e-9 ? (Math.pow(x / M, L) - 1) / (L * S) : Math.log(x / M) / S;
}

// Normal CDF via Abramowitz & Stegun 7.1.26; accurate to ~1e-7, far tighter
// than the one-decimal precision anyone reads off a growth chart.
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const a = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return 0.5 * (1 + sign * y);
}

function rowAt(rows, ageMonths) {
  // Exact month only. WHO tables are monthly and a child measured at 18.6
  // months is read against month 18 — interpolating between rows would be
  // inventing a standard that WHO did not publish.
  const m = Math.floor(Number(ageMonths));
  for (let i = 0; i < rows.length; i += 1) if (rows[i][0] === m) return rows[i];
  return null;
}

/**
 * Where one measurement sits.
 * @returns {{percentile:number, z:number, median:number, unit:string}|null}
 *          null when no loaded table covers it — the caller must say so rather
 *          than fall back to anything.
 */
function assess(measure, gender, ageMonths, value) {
  const rows = tableFor(measure, gender, ageMonths);
  if (!rows) return null;
  const row = rowAt(rows, ageMonths);
  if (!row) return null;
  const [, L, M, S] = row;
  const z = zOfValue(L, M, S, Number(value));
  if (z == null || !isFinite(z)) return null;
  return {
    percentile: normalCdf(z) * 100,
    z,
    median: M,
    unit: MEASURES[measure].unit,
  };
}

/**
 * The five reference curves, one point per month, for plotting.
 * Walks every table the measure uses, so a stature chart spanning the
 * length/height boundary draws from both — and simply stops where a table is
 * not loaded rather than bridging the gap with a straight line.
 */
function curves(measure, gender, fromMonth, toMonth) {
  const cfg = MEASURES[measure];
  const sex = sexKey(gender);
  if (!cfg || !sex) return null;
  const out = [];
  for (const w of cfg.tables) {
    const rows = TABLES[w.table + '_' + sex];
    if (!rows) continue;
    for (const [month, L, M, S] of rows) {
      if (month < w.from || month > w.to) continue;
      if (fromMonth != null && month < Math.floor(fromMonth)) continue;
      if (toMonth != null && month > Math.ceil(toMonth)) continue;
      const point = { month };
      for (const c of CURVES) point[c.key] = valueAtZ(L, M, S, c.z);
      out.push(point);
    }
  }
  out.sort((a, b) => a.month - b.month);
  return out.length ? out : null;
}

/** Whole months between two dates — the age WHO tables are read against. */
function ageMonthsAt(birthDate, when) {
  if (!birthDate) return null;
  const a = new Date(birthDate), b = new Date(when || Date.now());
  if (isNaN(a) || isNaN(b)) return null;
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return m < 0 ? null : m;
}

/**
 * Build everything a growth chart needs for one measure.
 *
 * `status` is the contract with the view:
 *   ok          — curves and at least one plotted point
 *   no_table    — this measure/sex combination is not loaded yet
 *   out_of_range— child is outside the age window the standard covers
 *   no_readings — table exists, child in range, nothing recorded yet
 */
function buildChart(measure, patient, readings) {
  const cfg = MEASURES[measure];
  if (!cfg) return null;
  const gender = patient && patient.gender;
  const birth = patient && patient.birth_date;
  const span = spanOf(measure);
  const base = { measure, unit: cfg.unit, from: span.from, to: span.to };
  if (!birth || !sexKey(gender)) return Object.assign(base, { status: 'no_table' });

  const nowAge = ageMonthsAt(birth, new Date());
  if (nowAge != null && nowAge > span.to) return Object.assign(base, { status: 'out_of_range' });

  // Every reading the child has, aged and scored. A reading whose table is not
  // loaded is counted separately rather than dropped, so the page can say the
  // gap is missing data and not a missing measurement.
  const points = [];
  let unscored = 0;
  for (const r of readings || []) {
    const raw = r[measure];
    if (raw == null || raw === '' || !isFinite(Number(raw))) continue;
    const age = ageMonthsAt(birth, r.recorded_at);
    if (age == null || age > span.to) continue;
    const a = assess(measure, gender, age, raw);
    if (!a) { unscored += 1; continue; }
    points.push({ month: age, value: Number(raw), percentile: a.percentile, z: a.z, at: r.recorded_at });
  }
  points.sort((x, y) => x.month - y.month);

  if (!points.length) {
    // No table at all for this sex, versus a table that exists but the child
    // has nothing recorded yet — the clinic can act on the second, not the first.
    const anyTable = cfg.tables.some((w) => TABLES[w.table + '_' + sexKey(gender)]);
    return Object.assign(base, { status: anyTable ? (unscored ? 'no_table' : 'no_readings') : 'no_table' });
  }

  const drawn = curves(measure, gender,
    Math.min(points[0].month, span.from),
    Math.max(points[points.length - 1].month, Math.min(span.to, (nowAge || 0) + 2)));
  if (!drawn) return Object.assign(base, { status: 'no_table' });

  return Object.assign(base, {
    status: 'ok', curves: drawn, points, unscored,
    latest: points[points.length - 1],
  });
}

module.exports = {
  MEASURES, CURVES,
  sexKey, hasTable, availableMeasures, spanOf,
  assess, curves, ageMonthsAt, buildChart,
  valueAtZ, zOfValue, normalCdf,
};
