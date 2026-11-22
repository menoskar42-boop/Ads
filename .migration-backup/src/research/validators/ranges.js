// Medical-range validation: flag values outside plausible bounds, non-integer
// where a whole number is required, and values outside an allowed set (PI-RADS,
// Grade Group, Gleason). Bounds are data-entry sanity checks, not diagnosis.
'use strict';

const { SEVERITY, finding } = require('./helpers');

function run(dataset, boundRules) {
  const findings = [];
  const perField = [];

  for (const [col, rule] of Object.entries(boundRules)) {
    if (rule.min === undefined && rule.max === undefined && !rule.allowed && !rule.integer) continue;
    let outOfRange = 0; let badType = 0; let checked = 0;

    dataset.rows.forEach((row, i) => {
      const c = row[col];
      if (c.missing) return;
      // A non-numeric cell in a field that should be numeric is itself an error.
      if (c.num === null) {
        badType += 1;
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'range', column: col, row: i + 1,
          problem: `قيمة نصّية «${c.text}» في عمود رقمي «${col}» (الصف ${i + 1}).`,
          reason: 'العمود ده المفروض أرقام؛ نص هنا هيوقّع التحليل الإحصائي أو يتحوّل لقيمة غلط.',
          fix: `صحّح القيمة لرقم بوحدة ${rule.unit || ''}.`.trim(),
          detail: { stored: c.text },
        }));
        return;
      }
      checked += 1;
      const v = c.num;
      if (rule.integer && !Number.isInteger(v)) {
        badType += 1;
        findings.push(finding({
          severity: SEVERITY.MEDIUM, category: 'range', column: col, row: i + 1,
          problem: `«${col}» لازم يكون رقم صحيح، لكن الصف ${i + 1} فيه ${v}.`,
          reason: `${rule.label || col} بيتقاس كرقم صحيح.`,
          fix: 'راجع القيمة — غالباً خطأ إدخال.',
          detail: { stored: v },
        }));
      }
      if (rule.allowed && !rule.allowed.includes(v)) {
        outOfRange += 1;
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'range', column: col, row: i + 1,
          problem: `«${col}» = ${v} في الصف ${i + 1} مش ضمن القيم المسموحة (${rule.allowed.join('، ')}).`,
          reason: `${rule.label || col} ليه قيم محدّدة فقط؛ قيمة برّه القائمة غالباً خطأ.`,
          fix: `صحّح القيمة لواحدة من: ${rule.allowed.join('، ')}.`,
          detail: { stored: v, allowed: rule.allowed },
        }));
      } else if ((rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) {
        outOfRange += 1;
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'range', column: col, row: i + 1,
          problem: `«${col}» = ${v} في الصف ${i + 1} برّه المدى المتوقّع (${rule.min ?? '−∞'} – ${rule.max ?? '∞'} ${rule.unit || ''}).`,
          reason: 'قيمة برّه المدى المعقول غالباً خطأ إدخال أو وحدة غلط — محتاجة مراجعة.',
          fix: 'راجع القيمة والوحدة؛ لو صحيحة فعلاً وثّق ده.',
          detail: { stored: v, min: rule.min, max: rule.max, unit: rule.unit || null },
        }));
      }
    });
    perField.push({ column: col, label: rule.label || col, unit: rule.unit || null, min: rule.min ?? null, max: rule.max ?? null, checked, outOfRange, badType });
  }
  return { findings, perField };
}

module.exports = { run };
