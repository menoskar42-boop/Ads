#!/usr/bin/env node
/**
 * Check an incoming WHO growth CSV before it is trusted.
 *
 *   node scripts/verify-growth-csv.js wfa_girls.csv [...]
 *
 * The CSV carries L, M, S AND the published P3/P50/P97 columns. This script
 * recomputes those percentiles from the LMS and compares. If a column shifted
 * or a row slipped during extraction, the difference shows up immediately.
 *
 * Without this the numbers would be taken on trust — and these tables are what
 * a decision about a child gets made against.
 */
'use strict';
const fs = require('fs');

// WHO's own published figures are rounded to one decimal, so a difference of
// up to half of that is the rounding, not an error.
const TOLERANCE = 0.05;

// Inverse of the LMS transform: the value at z standard deviations.
// L = 0 is the log-normal limit and needs its own branch, not a division by zero.
function valueAt(L, M, S, z) {
  return Math.abs(L) < 1e-7 ? M * Math.exp(S * z) : M * Math.pow(1 + L * S * z, 1 / L);
}
const Z = { P3: -1.880793608, P50: 0, P97: 1.880793608 };

function parse(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.trim());
  const at = (name) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  const idx = { month: at('month'), L: at('L'), M: at('M'), S: at('S') };
  for (const k of ['month', 'L', 'M', 'S']) {
    if (idx[k] < 0) throw new Error(`${file}: no "${k}" column (header: ${head.join(', ')})`);
  }
  const pcols = Object.keys(Z).filter((p) => at(p) >= 0);
  return lines.slice(1).filter(Boolean).map((line) => {
    const c = line.split(',');
    const row = { month: Number(c[idx.month]), L: Number(c[idx.L]), M: Number(c[idx.M]), S: Number(c[idx.S]) };
    pcols.forEach((p) => { row[p] = Number(c[at(p)]); });
    return row;
  });
}

function check(file) {
  const rows = parse(file);
  const problems = [];

  // Structure first: a table with a gap in it silently interpolates across the
  // gap at runtime, which is worse than failing here.
  rows.forEach((r, i) => {
    if (!Number.isFinite(r.month) || !Number.isFinite(r.L) || !Number.isFinite(r.M) || !Number.isFinite(r.S)) {
      problems.push(`row ${i + 2}: non-numeric LMS`);
    }
    if (i > 0 && r.month !== rows[i - 1].month + 1) {
      problems.push(`row ${i + 2}: month jumps ${rows[i - 1].month} → ${r.month}`);
    }
    if (r.M <= 0) problems.push(`row ${i + 2}: M must be positive, got ${r.M}`);
    if (r.S <= 0) problems.push(`row ${i + 2}: S must be positive, got ${r.S}`);
  });

  // Then the real check: recompute WHO's own percentile columns from the LMS.
  let compared = 0;
  let worst = { diff: 0 };
  for (const r of rows) {
    for (const p of Object.keys(Z)) {
      if (!Number.isFinite(r[p])) continue;
      const got = valueAt(r.L, r.M, r.S, Z[p]);
      const diff = Math.abs(got - r[p]);
      compared += 1;
      if (diff > worst.diff) worst = { diff, month: r.month, p, got, want: r[p] };
      if (diff > TOLERANCE) {
        problems.push(`month ${r.month} ${p}: computed ${got.toFixed(3)} vs published ${r[p]} (off by ${diff.toFixed(3)})`);
      }
    }
  }

  const name = file.split('/').pop();
  if (!compared) {
    console.log(`⚠️  ${name}: ${rows.length} rows, months ${rows[0].month}–${rows[rows.length - 1].month} — `
      + 'NO percentile columns, so the LMS could not be verified. Re-export with P3/P50/P97.');
  } else {
    console.log(`${problems.length ? '❌' : '✅'} ${name}: ${rows.length} rows, months `
      + `${rows[0].month}–${rows[rows.length - 1].month}, ${compared} values checked, `
      + `largest difference ${worst.diff.toFixed(4)}`
      + (worst.month != null ? ` (month ${worst.month} ${worst.p})` : ''));
  }
  problems.slice(0, 10).forEach((p) => console.log('   ' + p));
  if (problems.length > 10) console.log(`   … and ${problems.length - 10} more`);

  // Ready to paste into src/clinic/growth_data.js.
  const key = name.replace(/\.csv$/i, '');
  fs.writeFileSync(`/tmp/${key}.js`,
    `  ${key}: [\n${rows.map((r) => `    [${r.month}, ${r.L}, ${r.M}, ${r.S}],`).join('\n')}\n  ],\n`);
  return problems.length === 0 && compared > 0;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.log('usage: node scripts/verify-growth-csv.js <file.csv> [...]');
  process.exit(1);
}
const ok = files.map(check).every(Boolean);
console.log(ok ? '\nكل الجداول سليمة — جاهزة للدمج.' : '\n⚠️ فيه مشاكل فوق — متدمجش قبل ما تتحل.');
process.exit(ok ? 0 : 1);
