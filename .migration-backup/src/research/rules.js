// Research Data Auditor — the rule engine.
//
// Every medical range, formula and unit lives here as DATA, not code, so an
// administrator can add or override a rule without touching a validator. The
// defaults below are conservative "physically/clinically plausible" bounds for
// a prostate-MRI research context — NOT diagnostic thresholds. Their only job is
// to catch a data-entry error (a typo, a wrong unit, a slipped decimal), so the
// bounds are wide on purpose: flagging a real-but-extreme value as a possible
// error and asking a human to look is the whole point, and a bound that is too
// tight would cry wolf.
//
// Matching is by NORMALISED column name (lowercased, punctuation stripped) plus
// a list of aliases, because the same field is spelled ten ways across sheets
// ("PSA", "psa_total", "Total PSA", "psa (ng/ml)").
'use strict';

/** Normalise a header for matching: lowercase, drop non-alphanumerics. */
function norm(s) {
  return String(s || '').toLowerCase().replace(/[ً-ْ]/g, '').replace(/[^a-z0-9ء-ي]/g, '');
}

// key      — canonical field id
// aliases  — header spellings that map to it (matched by normalised form)
// min/max  — plausible bounds; a value outside is flagged (not deleted)
// unit     — the unit the range assumes (shown in the report)
// decimals — expected number of decimal places (precision review); null = any
// integer — true if the field must be a whole number
const DEFAULT_FIELD_RULES = [
  { key: 'age', label: 'العمر', aliases: ['age', 'العمر', 'السن', 'ageyears'], min: 0, max: 120, unit: 'years', integer: true },
  { key: 'bmi', label: 'مؤشر كتلة الجسم', aliases: ['bmi', 'مؤشركتلةالجسم'], min: 10, max: 70, unit: 'kg/m²', decimals: 1 },
  { key: 'psa', label: 'PSA', aliases: ['psa', 'totalpsa', 'psatotal', 'psang', 'tpsa'], min: 0, max: 5000, unit: 'ng/mL', decimals: 2 },
  { key: 'free_psa', label: 'Free PSA', aliases: ['freepsa', 'fpsa', 'psafree'], min: 0, max: 500, unit: 'ng/mL', decimals: 2 },
  { key: 'psa_ratio', label: 'نسبة PSA الحرة', aliases: ['psaratio', 'fpsaratio', 'freetototal', 'ftratio', 'freepsaratio'], min: 0, max: 1, unit: 'ratio', decimals: 2 },
  { key: 'psad', label: 'PSAD', aliases: ['psad', 'psadensity', 'psadensityngml2'], min: 0, max: 10, unit: 'ng/mL²', decimals: 2 },
  { key: 'prostate_volume', label: 'حجم البروستاتا', aliases: ['prostatevolume', 'volume', 'pv', 'prostatevol', 'glandvolume'], min: 5, max: 500, unit: 'cc', decimals: 1 },
  { key: 'pirads', label: 'PI-RADS', aliases: ['pirads', 'piradsv2', 'piradsscore', 'piradsv21'], min: 1, max: 5, unit: 'score', integer: true, allowed: [1, 2, 3, 4, 5] },
  { key: 'grade_group', label: 'Grade Group', aliases: ['gradegroup', 'isupgradegroup', 'isup', 'gg'], min: 1, max: 5, unit: 'group', integer: true, allowed: [1, 2, 3, 4, 5] },
  { key: 'gleason', label: 'Gleason', aliases: ['gleason', 'gleasonscore', 'gs', 'gleasonsum'], min: 6, max: 10, unit: 'score', integer: true, allowed: [6, 7, 8, 9, 10] },
  { key: 'adc', label: 'ADC', aliases: ['adc', 'adcvalue', 'adcmean', 'adc10-3'], min: 0, max: 3000, unit: '×10⁻⁶ mm²/s', decimals: 0 },
  { key: 'ff', label: 'Fat Fraction', aliases: ['ff', 'fatfraction', 'pdff'], min: 0, max: 100, unit: '%', decimals: 1 },
  { key: 'lesion_ff', label: 'Lesion FF', aliases: ['lesionff', 'lesionfatfraction', 'lesionpdff'], min: 0, max: 100, unit: '%', decimals: 1 },
  { key: 'roi', label: 'ROI', aliases: ['roi', 'roisize', 'roiarea', 'roimm2'], min: 0, max: 10000, unit: 'mm²', decimals: 1 },
  { key: 'scfat', label: 'سمك الدهون تحت الجلد', aliases: ['subcutaneousfatthickness', 'scfat', 'subcutaneousfat', 'scft', 'fatthickness'], min: 0, max: 100, unit: 'mm', decimals: 1 },
  { key: 'lesion_size', label: 'حجم الآفة', aliases: ['lesionsize', 'lesiondiameter', 'lesion', 'tumorsize'], min: 0, max: 200, unit: 'mm', decimals: 1 },
];

// Calculated columns and the formula they must satisfy. `compute` takes a getter
// that resolves a field key to a row's numeric value (or null), returns the
// expected number or null when inputs are missing. `tolerance` is the allowed
// absolute-relative drift before a mismatch is reported.
const DEFAULT_FORMULAS = [
  {
    key: 'psad', label: 'PSAD = PSA ÷ حجم البروستاتا',
    target: 'psad', tolerance: 0.05,
    inputs: ['psa', 'prostate_volume'],
    compute: (g) => { const psa = g('psa'); const v = g('prostate_volume'); return (psa != null && v) ? psa / v : null; },
  },
  {
    key: 'psa_ratio', label: 'نسبة PSA = Free PSA ÷ Total PSA',
    target: 'psa_ratio', tolerance: 0.05,
    inputs: ['free_psa', 'psa'],
    compute: (g) => { const f = g('free_psa'); const t = g('psa'); return (f != null && t) ? f / t : null; },
  },
];

// Cross-field consistency rules. Each returns null (ok) or a short reason string
// when the combination is impossible/suspicious. Never diagnostic — only
// internal-consistency of the data entry.
const DEFAULT_CONSISTENCY = [
  {
    key: 'gleason_grade', label: 'تطابق Grade Group مع Gleason',
    check: (g) => {
      const gg = g('grade_group'); const gl = g('gleason');
      if (gg == null || gl == null) return null;
      // Standard ISUP mapping: GG1↔≤6, GG2↔3+4=7, GG3↔4+3=7, GG4↔8, GG5↔9-10.
      const okByGleason = { 6: [1], 7: [2, 3], 8: [4], 9: [5], 10: [5] };
      const allowed = okByGleason[gl];
      if (!allowed) return null;
      if (!allowed.includes(gg)) return `Gleason ${gl} لا يتوافق مع Grade Group ${gg}`;
      return null;
    },
  },
  {
    key: 'freepsa_lt_totalpsa', label: 'Free PSA ≤ Total PSA',
    check: (g) => {
      const f = g('free_psa'); const t = g('psa');
      if (f == null || t == null) return null;
      if (f > t * 1.001) return `Free PSA (${f}) أكبر من Total PSA (${t}) — مستحيل`;
      return null;
    },
  },
];

/**
 * Bind default field rules to the actual columns of a dataset.
 * Returns a map: columnName -> merged rule (default ⊕ custom override).
 * A column with no matching rule simply isn't in the map (nothing to validate
 * against a range for it), which is correct — we never invent bounds.
 */
function bindRules(columns, customRules = []) {
  // Index defaults by every normalised alias.
  const byAlias = new Map();
  for (const rule of DEFAULT_FIELD_RULES) {
    for (const a of rule.aliases) byAlias.set(norm(a), rule);
    byAlias.set(norm(rule.key), rule);
    byAlias.set(norm(rule.label), rule);
  }
  // Custom rules override by explicit column name (exact, case-insensitive).
  const customByCol = new Map();
  for (const cr of customRules || []) {
    if (cr && cr.column) customByCol.set(norm(cr.column), cr);
  }

  const bound = {};
  for (const col of columns) {
    const n = norm(col);
    const base = byAlias.get(n) || null;
    const custom = customByCol.get(n) || null;
    if (!base && !custom) continue;
    bound[col] = Object.assign({ column: col }, base || {}, custom || {});
  }
  return bound;
}

/**
 * Build a per-row field getter keyed by canonical field id.
 * Resolves canonical ids AND raw column names to a row's numeric value, so a
 * formula written against 'psa' works whether the column is "PSA" or "tPSA".
 */
function fieldGetter(dataset, boundRules) {
  // canonical key -> column name
  const keyToCol = {};
  for (const [col, rule] of Object.entries(boundRules)) {
    if (rule.key && !(rule.key in keyToCol)) keyToCol[rule.key] = col;
  }
  return (row) => (idOrCol) => {
    const col = keyToCol[idOrCol] || (idOrCol in row ? idOrCol : null);
    if (!col || !row[col]) return null;
    return row[col].num;
  };
}

module.exports = {
  norm, bindRules, fieldGetter,
  DEFAULT_FIELD_RULES, DEFAULT_FORMULAS, DEFAULT_CONSISTENCY,
};
