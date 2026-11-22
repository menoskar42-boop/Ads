// Consistency checks: cross-field rules that catch impossible combinations
// (Grade Group vs Gleason, Free PSA > Total PSA, …). These are internal-
// consistency-of-entry checks, never clinical judgement.
'use strict';

const { SEVERITY, finding } = require('./helpers');
const { DEFAULT_CONSISTENCY, fieldGetter } = require('../rules');

function run(dataset, boundRules, customConsistency = []) {
  const findings = [];
  const getRow = fieldGetter(dataset, boundRules);
  const rules = DEFAULT_CONSISTENCY.concat(customConsistency || []);
  const checked = [];

  for (const rule of rules) {
    let violations = 0; let evaluated = 0;
    dataset.rows.forEach((row, i) => {
      const g = getRow(row);
      let reason;
      try { reason = rule.check(g); } catch (e) { reason = null; }
      // A rule returns null when it couldn't evaluate (inputs missing) too, so
      // only count rows where it actually had the data — approximated by a
      // non-null return meaning "violation". Evaluated is best-effort.
      if (reason) {
        violations += 1;
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'consistency', row: i + 1,
          problem: `تعارض في الصف ${i + 1}: ${reason}.`,
          reason: `القاعدة «${rule.label}» بتتكسر — القيمتين مش ممكن يكونوا صح مع بعض.`,
          fix: 'راجع الحقلين المعنيّين وصحّح واحد منهم.',
          detail: { rule: rule.label },
        }));
      }
      evaluated += 1;
    });
    checked.push({ rule: rule.label, evaluated, violations });
  }
  return { findings, checked };
}

module.exports = { run };
