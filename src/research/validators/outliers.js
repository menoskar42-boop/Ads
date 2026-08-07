// Outlier detection on numeric columns using three independent methods (IQR,
// Z-score, MAD). A value is flagged only when at least two agree — one method
// alone is noisy, and the brief is explicit that nothing is ever deleted, only
// surfaced for the researcher to judge.
'use strict';

const { SEVERITY, finding } = require('./helpers');

function stats(nums) {
  const n = nums.length;
  const mean = nums.reduce((a, b) => a + b, 0) / n;
  const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sd = Math.sqrt(variance);
  const s = nums.slice().sort((a, b) => a - b);
  const q = (p) => { const idx = (s.length - 1) * p; const lo = Math.floor(idx); const hi = Math.ceil(idx); return s[lo] + (s[hi] - s[lo]) * (idx - lo); };
  const median = q(0.5); const q1 = q(0.25); const q3 = q(0.75); const iqr = q3 - q1;
  const absDev = nums.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = absDev.length % 2 ? absDev[(absDev.length - 1) / 2] : (absDev[absDev.length / 2 - 1] + absDev[absDev.length / 2]) / 2;
  return { mean, sd, median, q1, q3, iqr, mad };
}

function run(dataset, profile, boundRules) {
  const findings = [];
  const perColumn = [];

  for (const col of dataset.columns) {
    if (!profile[col] || profile[col].kind !== 'numeric') continue;
    // A field constrained to an allowed set (PI-RADS etc.) is handled by ranges,
    // not treated as a continuous distribution.
    if (boundRules[col] && (boundRules[col].allowed || boundRules[col].integer)) continue;
    const vals = [];
    dataset.rows.forEach((row, i) => { const c = row[col]; if (!c.missing && c.num !== null) vals.push({ i, v: c.num }); });
    if (vals.length < 12) continue; // too few for a stable distribution

    const nums = vals.map((x) => x.v);
    const s = stats(nums);
    let flagged = 0;
    for (const { i, v } of vals) {
      const byIqr = s.iqr > 0 && (v < s.q1 - 3 * s.iqr || v > s.q3 + 3 * s.iqr);
      const byZ = s.sd > 0 && Math.abs((v - s.mean) / s.sd) > 3.5;
      const byMad = s.mad > 0 && Math.abs(v - s.median) / (1.4826 * s.mad) > 4;
      const votes = [byIqr, byZ, byMad].filter(Boolean).length;
      if (votes >= 2) {
        flagged += 1;
        findings.push(finding({
          severity: SEVERITY.MEDIUM, category: 'outlier', column: col, row: i + 1,
          problem: `قيمة شاذّة في «${col}» الصف ${i + 1}: ${v} (الوسيط ${Math.round(s.median * 1000) / 1000}).`,
          reason: `القيمة دي بعيدة جداً عن باقي العمود حسب ${votes} من 3 طرق إحصائية (IQR/Z/MAD).`,
          fix: 'راجع القيمة — ممكن تكون خطأ إدخال أو حالة حقيقية متطرفة. متمسحهاش قبل ما تتأكد.',
          detail: { stored: v, median: Math.round(s.median * 1000) / 1000, methods: votes },
        }));
      }
    }
    perColumn.push({ column: col, n: nums.length, flagged, median: Math.round(s.median * 1000) / 1000 });
  }
  return { findings, perColumn };
}

module.exports = { run };
