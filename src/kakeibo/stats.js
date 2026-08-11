// Kakeibo aggregations for the dashboard, reports and monthly review.
const { currentPeriodStart, nextPayday } = require('./payday');

function ymd(d) { const p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

async function sumRange(pool, userId, fromYmd, toYmdExcl) {
  const r = await pool.query(
    'SELECT COALESCE(SUM(amount),0)::numeric AS s FROM kkb_expenses WHERE user_id=$1 AND spent_on >= $2 AND spent_on < $3',
    [userId, fromYmd, toYmdExcl]
  );
  return Number(r.rows[0].s) || 0;
}

async function loadCustomHolidays(pool, userId) {
  try {
    const rows = (await pool.query('SELECT holiday_on FROM kkb_holidays WHERE user_id=$1', [userId])).rows;
    return new Set(rows.map((r) => ymd(new Date(r.holiday_on))));
  } catch (e) { return new Set(); }
}

// Full dashboard snapshot for the current pay period.
async function dashboard(pool, userId, profile) {
  const cs = await loadCustomHolidays(pool, userId);
  const today = startOfDay(new Date());
  const periodStart = currentPeriodStart(profile, today, cs);
  const nextPay = nextPayday(profile, addDays(periodStart, 1), cs);

  const income = Number(profile.monthly_income) || 0;
  const goal = Number(profile.saving_goal) || 0;

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const [spentPeriod, spentToday, spentWeek, spentMonth] = await Promise.all([
    sumRange(pool, userId, ymd(periodStart), ymd(nextPay)),
    sumRange(pool, userId, ymd(today), ymd(addDays(today, 1))),
    sumRange(pool, userId, ymd(addDays(today, -6)), ymd(addDays(today, 1))),
    sumRange(pool, userId, ymd(monthStart), ymd(monthEnd)),
  ]);

  const remaining = income - spentPeriod;
  const savingRate = income > 0 ? Math.round((remaining / income) * 100) : 0;
  const goalProgress = goal > 0 ? Math.max(0, Math.min(100, Math.round((remaining / goal) * 100))) : 0;
  const daysLeft = Math.max(0, Math.ceil((nextPay - today) / 86400000));

  // Local (free) forecast: project this period's end from the current daily rate.
  const totalDays = Math.max(1, Math.round((nextPay - periodStart) / 86400000));
  const daysElapsed = Math.max(1, Math.round((today - periodStart) / 86400000) + 1);
  const dailyRate = spentPeriod / daysElapsed;
  const projectedSpend = Math.round(dailyRate * totalDays);
  const projectedRemaining = Math.round(income - projectedSpend);
  const willOverspend = projectedSpend > income;

  const recent = (await pool.query(
    'SELECT id, amount, description, category, payment_method, spent_on FROM kkb_expenses WHERE user_id=$1 ORDER BY spent_on DESC, id DESC LIMIT 8',
    [userId]
  )).rows;

  // ── The one number the app exists for ──────────────────────────────────────
  //
  // Kakeibo's whole method is a question asked at the till: "do I actually need
  // this?" The figure that answers it is not the balance — it is what is left
  // to spend TODAY. Both halves of it (remaining, daysLeft) were already being
  // computed and never divided.
  //
  // daysLeft is 0 on payday itself, so the period is treated as having at least
  // one day rather than dividing by zero and printing Infinity at somebody.
  const spendableDays = Math.max(1, daysLeft);
  // Today's budget is set from what was left at the START of today, not from
  // `remaining` — `remaining` already has today's spending taken out of it, so
  // dividing it and then subtracting spentToday charged the user twice for
  // every pound spent today. Spend 100 with 3000 over 10 days and the old
  // formula showed 190 left today instead of 200.
  const remainingBeforeToday = remaining + spentToday;
  // Never negative: "you may spend -300 a day" is not an instruction anyone can
  // follow. Overspending is a STATE the page names, not a negative allowance.
  const perDay = Math.max(0, Math.round(remainingBeforeToday / spendableDays));
  // What is genuinely left for the rest of today, after what has already gone.
  const leftToday = Math.round(perDay - spentToday);
  const overBudget = remaining < 0;
  // Income can legitimately be 0 now: the first screen lets people skip the
  // money questions with "I don't know yet". Nothing above changes — but every
  // figure derived from income (remaining, perDay, overBudget) is then an
  // artefact of the missing number, not a fact about their spending, and the
  // page has to say so rather than announce "you spent more than you earned"
  // to somebody who never told us what they earn.
  const noIncome = income <= 0;

  return { periodStart, nextPay, daysLeft, income, goal, spentPeriod, remaining,
    savingRate, goalProgress, spentToday, spentWeek, spentMonth, recent,
    projectedSpend, projectedRemaining, willOverspend,
    perDay, leftToday, overBudget, spendableDays, noIncome };
}

async function categoryBreakdown(pool, userId, fromYmd, toYmdExcl) {
  const rows = (await pool.query(
    `SELECT category, COALESCE(SUM(amount),0)::numeric AS total FROM kkb_expenses
     WHERE user_id=$1 AND spent_on >= $2 AND spent_on < $3 GROUP BY category ORDER BY total DESC`,
    [userId, fromYmd, toYmdExcl]
  )).rows;
  return rows.map((r) => ({ key: r.category, total: Number(r.total) || 0 }));
}

async function monthlySeries(pool, userId, months) {
  const now = new Date();
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const s = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const total = await sumRange(pool, userId, ymd(s), ymd(e));
    out.push({ label: (s.getMonth() + 1) + '/' + String(s.getFullYear()).slice(2), total });
  }
  return out;
}

async function weeklySeries(pool, userId, weeks) {
  const today = startOfDay(new Date());
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const e = addDays(today, -7 * i + 1);      // exclusive end
    const s = addDays(e, -7);
    const total = await sumRange(pool, userId, ymd(s), ymd(e));
    out.push({ label: 'W-' + i, total });
  }
  return out;
}

async function monthReview(pool, userId, profile, year, month0) {
  const s = new Date(year, month0, 1);
  const e = new Date(year, month0 + 1, 1);
  const spent = await sumRange(pool, userId, ymd(s), ymd(e));
  const income = Number(profile.monthly_income) || 0;
  const saved = income - spent;
  const rate = income > 0 ? Math.round((saved / income) * 100) : 0;
  const cats = await categoryBreakdown(pool, userId, ymd(s), ymd(e));
  const largest = cats.length ? cats[0] : null;
  return { year, month0, income, spent, saved, rate, largest, cats };
}

// Average monthly spend per category over the last N months (for simulations).
async function avgCategoryMonthly(pool, userId, months) {
  const now = new Date();
  const s = ymd(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
  const e = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const rows = (await pool.query(
    `SELECT category, COALESCE(SUM(amount),0)::numeric AS total FROM kkb_expenses
     WHERE user_id=$1 AND spent_on >= $2 AND spent_on < $3 GROUP BY category ORDER BY total DESC`,
    [userId, s, e]
  )).rows;
  return rows.map((r) => ({ key: r.category, monthly: Math.round(Number(r.total) / months) })).filter((c) => c.monthly > 0);
}

module.exports = { dashboard, categoryBreakdown, monthlySeries, weeklySeries, monthReview, avgCategoryMonthly, loadCustomHolidays, ymd };
