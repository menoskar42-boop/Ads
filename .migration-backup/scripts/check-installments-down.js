#!/usr/bin/env node
/**
 * The shop was writing off the deposit on every plan.
 *
 * `buildSchedule` builds the instalments from (total − down): a 1000 plan with
 * 300 down produces four instalments of 175, summing to 700. Correct — the
 * deposit was taken at the counter and is not an instalment.
 *
 * But the deposit is ALSO written into `inst_payments`, deliberately, because a
 * shop that collected 300 has collected 300 and its monthly figure has to say
 * so. And `allocate()` summed every payment row against a schedule that had
 * already excluded it.
 *
 * So the customer pays 300 down and 400 of instalments — 700 of a 1000 plan —
 * and the pool (700) matches the total due (700). The plan reads COMPLETED. The
 * shop is still owed 300 and the screen tells it there is nothing to collect.
 * Every plan, every deposit, for the plan's whole life.
 *
 * The fix keeps the money row and stops it paying off instalments it was never
 * part of. This checks the arithmetic by running it, on the exact numbers from
 * the report — a comment saying "excluded" is not evidence.
 *
 *   node scripts/check-installments-down.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const P = require('../src/installments/plan');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

/* ── The schedule itself was never wrong ───────────────────────────────── */
const S = P.buildSchedule({ total: 1000, down: 300, count: 4, interval: 'monthly', startOn: '2026-01-01' });
check('الجدول بيتبني من (الإجمالي − المقدّم)', S.financed === 700, String(S.financed));
check('والأقساط مجموعها المموَّل بالظبط',
  S.rows.reduce((a, r) => a + r.amount, 0) === 700);
check('والمقدّم نفسه مش قسط', S.rows.length === 4 && !S.rows.some((r) => r.amount === 300));

/* ── The bug, run ──────────────────────────────────────────────────────── */
const DOWN = { amount: 300, is_down: true };
const inst = (n) => ({ amount: n });

{
  // Exactly the report's scenario: 300 deposit + 400 of instalments.
  const a = P.allocate(S.rows, [DOWN, inst(175), inst(175), inst(50)], '2026-06-01');
  check('دفع ٣٠٠ مقدّم + ٤٠٠ أقساط: الباقي ٣٠٠ مش صفر',
    a.remaining === 300, 'remaining=' + a.remaining);
  // `settled` is what flips the plan to 'completed' in the route.
  check('والخطة مش «مكتملة»', a.settled === false, String(a.settled));
}

{
  // And when the schedule really is finished, it must say so — an exclusion
  // that never lets a plan complete would be the same bug pointing the other way.
  const a = P.allocate(S.rows, [DOWN, inst(175), inst(175), inst(175), inst(175)], '2026-06-01');
  check('ولما الأقساط تخلص فعلاً الخطة بتقفل', a.remaining === 0 && a.settled === true,
    'remaining=' + a.remaining + ' settled=' + a.settled);
}

{
  // A plan with no deposit must behave exactly as it did before this change.
  const S0 = P.buildSchedule({ total: 1000, down: 0, count: 4, interval: 'monthly', startOn: '2026-01-01' });
  const a = P.allocate(S0.rows, [inst(250), inst(250)], '2026-06-01');
  check('وخطة من غير مقدّم زي ما هي بالظبط', a.remaining === 500, 'remaining=' + a.remaining);
}

{
  // The flag is what separates the two meanings; without it the old sum returns.
  const a = P.allocate(S.rows, [{ amount: 300 }, inst(400)], '2026-06-01');
  check('وصف من غير العلامة بيتحسب كقسط (فالعلامة هي الفرق)', a.remaining === 0);
}

/* ── The money is still in the books ───────────────────────────────────── */
{
  const route = fs.readFileSync(path.join(ROOT, 'src/routes/installments_admin.js'), 'utf8');
  const schema = fs.readFileSync(path.join(ROOT, 'src/installments/schema.js'), 'utf8');
  // The deposit row must NOT be deleted — a shop that took 300 collected 300.
  check('المقدّم لسه بيتسجّل كدفعة (تحصيل الشهر لازم يشوفه)',
    /INSERT INTO inst_payments \(company_id, plan_id, amount, method, note, is_down\)/.test(route)
    && /VALUES \(\$1,\$2,\$3,\$4,'مقدّم',true\)/.test(route));
  check('والعمود موجود في السكيمة',
    /ADD COLUMN IF NOT EXISTS is_down BOOLEAN NOT NULL DEFAULT false/.test(schema));
  // Plans that already exist in production carry the bug until backfilled.
  check('والخطط القديمة بتتصلّح بأثر رجعي',
    /UPDATE inst_payments SET is_down = true/.test(schema) && /note = 'مقدّم'/.test(schema));
  // Collected-this-month sums the table with no filter, which is correct: the
  // deposit is takings. Asserted so a later "fix" does not remove it there too.
  check('وتحصيل الشهر بيجمع الجدول كله (المقدّم تحصيل فعلاً)',
    /SELECT COALESCE\(SUM\(amount\),0\)::float n FROM inst_payments/.test(route));

  const plan = fs.readFileSync(path.join(ROOT, 'src/installments/plan.js'), 'utf8');
  check('والاستبعاد جوّه allocate نفسها مش في كل مستدعي',
    /if \(p && p\.is_down\) continue;/.test(plan));
  // Three call sites; fixing them one by one is how the fourth gets forgotten.
  check('فالتلات مستدعيين اتصلّحوا مرة واحدة',
    (route.match(/P\.allocate\(/g) || []).length === 3);
  /* And the flag has to REACH allocate. Two of the three call sites selected
     only `amount`, so `p.is_down` was undefined and the filter did nothing —
     the fix would have read as done and silently not worked. */
  {
    const selects = route.match(/SELECT [^']*FROM inst_payments/g) || [];
    const forAllocate = selects.filter((q) => !/SUM\(amount\)/.test(q));
    const missing = forAllocate.filter((q) => !/is_down|SELECT \*/.test(q));
    check('وكل SELECT بيغذّي allocate بيجيب العلامة معاه',
      missing.length === 0 && forAllocate.length === 3,
      missing.join(' | ') || forAllocate.length + ' استعلام');
  }
}

console.log(fail
  ? `\n${fail} مشكلة — يعني المحل لسه بيسيب المقدّم من حقّه.`
  : '\nالمقدّم: تحصيل في الدفاتر، ومش قسط في الجدول.');
process.exit(fail ? 1 : 0);
