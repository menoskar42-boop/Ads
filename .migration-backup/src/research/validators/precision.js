// Decimal-precision review: within one numeric column, mixed precision (some
// rows 0.4, others 0.4231) suggests inconsistent measurement/rounding and can
// blunt correlation. Recommend a unified precision — never rewrite the data.
'use strict';

const { SEVERITY, finding, decimalsOf } = require('./helpers');

function run(dataset, profile, boundRules) {
  const findings = [];
  const perColumn = [];

  for (const col of dataset.columns) {
    if (!profile[col] || profile[col].kind !== 'numeric') continue;
    if (boundRules[col] && (boundRules[col].allowed || boundRules[col].integer)) continue;

    const counts = {}; let n = 0;
    dataset.rows.forEach((row) => {
      const c = row[col];
      if (c.missing || c.num === null) return;
      const d = decimalsOf(c.text);
      counts[d] = (counts[d] || 0) + 1; n += 1;
    });
    if (n < 8) continue;
    const distinct = Object.keys(counts).map(Number).sort((a, b) => a - b);
    if (distinct.length <= 1) { perColumn.push({ column: col, precisions: distinct, mixed: false }); continue; }

    // The dominant precision and how much of the column disagrees with it.
    const dominant = distinct.reduce((best, d) => (counts[d] > counts[best] ? d : best), distinct[0]);
    const offCount = n - counts[dominant];
    const spread = distinct[distinct.length - 1] - distinct[0];
    perColumn.push({ column: col, precisions: distinct, dominant, mixed: true });

    // Only worth flagging when the spread is real (≥2 decimal places apart) and
    // a meaningful share disagrees — otherwise it is just trailing-zero noise.
    const expected = boundRules[col] && boundRules[col].decimals != null ? boundRules[col].decimals : null;
    if (spread >= 2 && offCount / n >= 0.15) {
      findings.push(finding({
        severity: SEVERITY.LOW, category: 'precision', column: col,
        problem: `دقّة أرقام «${col}» غير موحّدة: من ${distinct[0]} لـ${distinct[distinct.length - 1]} خانة عشرية.`,
        reason: 'اختلاف الدقّة جوّه نفس العمود ممكن يقلّل القدرة على اكتشاف الارتباطات (correlation).',
        fix: expected != null
          ? `وحّد العمود على ${expected} خانة عشرية زي ما هو متوقّع للحقل ده.`
          : `وحّد العمود على دقّة واحدة (الأكثر شيوعاً: ${dominant} خانة).`,
        detail: { precisions: distinct, dominant, expected },
      }));
    }
  }
  return { findings, perColumn };
}

module.exports = { run };
