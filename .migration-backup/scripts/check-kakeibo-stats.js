#!/usr/bin/env node
/**
 * Pin the arithmetic behind "you can spend today".
 *
 * stats.dashboard() is where the double-deduction bug lived: perDay was derived
 * from `remaining`, which already had today's spending taken out of it, and then
 * spentToday was subtracted AGAIN. Spend 100 with 3000 over 10 days and the
 * screen said 190 left today instead of 200. It was fixed, and nothing since has
 * been able to tell whether it stayed fixed.
 *
 * Restating the fixed formula here would test nothing — it would just be the
 * same expression twice. So this asserts the PROPERTY the bug violated, by
 * running the same ledger twice, once with today's expense and once without:
 *
 *   · perDay must not move. It is set by what was left at the START of today,
 *     so spending today cannot change today's allowance — only what is left of
 *     it. The buggy version failed this: perDay shrank as you spent.
 *   · leftToday must fall by exactly what was spent, no more.
 *
 * The pool is a stub that sums a hand-written ledger by date range, so there is
 * no database and no dependency — stats.js only requires ./payday.
 *
 * Profiles here are 'irregular' on purpose: that period is the calendar month,
 * 1st to 1st, so the window is the same whichever day of the year this runs.
 *
 *   node scripts/check-kakeibo-stats.js
 */
'use strict';
const path = require('path');
const stats = require(path.join(__dirname, '..', 'src/kakeibo/stats'));

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

// A pool that answers exactly the three queries stats.dashboard() makes, by
// summing `ledger` — entries are { d: 'YYYY-MM-DD', amount }. Date strings in
// this format compare correctly with <, which is how the real SQL compares them.
function stubPool(ledger) {
  return {
    query: async (sql, params) => {
      if (/kkb_holidays/.test(sql)) return { rows: [] };
      if (/SUM\(amount\)/.test(sql)) {
        const from = params[1], to = params[2];
        const s = ledger.filter((e) => e.d >= from && e.d < to).reduce((a, e) => a + e.amount, 0);
        return { rows: [{ s: String(s) }] };
      }
      if (/ORDER BY spent_on DESC/.test(sql)) {
        return { rows: ledger.map((e, i) => ({ id: i + 1, amount: e.amount, description: null, category: 'other', payment_method: 'cash', spent_on: e.d })) };
      }
      throw new Error('stub pool got an unexpected query: ' + sql.slice(0, 60));
    },
  };
}

const today = new Date(); today.setHours(0, 0, 0, 0);
const TODAY = stats.ymd(today);
const FIRST = stats.ymd(new Date(today.getFullYear(), today.getMonth(), 1));

const freelancer = { monthly_income: 3000, saving_goal: 300, salary_type: 'irregular', weekend: 'fri_sat', country: 'EG', currency: 'EGP' };
const salaried = { monthly_income: 3000, saving_goal: 300, salary_type: 'fixed', salary_day: 25, weekend: 'fri_sat', country: 'EG', currency: 'EGP' };

(async () => {
  // ── The property the double-deduction bug broke ──────────────────────────
  const before = await stats.dashboard(stubPool([{ d: FIRST, amount: 500 }]), 1, freelancer);
  const after = await stats.dashboard(stubPool([{ d: FIRST, amount: 500 }, { d: TODAY, amount: 100 }]), 1, freelancer);

  check('spending today does not change today\'s allowance',
    before.perDay === after.perDay, `perDay ${before.perDay} → ${after.perDay}`);
  check('what is left today falls by exactly what was spent',
    after.leftToday === before.leftToday - 100, `${before.leftToday} → ${after.leftToday}`);
  check('the period total falls by exactly what was spent',
    after.remaining === before.remaining - 100, `${before.remaining} → ${after.remaining}`);
  // The allowance is only ever an instruction, never a debt.
  check('the allowance is never negative',
    (await stats.dashboard(stubPool([{ d: FIRST, amount: 9000 }]), 1, freelancer)).perDay >= 0);

  // ── The period is a calendar month for irregular income ─────────────────
  check('irregular: the period starts on the 1st',
    stats.ymd(before.periodStart) === FIRST, stats.ymd(before.periodStart));
  check('irregular: the period ends on the 1st of next month',
    stats.ymd(before.nextPay) === stats.ymd(new Date(today.getFullYear(), today.getMonth() + 1, 1)));
  check('irregular: today is inside its own period',
    before.periodStart <= today && today < before.nextPay);

  // ── The two flags the screens branch on ─────────────────────────────────
  check('irregular flag set for freelancers, clear for salaried',
    before.irregular === true && (await stats.dashboard(stubPool([]), 1, salaried)).irregular === false);
  const broke = await stats.dashboard(stubPool([]), 1, Object.assign({}, freelancer, { monthly_income: 0 }));
  check('no income: flagged, and no allowance invented',
    broke.noIncome === true && broke.perDay === 0, `perDay ${broke.perDay}`);
  check('income on file: not flagged', before.noIncome === false);
  check('overspent the period: flagged',
    (await stats.dashboard(stubPool([{ d: FIRST, amount: 5000 }]), 1, freelancer)).overBudget === true);

  // ── The render fixture must match the real shape ────────────────────────
  // render-kakeibo-pages.js hand-writes a dashboard snapshot. If stats.dashboard
  // gains or loses a key, that fixture silently drifts and its assertions start
  // testing a shape the app never produces.
  const fixtureSrc = require('fs').readFileSync(path.join(__dirname, 'render-kakeibo-pages.js'), 'utf8');
  const block = (fixtureSrc.match(/function dash\(over\)[\s\S]*?\n}/) || [''])[0];
  const missing = Object.keys(before).filter((k) => !new RegExp('\\b' + k + ':').test(block));
  check('render-kakeibo-pages fixture covers every key stats.dashboard returns',
    !missing.length, missing.length ? 'missing: ' + missing.join(', ') : `${Object.keys(before).length} keys`);

  console.log(fail ? `\n${fail} فشل — الأرقام دي هي اللي المستخدم بيصرف على أساسها.` : '\nحسابات الرئيسية سليمة.');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
