// Missing-data validator: per-column missing count and %, with a flag on any
// column whose missing rate is high enough to weaken analysis.
'use strict';

const { SEVERITY, finding } = require('./helpers');

// A column missing more than this fraction is called out; above the critical
// fraction it is a stronger finding because it can invalidate a variable.
const HIGH = 0.2;
const CRITICAL = 0.5;

function run(dataset) {
  const findings = [];
  const perColumn = [];
  const total = dataset.rows.length;

  for (const col of dataset.columns) {
    let missing = 0;
    for (const row of dataset.rows) if (row[col].missing) missing += 1;
    const pct = total ? missing / total : 0;
    perColumn.push({ column: col, missing, total, pct: Math.round(pct * 1000) / 10 });

    if (pct >= CRITICAL) {
      findings.push(finding({
        severity: SEVERITY.HIGH, category: 'missing', column: col,
        problem: `عمود «${col}» ناقص في ${missing} من ${total} صف (${Math.round(pct * 100)}%).`,
        reason: 'نسبة النقص العالية دي ممكن تخلّي المتغيّر ده غير صالح للتحليل أو تقلّل قوة النتائج.',
        fix: 'راجع سبب النقص: هل القياس ماتعملش، ولا اتنسي تسجيله؟ قرّر تستبعد العمود ولا تكمّله.',
        detail: { missing, total, pct: Math.round(pct * 1000) / 10 },
      }));
    } else if (pct >= HIGH) {
      findings.push(finding({
        severity: SEVERITY.MEDIUM, category: 'missing', column: col,
        problem: `عمود «${col}» ناقص في ${missing} من ${total} صف (${Math.round(pct * 100)}%).`,
        reason: 'نسبة نقص ملحوظة ممكن تأثّر على التحليلات اللي بتعتمد على العمود ده.',
        fix: 'راجع الصفوف الناقصة وكمّلها لو ممكن، أو وثّق سبب النقص.',
        detail: { missing, total, pct: Math.round(pct * 1000) / 10 },
      }));
    }
  }
  perColumn.sort((a, b) => b.pct - a.pct);
  return { findings, perColumn };
}

module.exports = { run };
