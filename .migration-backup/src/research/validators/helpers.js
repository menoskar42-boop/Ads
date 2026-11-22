// Shared helpers for the validators. A finding is the single unit every
// validator emits, so the report layer never has to know which check produced
// it. Keeping the shape in one place means a new validator is impossible to
// get subtly wrong.
'use strict';

const SEVERITY = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

/**
 * @param o {
 *   severity, category, column?, row?,   // row is 1-based DATA row (excl header)
 *   problem,   // what is wrong (Arabic, plain)
 *   reason,    // why it matters
 *   fix,       // suggested action — never "we changed it"; the tool never edits
 *   detail?,   // optional {expected, stored, difference, ...} for tables
 * }
 */
function finding(o) {
  return {
    severity: o.severity || SEVERITY.MEDIUM,
    category: o.category || 'general',
    column: o.column || null,
    row: o.row || null,
    problem: o.problem || '',
    reason: o.reason || '',
    fix: o.fix || 'يحتاج مراجعة الباحث.',
    detail: o.detail || null,
  };
}

const round = (n, d = 4) => {
  const f = Math.pow(10, d);
  return Math.round((Number(n) || 0) * f) / f;
};

// Count decimals in a number as written (from its string form).
function decimalsOf(n) {
  if (n === null || n === undefined) return 0;
  const s = String(n);
  const i = s.indexOf('.');
  return i === -1 ? 0 : (s.length - i - 1);
}

module.exports = { SEVERITY, finding, round, decimalsOf };
