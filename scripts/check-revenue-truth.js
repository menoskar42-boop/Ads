#!/usr/bin/env node
/**
 * A revenue figure that counts orders the kitchen refused.
 *
 * `/food/reports` summed `total` over **every** row in `food_orders` — the
 * delivered ones, and the rejected and cancelled ones with them. The two item
 * tables further down the same page already excluded both, so the page could
 * disagree with itself: the headline said one number, the products underneath
 * added up to a smaller one, and the bigger number is the one an owner plans a
 * month around.
 *
 * A number a merchant trusts and cannot verify is worse than no number. So
 * this check is a rule, not a patch: **any SUM/AVG of an order total that is
 * presented as money earned must exclude the states where no money was
 * earned** — and it sweeps the reporting routes rather than the one file the
 * report named.
 *
 *   node scripts/check-revenue-truth.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra !== undefined ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* Comments explain the bug in prose that contains the very words being
   searched for. Strip them, or the check reads its own explanation as code. */
const nl = (m) => m.replace(/[^\n]/g, ' ');   // keep line numbers honest
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const FILES = ['src/routes/food_admin.js', 'src/routes/accounting.js'];
const LOST = /NOT IN \('rejected','cancelled'\)|NOT IN \('cancelled','rejected'\)|status <> 'rejected'/;
const SUMS = /(SUM|AVG)\((?:o\.)?total\)/g;
/* An aggregate whose FILTER selects ONLY the refused states is not a revenue
   claim — it is the report saying out loud what was refused. */
const IS_THE_LOST_FIGURE = /IN \('rejected','cancelled'\)/;
/* One level of nesting is enough for `FILTER (WHERE status NOT IN (…))`. */
const FILTER_CLAUSE = /FILTER\s*\(\s*WHERE(?:[^()]|\([^()]*\))*\)/g;

for (const rel of FILES) {
  const src = strip(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const spots = [];
  /* Per SQL statement, not per file. The first version of this check looked at
     a window of text around each SUM and passed on a *neighbouring* query's
     exclusion — it went green with the bug put back, which is the only test
     result that matters for a check. An aggregate is covered by its OWN
     FILTER, or by the WHERE of the statement it lives in. Nothing else. */
  for (const tpl of src.match(/`[^`]*`/g) || []) {
    if (!(SUMS.test(tpl))) { SUMS.lastIndex = 0; continue; }
    SUMS.lastIndex = 0;
    // Strip the FILTER clauses first: what is left is the statement's own
    // WHERE, so a filter on a different column cannot vouch for this one.
    const whereOnly = tpl.replace(FILTER_CLAUSE, ' ');
    const wholeQueryExcludes = LOST.test(whereOnly);
    for (const m of tpl.matchAll(SUMS)) {
      const after = tpl.slice(m.index + m[0].length, m.index + m[0].length + 120);
      const own = (after.match(/^\s*FILTER\s*\(\s*WHERE(?:[^()]|\([^()]*\))*\)/) || [''])[0];
      if (wholeQueryExcludes || LOST.test(own) || IS_THE_LOST_FIGURE.test(own)) continue;
      const at = src.indexOf(tpl) + m.index;
      spots.push(rel + ':' + (src.slice(0, at).split('\n').length) + ' ' + m[0]);
    }
  }
  check('إيراد المطاعم في ' + path.basename(rel) + ' مابيعدّش الملغي',
    spots.length === 0, spots.join(' · ') || 'كل الجُمل بتستثني');
}

/* The refused orders are still reported — moved, not hidden. Revenue that
   quietly shrinks with no explanation is its own kind of lying. */
{
  const src = fs.readFileSync(path.join(ROOT, 'src/routes/food_admin.js'), 'utf8');
  check('والقيمة الضايعة لسه بتتحسب وبتتبعت للشاشة', /lost_value/.test(src));
  const view = fs.readFileSync(path.join(ROOT, 'src/views/food_admin/reports.ejs'), 'utf8');
  check('والشاشة بتعرضها', /summary\.lost_value/.test(view));
  const i18n = fs.readFileSync(path.join(ROOT, 'src/i18n/strings.js'), 'utf8');
  check('ومفتاحها في القاموس باللغتين',
    (i18n.match(/'food\.reports\.lost_value'/g) || []).length === 2);
}

console.log(fail
  ? `\n${fail} مشكلة — يعني رقم إيراد التاجر أكبر من اللي دخل فعلاً.`
  : '\nالإيراد بيعدّ اللي اتباع بس، والملغي متقال بالاسم مش متخبّي.');
process.exit(fail ? 1 : 0);
