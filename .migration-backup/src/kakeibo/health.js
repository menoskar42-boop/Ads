// Financial Health Score (0–100) — computed LOCALLY (free) from the user's own
// numbers. Five weighted factors, each returned so the UI can explain the score.
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// dash = stats.dashboard() result; monthCats = category breakdown this month.
function score(profile, dash, monthCats) {
  const income = Number(profile.monthly_income) || 0;
  const goal = Number(profile.saving_goal) || 0;

  // 1) Saving rate → up to 40 pts (25% rate = full marks).
  const savePts = clamp((dash.savingRate || 0) / 25 * 40, 0, 40);

  // 2) On track for the saving goal → up to 20 pts.
  let goalPts = 10; // neutral if no goal set
  if (goal > 0) goalPts = clamp((dash.remaining / goal) * 20, 0, 20);

  // 3) Overspend risk (from the forecast) → up to 20 pts.
  let riskPts = 20;
  if (income > 0) riskPts = clamp((1 - (dash.projectedSpend || 0) / income) * 20 + 10, 0, 20);
  if (dash.willOverspend) riskPts = clamp(riskPts - 8, 0, 20);

  // 4) Logging consistency → up to 10 pts (any spend this week = engaged).
  const logPts = (dash.spentWeek > 0 || (dash.recent && dash.recent.length >= 3)) ? 10 : 4;

  // 5) Diversification → up to 10 pts (not everything in one category).
  const total = (monthCats || []).reduce((s, c) => s + Number(c.total), 0);
  let divPts = 6;
  if (total > 0 && monthCats.length) {
    const topShare = Number(monthCats[0].total) / total;
    divPts = clamp((1 - topShare) * 14, 2, 10);
  }

  const raw = savePts + goalPts + riskPts + logPts + divPts;
  const s = Math.round(clamp(raw, 0, 100));
  const grade = s >= 80 ? 'excellent' : s >= 60 ? 'good' : s >= 40 ? 'fair' : 'weak';
  const parts = [
    { key: 'save', value: Math.round(savePts), max: 40 },
    { key: 'goal', value: Math.round(goalPts), max: 20 },
    { key: 'risk', value: Math.round(riskPts), max: 20 },
    { key: 'log', value: Math.round(logPts), max: 10 },
    { key: 'div', value: Math.round(divPts), max: 10 },
  ];
  return { score: s, grade, parts };
}

module.exports = { score };
