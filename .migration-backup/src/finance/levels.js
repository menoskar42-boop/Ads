// finance.oscardevs.com (EGX Swing Dashboard): الحسابات كلها دوال صافية من غير قاعدة ولا شبكة، وعليها اختبارات
// (test/finance.test.js). تقديرات فنية بس، مش نصيحة استثمار.
'use strict';

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/**
 * المستويات من الشموع اليومية (الأقدم الأول أو أى ترتيب: بنرتّب بالتاريخ).
 * support = أقل low فى آخر ٢٠ جلسة · resistance20/60 = أعلى high فى آخر ٢٠/٦٠ · sma20/50 · atr14 = متوسط (high - low) آخر ١٤.
 * منطقة الشراء = sma20 +/- 0.5 atr · الوقف = support - 0.5 atr · الهدف ١ = resistance20 · الهدف ٢ = resistance60.
 */
function computeLevels(candles) {
  const c = (candles || [])
    .filter((x) => x && x.trade_date && [x.high_p, x.low_p, x.close_p].every((v) => Number.isFinite(Number(v))))
    .map((x) => ({ d: String(x.trade_date).slice(0, 10), h: Number(x.high_p), l: Number(x.low_p), c: Number(x.close_p) }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  if (!c.length) return null;
  const last = (n) => c.slice(-n);
  const l20 = last(20), l60 = last(60), l14 = last(14), l50 = last(50);
  const support = Math.min(...l20.map((x) => x.l));
  const resistance20 = Math.max(...l20.map((x) => x.h));
  const resistance60 = Math.max(...l60.map((x) => x.h));
  const sma20 = avg(l20.map((x) => x.c));
  const sma50 = avg(l50.map((x) => x.c));
  const atr14 = avg(l14.map((x) => x.h - x.l));

  const flags = [];
  if (c.length < 60) flags.push('short_history');
  for (let i = Math.max(1, c.length - 60); i < c.length; i++) {
    const prev = c[i - 1].c;
    if (prev > 0 && Math.abs(c[i].c / prev - 1) > 0.25) { flags.push('split_suspect'); break; }
  }
  if (l20.length >= 20 && l20.every((x) => x.c === l20[0].c)) flags.push('flat_data');

  return {
    as_of: c[c.length - 1].d,
    last_close: r2(c[c.length - 1].c),
    sma20: r2(sma20), sma50: r2(sma50), support: r2(support),
    resistance20: r2(resistance20), resistance60: r2(resistance60), atr14: r2(atr14),
    buy_lo: r2(sma20 - 0.5 * atr14), buy_hi: r2(sma20 + 0.5 * atr14),
    stop_loss: r2(support - 0.5 * atr14),
    target1: r2(resistance20), target2: r2(resistance60),
    // منطقة البيع (طلب المالك ٢٠٢٦-١١-١١): حوالين الهدف الأول بنفس عرض منطقة الشراء
    sell_lo: r2(resistance20 - 0.5 * atr14), sell_hi: r2(resistance20 + 0.5 * atr14),
    reliable: flags.length === 0,
    flags,
  };
}

/** التنبيهات (مرة واحدة لكل سهم ونوع ويوم، وللأسهم الموثوقة بس): STOP · IN_BUY_ZONE · TARGET1. */
function alertKinds(price, lv) {
  if (!lv || !lv.reliable || !Number.isFinite(price)) return [];
  const out = [];
  if (lv.stop_loss != null && price <= lv.stop_loss) out.push('STOP');
  if (lv.buy_lo != null && lv.buy_hi != null && price >= lv.buy_lo && price <= lv.buy_hi) out.push('IN_BUY_ZONE');
  if (lv.target1 != null && price >= lv.target1) out.push('TARGET1');
  return out;
}

/**
 * الدرجة الفنية: +2 جوّه منطقة الشراء · +1 لو فوقها بأقل من atr · صفر لو أعلى · -1 تحتها وفوق الوقف · -2 عند الوقف أو تحته
 * و+1 لو sma20 > sma50. بترجع الدرجة وأسبابها عشان تتشرح فى الصفحة.
 */
function technicalScore(price, lv) {
  const parts = [];
  if (!lv || !Number.isFinite(price)) return { score: 0, parts };
  let zone = 0, why = 'فوق منطقة الشراء بأكتر من ATR';
  if (price <= lv.stop_loss) { zone = -2; why = 'عند الوقف أو تحته'; }
  else if (price < lv.buy_lo) { zone = -1; why = 'تحت منطقة الشراء وفوق الوقف'; }
  else if (price <= lv.buy_hi) { zone = 2; why = 'جوّه منطقة الشراء'; }
  else if (price <= lv.buy_hi + lv.atr14) { zone = 1; why = 'فوق منطقة الشراء بأقل من ATR'; }
  parts.push({ label: why, points: zone });
  if (lv.sma20 != null && lv.sma50 != null && lv.sma20 > lv.sma50) parts.push({ label: 'المتوسط ٢٠ فوق المتوسط ٥٠', points: 1 });
  return { score: parts.reduce((s, p) => s + p.points, 0), parts };
}

/** درجة الأخبار = مجموع impact_score لإفصاحات السهم فى آخر ١٤ يوم، محصورة بين -3 و3. */
function newsScore(disclosures, todayIso) {
  const today = new Date(String(todayIso).slice(0, 10) + 'T00:00:00Z').getTime();
  const sum = (disclosures || []).reduce((s, d) => {
    const t = new Date(String(d.published_date).slice(0, 10) + 'T00:00:00Z').getTime();
    const days = (today - t) / 86400000;
    return days >= 0 && days <= 14 && Number.isFinite(Number(d.impact_score)) ? s + Number(d.impact_score) : s;
  }, 0);
  return Math.max(-3, Math.min(3, sum));
}

/**
 * الترتيب: composite = فنى + أخبار (+ fouda_score / 50 لو موجود). الأعلى الأول، وغير الموثوق فى الآخر.
 * rows: [{symbol, price, levels, news, fouda_score}]
 */
function rank(rows) {
  const scored = rows.map((r) => {
    const t = technicalScore(r.price, r.levels);
    const parts = t.parts.slice();
    if (r.news) parts.push({ label: 'الأخبار (آخر ١٤ يوم)', points: r.news });
    let composite = t.score + (r.news || 0);
    if (r.fouda_score != null && Number.isFinite(Number(r.fouda_score))) {
      const f = Number(r.fouda_score) / 50;
      parts.push({ label: 'درجة فودة / 50', points: r2(f) });
      composite += f;
    }
    return Object.assign({}, r, { technical: t.score, composite: r2(composite), breakdown: parts, reliable: !!(r.levels && r.levels.reliable) });
  });
  return scored.sort((a, b) => (a.reliable !== b.reliable ? (a.reliable ? -1 : 1) : b.composite - a.composite || a.symbol.localeCompare(b.symbol)));
}

/**
 * التذكرة (للعرض بس، مفيش تنفيذ): الدخول = الحد الأعلى لمنطقة الشراء · الكمية = floor(رأس المال × المخاطرة٪ / (الدخول - الوقف))
 * ومحدودة إن التكلفة ماتعدّيش رأس المال. riskPct بالنسبة المئوية (1 = 1٪).
 */
function ticket(lv, capital, riskPct) {
  capital = Number(capital); riskPct = Number(riskPct);
  if (!lv || !(capital > 0) || !(riskPct > 0) || riskPct > 100) return { ok: false, error: 'أدخل رأس مال ونسبة مخاطرة صح' };
  const entry = lv.buy_hi, stop = lv.stop_loss;
  if (!(entry > 0) || !(stop > 0) || entry <= stop) return { ok: false, error: 'المستويات مش كفاية لتذكرة (الدخول لازم يبقى فوق الوقف)' };
  const perShare = entry - stop;
  const byRisk = Math.floor((capital * riskPct / 100) / perShare);
  const byCash = Math.floor(capital / entry);
  const qty = Math.max(0, Math.min(byRisk, byCash));
  const rr = (t) => (t != null && t > entry ? r2((t - entry) / perShare) : null);
  return {
    ok: true,
    entry: r2(entry), stop_loss: r2(stop), target1: lv.target1, target2: lv.target2,
    quantity: qty, cost: r2(qty * entry), risk_egp: r2(qty * perShare),
    capped_by_cash: byCash < byRisk,
    rr1: rr(lv.target1), rr2: rr(lv.target2),
  };
}

/* ── وقت السوق (القاهرة، الأحد للخميس) ── */
function cairoParts(date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(date || new Date()).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, wd: p.weekday, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
const hm = (s) => { const [h, m] = String(s).split(':').map(Number); return h * 60 + (m || 0); };
function isTradingDay(date) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].includes(cairoParts(date).wd); }
function marketOpen(date, open, close) {
  const p = cairoParts(date);
  return isTradingDay(date) && p.minutes >= hm(open || '10:00') && p.minutes <= hm(close || '14:30');
}

module.exports = { computeLevels, alertKinds, technicalScore, newsScore, rank, ticket, cairoParts, isTradingDay, marketOpen, r2 };
