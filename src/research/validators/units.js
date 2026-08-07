// Unit-mistake detection: catch the classic ×10 / ×100 / ÷10 / ÷100 slips that
// happen when a value is converted between cm/mm or cm²/mm². We can't know the
// true unit of a raw number, so we use a robust centre (median) per column and
// flag values that sit almost exactly one power-of-ten off it — that pattern is
// the fingerprint of a conversion mistake rather than natural spread.
//
// Example from the brief: a column of subcutaneous-fat values around 3–4 mm with
// one row at 38 (0.38 cm mis-converted to 38 mm instead of 3.8) — 38 is ~10× the
// median, so it is flagged as a probable ×10 error.
'use strict';

const { SEVERITY, finding } = require('./helpers');

function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function run(dataset, boundRules) {
  const findings = [];

  for (const [col, rule] of Object.entries(boundRules)) {
    // Only meaningful for measured numeric fields with a scale.
    if (rule.integer || rule.allowed) continue;
    const vals = [];
    dataset.rows.forEach((row, i) => { const c = row[col]; if (!c.missing && c.num !== null && c.num > 0) vals.push({ i, v: c.num }); });
    if (vals.length < 8) continue; // too few to establish a reliable centre

    const med = median(vals.map((x) => x.v));
    if (!med || med <= 0) continue;

    for (const { i, v } of vals) {
      const ratio = v / med;
      // Flag ~10×, ~100×, ~0.1×, ~0.01× within a tight window around the power
      // of ten (so ordinary spread up to ~4× the median is never flagged).
      const factors = [
        { f: 100, lo: 60, hi: 140, msg: 'أكبر ~100 مرة من الوسيط' },
        { f: 10, lo: 6, hi: 14, msg: 'أكبر ~10 مرات من الوسيط' },
        { f: 0.1, lo: 1 / 14, hi: 1 / 6, msg: 'أصغر ~10 مرات من الوسيط' },
        { f: 0.01, lo: 1 / 140, hi: 1 / 60, msg: 'أصغر ~100 مرة من الوسيط' },
      ];
      const hit = factors.find((ff) => ratio >= ff.lo && ratio <= ff.hi);
      if (hit) {
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'unit', column: col, row: i + 1,
          problem: `«${col}» = ${v} في الصف ${i + 1} ${hit.msg} (${Math.round(med * 100) / 100}).`,
          reason: `النمط ده بصمة خطأ تحويل وحدة (×10/×100 أو القسمة) — زي ما 0.38 سم تتحوّل لـ38 مم بدل 3.8.`,
          fix: `راجع الوحدة: القيمة الصحيحة غالباً ${Math.round((v / hit.f) * 1000) / 1000} ${rule.unit || ''}.`.trim(),
          detail: { stored: v, median: Math.round(med * 1000) / 1000, suggested: Math.round((v / hit.f) * 1000) / 1000, unit: rule.unit || null },
        }));
      }
    }
  }
  return { findings };
}

module.exports = { run };
