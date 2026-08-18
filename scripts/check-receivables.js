#!/usr/bin/env node
/**
 * Two numbers for one question.
 *
 * The showroom dashboard's "customers owe" card computed
 * `SUM(total - paid) FROM furniture_sales WHERE status='open'`. The customer
 * statement — the page the owner opens to actually chase somebody — computed
 * invoiced − paid − credited + refunded + fees due.
 *
 * Three differences, all of them flattering on the card:
 *
 *   · **returns were not deducted**, so credit already handed back was still
 *     being chased;
 *   · **unpaid delivery fees were not added**, so real money owed was missing;
 *   · **only 'open' invoices counted**, so an invoice marked paid that later
 *     had a payment reversed disappeared from the total.
 *
 * The damage is not the size of the error. It is that the owner opens a
 * statement because of the card, and the statement disagrees — so he stops
 * trusting both, and the collections list stops being used. One expression,
 * asked from one place.
 *
 * And only POSITIVE balances are summed. A customer in credit is not a negative
 * receivable; netting them off would quietly reduce what everybody else owes.
 *
 *   node scripts/check-receivables.js
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
const nl = (m) => m.replace(/[^\n]/g, ' ');
const code = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, nl)
  .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + nl(m.slice(p.length)));

const sales = code('src/furniture/sales.js');
const reports = code('src/furniture/reports.js');

/* ── The dashboard asks the one function ───────────────────────────────── */
check('الداشبورد بيسأل دالة المستحقات', /require\('\.\/sales'\)\.receivablesTotal\(pool, cid, branch\)/.test(reports));
check('ومفيش حسبة تانية فاضلة في التقارير',
  !/SUM\(total - paid\),0\) v FROM furniture_sales/.test(reports));

/* ── And it is the statement's arithmetic ──────────────────────────────── */
{
  const fn = (sales.match(/async function receivablesTotal[\s\S]*?\n\}/) || [''])[0];
  check('لقيت الدالة', !!fn);
  for (const [what, re] of [
    ['الفواتير', /COALESCE\(inv\.total,0\)/],
    ['ناقص المدفوع', /- COALESCE\(pay\.total,0\)/],
    ['ناقص المرتجعات', /- COALESCE\(ret\.credited,0\)/],
    ['زائد المسترد نقداً', /\+ COALESCE\(ret\.refunded,0\)/],
    ['زائد رسوم التوصيل المستحقة', /\+ COALESCE\(dlv\.fees_due,0\)/],
  ]) check('بتحسب ' + what, re.test(fn));
  check('والملغي مش محسوب', /s\.status <> 'cancelled'/.test(fn));
  check('ومش مقصورة على «مفتوحة» بس (فاتورة اتقفلت ورجعت مش بتختفي)',
    !/status='open'/.test(fn));
  check('والعميل اللي ليه فلوس مابيقاصّش على غيره', /SUM\(GREATEST\(bal, 0\)\)/.test(fn));

  /* The two must not drift apart again: every term in the statement's balance
     has to appear in the total, or the card starts telling a different story. */
  const stmt = (sales.match(/async function customerBalances[\s\S]*?\n\}/) || [''])[0];
  const terms = ['inv.total', 'pay.total', 'ret.credited', 'ret.refunded', 'dlv.fees_due'];
  const missing = terms.filter((t) => stmt.includes(t) && !fn.includes(t));
  check('وكل حدّ في كشف العميل موجود في الإجمالي', missing.length === 0, missing.join(' · ') || 'كلهم');
}

/* ── Branch scoping matches the rest of the reports ────────────────────── */
{
  const fn = (sales.match(/async function receivablesTotal[\s\S]*?\n\}/) || [''])[0];
  check('الفواتير والتوصيل بيتفلتروا بعمود الفرع',
    /sqlFor\(branch, p, 's\.branch_id'\)/.test(fn) && /sqlFor\(branch, p, 'd\.branch_id'\)/.test(fn));
  check('والدفعات والمرتجعات بيوصلوا لفرعهم عن طريق الفاتورة',
    /furniture_sales ps WHERE ps\.id = pm\.sale_id/.test(fn)
    && /furniture_sales rs WHERE rs\.id = r\.sale_id/.test(fn));
  check('و«قبل الفروع» ليها فرعها الخاص مش بتتبلع',
    /ps\.branch_id IS NULL/.test(fn) && /rs\.branch_id IS NULL/.test(fn));
}

console.log(fail
  ? `\n${fail} مشكلة — يعني كارت «مستحقات العملاء» ممكن يخالف كشف نفس العميل.`
  : '\nالكارت والكشف بيحسبوا بنفس الطريقة، ومن نفس المكان.');
process.exit(fail ? 1 : 0);
