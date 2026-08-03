// Clinical trends.
//
// The system records HbA1c, ejection fraction, PHQ-9, range of motion, weight,
// blood pressure… but only as a list of past visits. A single reading answers
// almost nothing; the clinical question is always "compared to last time".
//
// Rather than build a chart per specialty, this turns ANY numeric field —
// vitals column or specialty_data key — into a series. One feature serves
// endocrinology, cardiology, psychiatry, orthopaedics, nutrition and paediatrics.
//
// Reference bands come from ordinary clinical practice and are used only to
// colour the chart; nothing here diagnoses, and a value outside a band is a
// prompt to look, not a verdict.
'use strict';

const { VITALS_LABELS, extraFor } = require('./specialties');

// Direction that counts as improvement, plus a normal band where one is
// meaningful. `good: 'low'` means smaller is better.
const REFERENCE = {
  systolic:    { good: 'low',  band: [90, 130],  unit: 'mmHg' },
  diastolic:   { good: 'low',  band: [60, 85],   unit: 'mmHg' },
  heart_rate:  { good: null,   band: [60, 100],  unit: 'نبضة/د' },
  temperature: { good: null,   band: [36.1, 37.5], unit: '°م' },
  spo2:        { good: 'high', band: [95, 100],  unit: '%' },
  weight:      { good: null,   band: null,       unit: 'كجم' },
  height:      { good: 'high', band: null,       unit: 'سم' },
  hba1c:       { good: 'low',  band: [4, 5.7],   unit: '%' },
  blood_sugar: { good: 'low',  band: [70, 140],  unit: 'mg/dL' },
  ef:          { good: 'high', band: [55, 70],   unit: '%' },
  phq9:        { good: 'low',  band: [0, 4],     unit: 'درجة' },
  gad7:        { good: 'low',  band: [0, 4],     unit: 'درجة' },
  pain_scale:  { good: 'low',  band: [0, 3],     unit: '/10' },
  rom:         { good: 'high', band: null,       unit: '°' },
  body_fat:    { good: 'low',  band: null,       unit: '%' },
  waist:       { good: 'low',  band: null,       unit: 'سم' },
  peak_flow:   { good: 'high', band: null,       unit: 'L/min' },
  iop:         { good: 'low',  band: [10, 21],   unit: 'mmHg' },
  psa:         { good: 'low',  band: [0, 4],     unit: 'ng/mL' },
  gcs:         { good: 'high', band: [15, 15],   unit: '/15' },
  head_circumference: { good: null, band: null,  unit: 'سم' },
  fundal_height:      { good: null, band: null,  unit: 'سم' },
};

/**
 * Build one series per measurable field that actually has data.
 * @param {Array} vitals  rows from clinic_vitals (newest first is fine)
 * @param {Array} visits  rows from clinic_visits carrying specialty_data
 * @param {string} specialtyKey
 * @returns {Array<{key,label,unit,points:Array<{t,v}>,band,good,latest,delta}>}
 */
function buildSeries(vitals, visits, specialtyKey) {
  const buckets = new Map();

  const push = (key, label, when, value) => {
    const v = Number(value);
    if (!Number.isFinite(v) || !when) return;
    if (!buckets.has(key)) buckets.set(key, { key, label, points: [] });
    buckets.get(key).points.push({ t: new Date(when).getTime(), v });
  };

  for (const row of vitals || []) {
    for (const col of Object.keys(VITALS_LABELS)) {
      if (row[col] != null) push(col, VITALS_LABELS[col], row.recorded_at, row[col]);
    }
  }

  // Specialty fields are stored as strings; only the ones that parse as numbers
  // can be trended — a free-text "المنطقة المصابة" has no series.
  const extraLabels = new Map(extraFor(specialtyKey).map((f) => [f.key, f.label]));
  for (const v of visits || []) {
    const data = v.specialty_data && typeof v.specialty_data === 'object' ? v.specialty_data : null;
    if (!data) continue;
    for (const k of Object.keys(data)) {
      if (!extraLabels.has(k)) continue;
      push(k, extraLabels.get(k), v.visit_date || v.created_at, data[k]);
    }
  }

  const out = [];
  for (const s of buckets.values()) {
    if (s.points.length < 1) continue;
    s.points.sort((a, b) => a.t - b.t);          // oldest → newest, as a chart reads
    const ref = REFERENCE[s.key] || {};
    const latest = s.points[s.points.length - 1];
    const prev = s.points.length > 1 ? s.points[s.points.length - 2] : null;
    out.push({
      key: s.key,
      label: s.label,
      unit: ref.unit || '',
      band: ref.band || null,
      good: ref.good || null,
      points: s.points,
      latest: latest.v,
      delta: prev ? Math.round((latest.v - prev.v) * 100) / 100 : null,
    });
  }
  // Fields with real history first — a two-point series is far more useful than
  // a single reading with nothing to compare against.
  out.sort((a, b) => b.points.length - a.points.length);
  return out;
}

// Did the latest move help or hurt? Returns 'better' | 'worse' | 'flat' | null.
// null when the field has no meaningful direction (weight, temperature…).
function verdict(series) {
  if (!series.good || series.delta == null || series.delta === 0) {
    return series.delta == null ? null : 'flat';
  }
  const rising = series.delta > 0;
  return (series.good === 'high') === rising ? 'better' : 'worse';
}

module.exports = { buildSeries, verdict, REFERENCE };
