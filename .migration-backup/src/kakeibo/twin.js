// Financial Twin — learns the user's habits by detecting RECURRING expenses
// (rent, subscriptions, bills…) from history and predicting upcoming ones for
// the current pay period. Fully local (free) pattern detection.
function ymd(d) { const p = (n) => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function norm(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[0-9٠-٩]+/g, '').trim(); }
function median(arr) { const a = arr.slice().sort((x, y) => x - y); const m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); }

async function detect(pool, userId) {
  const since = new Date(); since.setDate(since.getDate() - 130);
  const rows = (await pool.query(
    'SELECT amount, description, category, spent_on FROM kkb_expenses WHERE user_id=$1 AND spent_on >= $2 ORDER BY spent_on',
    [userId, ymd(since)]
  )).rows;
  if (rows.length < 3) return { recurring: [], predictedTotal: 0 };

  // Group by a stable key: normalized description, else category.
  const groups = {};
  rows.forEach((r) => {
    const key = norm(r.description) || ('cat:' + r.category);
    (groups[key] = groups[key] || []).push({ amount: Number(r.amount) || 0, date: new Date(r.spent_on), category: r.category, label: (r.description || '').trim() });
  });

  const now = new Date();
  const curMonthKey = now.getFullYear() + '-' + (now.getMonth() + 1);
  const recurring = [];
  Object.keys(groups).forEach((key) => {
    const occ = groups[key];
    const months = new Set(occ.map((o) => o.date.getFullYear() + '-' + (o.date.getMonth() + 1)));
    if (months.size < 2) return; // must appear in ≥2 distinct months
    const amounts = occ.map((o) => o.amount);
    const avg = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    if (avg <= 0) return;
    const typicalDay = median(occ.map((o) => o.date.getDate()));
    const alreadyThisMonth = occ.some((o) => (o.date.getFullYear() + '-' + (o.date.getMonth() + 1)) === curMonthKey);
    const label = occ.map((o) => o.label).filter(Boolean).pop() || null;
    const predicted = new Date(now.getFullYear(), now.getMonth(), Math.min(typicalDay, 28));
    recurring.push({ key, label, category: occ[occ.length - 1].category, avgAmount: avg, count: occ.length, typicalDay, alreadyThisMonth, predictedDate: ymd(predicted) });
  });

  recurring.sort((a, b) => b.avgAmount - a.avgAmount);
  const predictedTotal = recurring.filter((r) => !r.alreadyThisMonth).reduce((s, r) => s + r.avgAmount, 0);
  return { recurring, predictedTotal };
}

module.exports = { detect };
