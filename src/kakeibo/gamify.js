// Gamification — streaks, XP, level, badges. All computed LOCALLY (free) from
// the user's own data to reward consistent, healthy money habits.
function ymd(d) { const p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

async function compute(pool, userId, profile, dash) {
  const cnt = Number((await pool.query('SELECT COUNT(*)::int AS n FROM kkb_expenses WHERE user_id=$1', [userId])).rows[0].n) || 0;
  const catsUsed = Number((await pool.query('SELECT COUNT(DISTINCT category)::int AS n FROM kkb_expenses WHERE user_id=$1', [userId])).rows[0].n) || 0;
  const goalsRow = (await pool.query('SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE saved_amount>=target_amount AND target_amount>0)::int AS done FROM kkb_goals WHERE user_id=$1', [userId])).rows[0];
  const goals = Number(goalsRow.n) || 0, goalsDone = Number(goalsRow.done) || 0;

  // Logging streak: consecutive days (ending today or yesterday) with an expense.
  const days = (await pool.query('SELECT DISTINCT spent_on FROM kkb_expenses WHERE user_id=$1 ORDER BY spent_on DESC LIMIT 400', [userId])).rows.map((r) => ymd(new Date(r.spent_on)));
  const set = new Set(days);
  let streak = 0; const cur = new Date(); cur.setHours(0, 0, 0, 0);
  if (!set.has(ymd(cur))) cur.setDate(cur.getDate() - 1); // allow "yesterday" so today's gap doesn't reset
  while (set.has(ymd(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

  const xp = cnt * 5 + goals * 25 + goalsDone * 150 + streak * 10 + Math.max(0, dash.savingRate || 0);
  const level = Math.floor(xp / 250) + 1;
  const levelPct = Math.round((xp % 250) / 250 * 100);

  const badges = [
    { key: 'first_expense', unlocked: cnt >= 1 },
    { key: 'logger30', unlocked: cnt >= 30 },
    { key: 'streak7', unlocked: streak >= 7 },
    { key: 'streak30', unlocked: streak >= 30 },
    { key: 'first_goal', unlocked: goals >= 1 },
    { key: 'goal_done', unlocked: goalsDone >= 1 },
    { key: 'saver', unlocked: (dash.savingRate || 0) >= 20 },
    { key: 'diversified', unlocked: catsUsed >= 5 },
  ];
  return { streak, xp, level, levelPct, badges, unlockedCount: badges.filter((b) => b.unlocked).length };
}

module.exports = { compute };
