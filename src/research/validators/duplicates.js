// Duplicate detection: exact duplicate IDs, near-duplicate names, and the same
// patient appearing with different measurements. Name matching is fuzzy
// (normalised edit distance) because "Ahmed Ali" and "Ahmed  Aly" are the same
// person and an exact-match check would miss the most common real duplicate.
'use strict';

const { SEVERITY, finding } = require('./helpers');
const { norm } = require('../rules');

// Column-name hints for the id/name fields, matched on normalised header.
const ID_HINTS = ['id', 'patientid', 'mrn', 'caseid', 'recordid', 'رقم', 'كود', 'رقمالمريض', 'الرقمالقومي'];
const NAME_HINTS = ['name', 'patientname', 'الاسم', 'اسمالمريض', 'اسم'];

function findColumn(columns, hints) {
  for (const col of columns) if (hints.includes(norm(col))) return col;
  // looser contains-match as a fallback
  for (const col of columns) {
    const n = norm(col);
    if (hints.some((h) => n.includes(h))) return col;
  }
  return null;
}

// Levenshtein on normalised strings, capped for speed.
function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length; const n = b.length;
  if (Math.abs(m - n) > 3) return 99; // too different to be a typo
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j += 1) {
    let prev = dp[0]; dp[0] = j;
    for (let i = 1; i <= m; i += 1) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1, dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}

function run(dataset, boundRules) {
  const findings = [];
  const idCol = findColumn(dataset.columns, ID_HINTS);
  const nameCol = findColumn(dataset.columns, NAME_HINTS);
  const summary = { idColumn: idCol, nameColumn: nameCol, duplicateIds: 0, duplicateNames: 0, sameIdDifferentData: 0 };

  // ── Exact duplicate IDs ────────────────────────────────────────────────────
  if (idCol) {
    const byId = new Map();
    dataset.rows.forEach((row, i) => {
      const v = row[idCol];
      if (v.missing) return;
      const k = v.text.trim();
      if (!byId.has(k)) byId.set(k, []);
      byId.get(k).push(i);
    });
    for (const [id, idxs] of byId) {
      if (idxs.length < 2) continue;
      summary.duplicateIds += 1;
      // Same ID with different measurements is worse than a clean duplicate row.
      const measurementCols = Object.keys(boundRules);
      let differ = false;
      if (measurementCols.length) {
        for (const mc of measurementCols) {
          const vals = new Set(idxs.map((i) => (dataset.rows[i][mc].missing ? '∅' : dataset.rows[i][mc].text)));
          if (vals.size > 1) { differ = true; break; }
        }
      }
      if (differ) {
        summary.sameIdDifferentData += 1;
        findings.push(finding({
          severity: SEVERITY.CRITICAL, category: 'duplicates', column: idCol,
          row: idxs[0] + 1,
          problem: `المعرّف «${id}» متكرر في ${idxs.length} صفوف بقياسات مختلفة (الصفوف: ${idxs.map((i) => i + 1).join('، ')}).`,
          reason: 'نفس المريض بقيم مختلفة معناه إمّا إدخال مكرر بالغلط أو خلط بين حالتين — الاتنين بيفسدوا التحليل.',
          fix: 'راجع الصفوف دي وقرّر: تدمجهم، تستبعد المكرر، ولا تصحّح المعرّف.',
          detail: { id, rows: idxs.map((i) => i + 1) },
        }));
      } else {
        findings.push(finding({
          severity: SEVERITY.HIGH, category: 'duplicates', column: idCol,
          row: idxs[0] + 1,
          problem: `المعرّف «${id}» متكرر في ${idxs.length} صفوف (الصفوف: ${idxs.map((i) => i + 1).join('، ')}).`,
          reason: 'المعرّفات المكررة بتضخّم حجم العيّنة وبتكرّر نفس الحالة في التحليل.',
          fix: 'استبعد الصفوف المكررة أو صحّح المعرّفات.',
          detail: { id, rows: idxs.map((i) => i + 1) },
        }));
      }
    }
  }

  // ── Near-duplicate names ───────────────────────────────────────────────────
  if (nameCol) {
    // n     = normalised name (identity-preserving, digits kept)
    // alpha = letters only, digits stripped — used to reject numbered series
    const entries = dataset.rows
      .map((row, i) => ({ i, n: norm(row[nameCol].text), alpha: norm(row[nameCol].text).replace(/[0-9]/g, '') }))
      .filter((e) => e.n.length >= 4);
    const LOW_CAP = 50;         // never drown the report in fuzzy-name noise
    let lowEmitted = 0;
    let lowSuppressed = 0;
    for (let a = 0; a < entries.length; a += 1) {
      for (let b = a + 1; b < entries.length; b += 1) {
        if (entries[a].n === entries[b].n) {
          summary.duplicateNames += 1;
          findings.push(finding({
            severity: SEVERITY.MEDIUM, category: 'duplicates', column: nameCol,
            row: entries[a].i + 1,
            problem: `الاسم «${dataset.rows[entries[a].i][nameCol].text}» متطابق في الصفين ${entries[a].i + 1} و ${entries[b].i + 1}.`,
            reason: 'أسماء متطابقة ممكن تكون نفس المريض مسجّل مرتين.',
            fix: 'أكّد إذا كانوا نفس الشخص ولا اسمين متشابهين فعلاً.',
            detail: { rows: [entries[a].i + 1, entries[b].i + 1] },
          }));
        } else if (editDistance(entries[a].n, entries[b].n) <= 2) {
          // A pure numbered series ("Patient 1" vs "Patient 2") differs only in
          // digits — that is identity, not a typo. Skip it, otherwise every pair
          // in an anonymised sheet floods the report with false near-duplicates.
          if (entries[a].alpha === entries[b].alpha) continue;
          if (lowEmitted >= LOW_CAP) { lowSuppressed += 1; continue; }
          lowEmitted += 1;
          findings.push(finding({
            severity: SEVERITY.LOW, category: 'duplicates', column: nameCol,
            row: entries[a].i + 1,
            problem: `اسمان متشابهان جداً: «${dataset.rows[entries[a].i][nameCol].text}» و «${dataset.rows[entries[b].i][nameCol].text}» (صفوف ${entries[a].i + 1}، ${entries[b].i + 1}).`,
            reason: 'الاختلاف البسيط ممكن يكون خطأ إملائي لنفس المريض.',
            fix: 'راجع إذا كانوا نفس الشخص.',
            detail: { rows: [entries[a].i + 1, entries[b].i + 1] },
          }));
        }
      }
      // Guard against O(n²) blowup on huge sheets — cap the pairwise scan.
      if (a > 2000) break;
    }
    if (lowSuppressed > 0) {
      findings.push(finding({
        severity: SEVERITY.LOW, category: 'duplicates', column: nameCol,
        problem: `فيه ${lowSuppressed} زوج أسماء متشابهة إضافية لم تُعرض (عُرض أول ${LOW_CAP}).`,
        reason: 'العدد الكبير من التشابهات ممكن يكون بسبب نمط تسمية متكرر.',
        fix: 'راجع طريقة تسمية المرضى؛ لو فيه تكرار حقيقي عالجه.',
      }));
    }
  }

  return { findings, summary };
}

module.exports = { run };
