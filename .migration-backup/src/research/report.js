// Report builder: turns raw findings + section data into the structured report
// object the views and exports render. Also computes the 0–100 quality score and
// the Critical/High/Medium/Low priority buckets.
//
// The score is deliberately simple and explainable — a researcher must be able
// to see WHY it is what it is. It starts at 100 and subtracts a weighted penalty
// per finding, capped so a very dirty dataset floors at 0 rather than going
// negative. It is a data-quality indicator, NOT a measure of the research.
'use strict';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PENALTY = { critical: 12, high: 6, medium: 2.5, low: 0.8 };

const CATEGORY_LABEL = {
  missing: 'البيانات الناقصة',
  duplicates: 'التكرارات',
  formula: 'التحقق من المعادلات',
  range: 'المدى الطبي',
  unit: 'وحدات القياس',
  consistency: 'الاتساق',
  outlier: 'القيم الشاذّة',
  precision: 'دقّة الأرقام',
  readiness: 'الجاهزية الإحصائية',
  general: 'عام',
};

const SEVERITY_LABEL = { critical: 'حرج', high: 'مرتفع', medium: 'متوسط', low: 'منخفض' };

function qualityScore(findings) {
  let penalty = 0;
  for (const f of findings) penalty += (PENALTY[f.severity] || 1);
  const score = Math.max(0, Math.round(100 - penalty));
  return score;
}

function scoreLabel(score) {
  if (score >= 90) return { label: 'ممتاز', tone: 'emerald' };
  if (score >= 75) return { label: 'جيد', tone: 'lime' };
  if (score >= 55) return { label: 'مقبول — محتاج مراجعة', tone: 'amber' };
  if (score >= 35) return { label: 'ضعيف — أخطاء كتيرة', tone: 'orange' };
  return { label: 'خطير — لا يصلح للتحليل قبل التصحيح', tone: 'rose' };
}

/**
 * @param dataset  parsed dataset
 * @param analysis runAll() result
 * @param aiText   optional AI explanation string (already anti-hallucination-guarded)
 * @param meta     { filename, hasProtocol, hasGuide, generatedAt }
 */
function buildReport(dataset, analysis, aiText, meta = {}) {
  const findings = analysis.findings.slice().sort((a, b) =>
    (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
    || String(a.category).localeCompare(String(b.category))
    || ((a.row || 0) - (b.row || 0)));

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

  const byCategory = {};
  for (const f of findings) {
    byCategory[f.category] = byCategory[f.category] || { category: f.category, label: CATEGORY_LABEL[f.category] || f.category, count: 0 };
    byCategory[f.category].count += 1;
  }

  const score = qualityScore(findings);

  // Impossible values = range + unit + consistency findings (data that can't be
  // right), surfaced in the summary as the brief asks.
  const impossible = findings.filter((f) => ['range', 'unit', 'consistency'].includes(f.category)).length;

  const dupSummary = analysis.sections.duplicates || {};
  const missingCells = analysis.sections.missing.reduce((s, c) => s + c.missing, 0);
  const totalCells = dataset.meta.rowCount * dataset.meta.colCount;

  return {
    meta: {
      filename: meta.filename || 'dataset',
      generatedAt: meta.generatedAt || null,
      hasProtocol: !!meta.hasProtocol,
      hasGuide: !!meta.hasGuide,
      aiModel: meta.aiModel || null,
    },
    summary: {
      rows: dataset.meta.rowCount,
      columns: dataset.meta.colCount,
      missingPct: totalCells ? Math.round((missingCells / totalCells) * 1000) / 10 : 0,
      duplicatePatients: (dupSummary.duplicateIds || 0),
      sameIdDifferentData: (dupSummary.sameIdDifferentData || 0),
      impossibleValues: impossible,
      criticalErrors: counts.critical,
      warnings: counts.high + counts.medium,
      score,
      scoreLabel: scoreLabel(score),
      counts,
    },
    priority: {
      critical: findings.filter((f) => f.severity === 'critical'),
      high: findings.filter((f) => f.severity === 'high'),
      medium: findings.filter((f) => f.severity === 'medium'),
      low: findings.filter((f) => f.severity === 'low'),
    },
    byCategory: Object.values(byCategory),
    findings,
    sections: analysis.sections,
    profile: analysis.profile,
    ai: aiText || null,
    labels: { severity: SEVERITY_LABEL, category: CATEGORY_LABEL },
  };
}

module.exports = { buildReport, qualityScore, scoreLabel, CATEGORY_LABEL, SEVERITY_LABEL };
