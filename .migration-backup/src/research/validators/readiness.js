// Statistical-readiness checks: recommendations only, never fabricated stats.
// Looks for class imbalance, tiny groups, and columns too sparse or too
// constant to be usable in ROC / correlation / regression.
'use strict';

const { SEVERITY, finding } = require('./helpers');
const { norm } = require('../rules');

// Column names that usually hold the outcome/label.
const OUTCOME_HINTS = ['outcome', 'label', 'class', 'diagnosis', 'result', 'malignant', 'benign',
  'cancer', 'pathology', 'التشخيص', 'النتيجة', 'الفئة', 'حميد', 'خبيث'];

function run(dataset, profile) {
  const findings = [];
  const notes = [];
  const total = dataset.rows.length;

  // ── Overall sample size ────────────────────────────────────────────────────
  if (total < 30) {
    findings.push(finding({
      severity: SEVERITY.MEDIUM, category: 'readiness',
      problem: `حجم العيّنة صغير (${total} صف).`,
      reason: 'عيّنة أقل من ~30 بتحدّ من قوة أغلب التحليلات الإحصائية.',
      fix: 'فكّر تزوّد العيّنة أو استخدم اختبارات مناسبة للعيّنات الصغيرة، ووثّق ده.',
    }));
  }

  // ── Outcome balance ────────────────────────────────────────────────────────
  const outcomeCol = dataset.columns.find((c) => OUTCOME_HINTS.includes(norm(c)))
    || dataset.columns.find((c) => OUTCOME_HINTS.some((h) => norm(c).includes(h)));
  if (outcomeCol) {
    const counts = {};
    dataset.rows.forEach((row) => { const c = row[outcomeCol]; if (!c.missing) { const k = c.text.trim(); counts[k] = (counts[k] || 0) + 1; } });
    const classes = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    notes.push({ outcomeColumn: outcomeCol, classes });
    if (classes.length >= 2) {
      const [maj, min] = [classes[0][1], classes[classes.length - 1][1]];
      const ratio = maj / Math.max(1, min);
      if (min < 10) {
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'readiness', column: outcomeCol,
          problem: `فئة «${classes[classes.length - 1][0]}» فيها ${min} حالة فقط في «${outcomeCol}».`,
          reason: 'فئة صغيرة جداً بتضعّف أي تحليل يقارن بين المجموعات (ROC، انحدار).',
          fix: 'زوّد حالات الفئة الأقل أو ادمج فئات لو منطقي.',
          detail: { classes },
        }));
      } else if (ratio >= 4) {
        findings.push(finding({
          severity: SEVERITY.MEDIUM, category: 'readiness', column: outcomeCol,
          problem: `اختلال توازن الفئات في «${outcomeCol}» (نسبة ${Math.round(ratio)}:1).`,
          reason: 'عدم التوازن الشديد ممكن يضلّل مقاييس الأداء زي الدقّة العامة.',
          fix: 'استخدم مقاييس مناسبة لعدم التوازن (AUC، recall) أو وازن العيّنة.',
          detail: { classes },
        }));
      }
    }
  } else {
    notes.push({ outcomeColumn: null, hint: 'مالقيناش عمود نتيجة/تشخيص واضح — لو فيه واحد، سمّيه باسم مفهوم.' });
  }

  // ── Per-column usability ───────────────────────────────────────────────────
  for (const col of dataset.columns) {
    const p = profile[col];
    if (!p) continue;
    const presentPct = total ? p.present / total : 0;
    if (presentPct < 0.5) {
      findings.push(finding({
        severity: SEVERITY.MEDIUM, category: 'readiness', column: col,
        problem: `«${col}» متاح في أقل من نص الصفوف (${Math.round(presentPct * 100)}%).`,
        reason: 'عمود بنص بياناته ناقص مش مناسب للارتباط أو الانحدار من غير معالجة.',
        fix: 'استبعد العمود من التحليل أو عالج النقص بطريقة موثّقة.',
      }));
    }
    if (p.kind === 'numeric') {
      // A numeric column with (almost) no variance is useless for correlation.
      const vals = [];
      dataset.rows.forEach((row) => { const c = row[col]; if (!c.missing && c.num !== null) vals.push(c.num); });
      if (vals.length >= 8) {
        const uniq = new Set(vals).size;
        if (uniq === 1) {
          findings.push(finding({
            severity: SEVERITY.LOW, category: 'readiness', column: col,
            problem: `«${col}» له قيمة واحدة ثابتة في كل الصفوف.`,
            reason: 'متغيّر بلا تباين مالوش أي قيمة في الارتباط أو الانحدار.',
            fix: 'استبعده من التحليل، أو راجع إذا كان المفروض يتغيّر.',
          }));
        }
      }
    }
  }

  return { findings, notes };
}

module.exports = { run };
