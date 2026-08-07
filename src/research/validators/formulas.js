// Formula validation: for each stored calculated column (PSAD, PSA ratio, …),
// recompute from its inputs and flag rows where the stored value drifts beyond
// tolerance. Never overwrites — only reports expected vs stored.
'use strict';

const { SEVERITY, finding, round, decimalsOf } = require('./helpers');
const { DEFAULT_FORMULAS, fieldGetter } = require('../rules');

function run(dataset, boundRules, customFormulas = []) {
  const findings = [];
  const getRow = fieldGetter(dataset, boundRules);
  const formulas = DEFAULT_FORMULAS.concat(customFormulas || []);

  // A canonical target key -> the actual column holding the stored value.
  const keyToCol = {};
  for (const [col, rule] of Object.entries(boundRules)) {
    if (rule.key && !(rule.key in keyToCol)) keyToCol[rule.key] = col;
  }

  const checked = [];
  for (const f of formulas) {
    const targetCol = keyToCol[f.target];
    if (!targetCol) continue; // stored column not present — nothing to verify
    let mismatches = 0; let verified = 0;
    dataset.rows.forEach((row, i) => {
      const g = getRow(row);
      const expected = f.compute(g);
      const stored = row[targetCol].num;
      if (expected === null || stored === null) return; // inputs/target missing
      verified += 1;
      const diff = Math.abs(stored - expected);
      const denom = Math.abs(expected) > 1e-9 ? Math.abs(expected) : 1;
      const drift = diff / denom;
      // A stored value rounded to N decimals can legitimately differ from the
      // exact result by up to half a unit of that precision — that is rounding,
      // not an error. On small values (PSAD ~0.09) this easily exceeds a 5%
      // relative tolerance, so without this floor every rounded cell is a false
      // positive. Flag only when the diff exceeds BOTH the relative tolerance
      // AND the stored value's own rounding granularity.
      const roundFloor = 0.5 * Math.pow(10, -decimalsOf(row[targetCol].text));
      if (drift > (f.tolerance || 0.05) && diff > roundFloor) {
        mismatches += 1;
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'formula', column: targetCol, row: i + 1,
          problem: `القيمة المحسوبة لـ«${targetCol}» في الصف ${i + 1} مختلفة عن المخزّنة.`,
          reason: `${f.label}: المتوقّع ${round(expected, 3)} والمخزّن ${round(stored, 3)} — فرق ${Math.round(drift * 100)}%.`,
          fix: 'راجع القيمة المخزّنة أو مدخلات المعادلة — واحد منهم غلط.',
          detail: { formula: f.label, expected: round(expected, 3), stored: round(stored, 3), difference: round(stored - expected, 3), driftPct: Math.round(drift * 100) },
        }));
      }
    });
    if (verified > 0) checked.push({ formula: f.label, target: targetCol, verified, mismatches });
  }
  return { findings, checked };
}

module.exports = { run };
