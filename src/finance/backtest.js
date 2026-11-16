// اختبار نظام الترشيحات على الشموع اليومية القديمة (المالك ٢٠٢٦-١١-١٣: «عاوزين نختبر نظامنا على البيانات التاريخية
// نشوف مدى كفاءته وفاعليته» — docs/SF_MONDAY_2026-11-16.md بند ٦). دالة صافية من غير قاعدة ولا شبكة.
//
// نفس levels.computeLevels و signals.buySignal بالظبط، يوم بيوم ومن غير ما يشوف المستقبل:
//  • آخر اليوم t: المستويات وRSI من الشموع لحد t، والسعر = إقفال t. لو الشروط اتحققت ⇒ ترشيح.
//  • الدخول على فتح اليوم t+1. الوقف والهدف ثابتين من الترشيح (زى أوامر الخروج فى محفظة الديمو).
//  • الخروج: low ≤ الوقف ⇒ بالوقف (ولو الفتح تحته ⇒ بالفتح) · high ≥ الهدف ⇒ بالهدف (ولو الفتح فوقه ⇒ بالفتح).
//    الاتنين فى نفس اليوم ⇒ الوقف (الأسوأ).
//  • مفيش ترشيح لنفس السهم فى آخر ٣ أيام، ولا وهو فى صفقة. شرط الأخبار مايتختبرش (مفيش أرشيف أخبار) ⇒ أخبار = صفر.
//  • العمولات (كل ناحية) والضريبة على صافى أرباح السنة.
// البدائل (بند ٦: أ–د) اختيارات فى opts عشان تتقارن بنفس المحرّك، والنظام الحالى = من غير أى اختيار.
'use strict';

const L = require('./levels');
const S = require('./signals');

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

const DEFAULTS = {
  capital: 100000,        // رأس المال
  perTrade: 10000,        // مبلغ كل صفقة (لو الكاش مش كفاية الترشيح بيتساب)
  feePct: 0.25,           // عمولة + رسوم البورصة والمقاصة لكل ناحية (٪)
  taxPct: 10,             // ضريبة على صافى ربح السنة (٪)
  cooldownDays: 3,        // مفيش ترشيح لنفس السهم فى آخر ٣ أيام
  minHistory: 60,         // المستويات محتاجة ٦٠ جلسة عشان تبقى «موثوقة»
  // البدائل
  slope: false,           // (أ) المتوسط ٢٠ لازم يكون طالع (أعلى من قيمته من ٥ جلسات)
  trendStart: false,      // (ب) الدخول على بداية التحول: المتوسط ٢٠ عدّى فوق ٥٠ فى آخر ١٠ جلسات
  atrStop: false,         // (ج) الوقف = الدخول − ٢ ATR (بدل الدعم − نص ATR)
  pyramid: false,         // (د) تعزيز المركز: الإقفال ≥ الدخول + ١R ⇒ الوقف يتحرّك للدخول ومبلغ تانى يدخل
};

const norm = (c) => ({ d: String(c.trade_date).slice(0, 10), o: Number(c.open != null ? c.open : c.open_p),
  h: Number(c.high != null ? c.high : c.high_p), l: Number(c.low != null ? c.low : c.low_p),
  c: Number(c.close != null ? c.close : c.close_p), v: Number(c.volume) });
const asLevelsRow = (x) => ({ trade_date: x.d, high_p: x.h, low_p: x.l, close_p: x.c, volume: x.v });

/** متوسط آخر n إقفال لحد index i (شامل) */
function sma(cs, i, n) {
  if (i + 1 < n) return null;
  let s = 0; for (let k = i - n + 1; k <= i; k++) s += cs[k].c; return s / n;
}

/** ترشيح الشراء آخر يوم i (لو فيه) — النظام الحالى + البدائل */
function signalAt(cs, i, o) {
  const hist = cs.slice(Math.max(0, i - 249), i + 1);
  if (hist.length < o.minHistory) return null;
  const lv = L.computeLevels(hist.map(asLevelsRow));
  if (!lv) return null;
  const sig = S.buySignal({ price: cs[i].c, levels: lv, rsi: S.rsi14(hist.map((x) => x.c)), volRatio: null, news: 0, holding: false, recentRec: false });
  if (!sig) return null;
  if (o.slope) { const now = sma(cs, i, 20), ago = sma(cs, i - 5, 20); if (!(now != null && ago != null && now > ago)) return null; }
  if (o.trendStart) {
    let crossed = false;
    for (let k = i; k > i - 10 && k > 0; k--) {
      const a20 = sma(cs, k, 20), a50 = sma(cs, k, 50), b20 = sma(cs, k - 1, 20), b50 = sma(cs, k - 1, 50);
      if (a20 != null && a50 != null && b20 != null && b50 != null && a20 > a50 && b20 <= b50) { crossed = true; break; }
    }
    if (!crossed) return null;
  }
  return { stop: sig.stop_loss, target: sig.target1, atr: lv.atr14, rr: sig.rr1 };
}

/** الخروج فى يوم: الوقف قبل الهدف لو الاتنين اتلمسوا، والفجوة بتتنفّذ بالفتح. k = {o,h,l,c} */
function exitFor(t, k) {
  if (k.l <= t.stop) return { exit: Math.min(k.o, t.stop), why: t.stop >= t.entry ? 'وقف عند الدخول' : 'الوقف' };
  if (k.h >= t.target) return { exit: Math.max(k.o, t.target), why: 'الهدف' };
  return { exit: null, why: null };
}

/**
 * series: { SYMBOL: [شموع يومية {trade_date, open, high, low, close, volume}] }
 * بيرجّع { trades, summary, byYear, equity } — الصفقات بالترتيب ومؤشرات الأداء.
 */
function runBacktest(series, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  const fee = o.feePct / 100;
  const data = {};
  const dates = new Set();
  for (const [sym, rows] of Object.entries(series || {})) {
    const cs = (rows || []).map(norm).filter((x) => x.d && [x.o, x.h, x.l, x.c].every(Number.isFinite) && x.c > 0)
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
    if (!cs.length) continue;
    data[sym] = { cs, idx: new Map(cs.map((x, k) => [x.d, k])) };
    cs.forEach((x) => dates.add(x.d));
  }
  const days = [...dates].sort();
  let cash = o.capital;
  const open = {};          // sym ⇒ صفقة مفتوحة
  const pending = {};       // sym ⇒ ترشيح هيدخل على فتح بكره
  const lastSignal = {};    // sym ⇒ index آخر ترشيح
  const trades = [];
  const equity = [];
  for (const day of days) {
    // ١) الدخول على الفتح (ترشيحات امبارح)
    for (const sym of Object.keys(pending)) {
      const D = data[sym]; const i = D.idx.get(day);
      if (i == null) continue;
      const p = pending[sym]; delete pending[sym];
      const px = D.cs[i].o;
      const qty = Math.floor(o.perTrade / px);
      const cost = qty * px * (1 + fee);
      if (!(qty > 0) || cost > cash + 1e-9) continue;
      // (ج) وقف ٢ ATR من سعر الدخول الفعلى
      const stop = o.atrStop ? r2(px - 2 * p.atr) : p.stop;
      if (!(stop < px)) continue;
      cash -= cost;
      open[sym] = { sym, entryDate: day, entryIdx: i, entry: px, qty, cost, stop, target: p.target, initStop: stop, added: false };
    }
    // ٢) الخروج خلال اليوم (الوقف قبل الهدف لو الاتنين)
    for (const sym of Object.keys(open)) {
      const t = open[sym]; const D = data[sym]; const i = D.idx.get(day);
      if (i == null) continue;   // فى نفس يوم الدخول ممكن يخرج (الفتح بعده الوقف أو الهدف)
      const k = D.cs[i];
      const { exit, why } = exitFor(t, k);
      if (exit != null) {
        const proceeds = t.qty * exit * (1 - fee);
        cash += proceeds;
        trades.push({ symbol: sym, entryDate: t.entryDate, exitDate: day, entry: r2(t.entry), exit: r2(exit), qty: t.qty,
          pnl: r2(proceeds - t.cost), pct: r2((proceeds / t.cost - 1) * 100), days: i - t.entryIdx, why, added: t.added });
        delete open[sym];
        continue;
      }
      // (د) تعزيز المركز: الإقفال ≥ الدخول + ١R مرة واحدة ⇒ الوقف للدخول ومبلغ تانى على الإقفال
      if (o.pyramid && !t.added && k.c >= t.entry + (t.entry - t.initStop)) {
        const q2 = Math.floor(o.perTrade / k.c); const c2 = q2 * k.c * (1 + fee);
        t.stop = Math.max(t.stop, r2(t.entry));
        if (q2 > 0 && c2 <= cash + 1e-9) {
          cash -= c2; t.cost += c2; t.entry = (t.entry * t.qty + k.c * q2) / (t.qty + q2); t.qty += q2; t.added = true;
        }
      }
    }
    // ٣) ترشيحات آخر اليوم (للدخول بكره)
    for (const sym of Object.keys(data)) {
      if (open[sym] || pending[sym]) continue;
      const D = data[sym]; const i = D.idx.get(day);
      if (i == null) continue;
      if (lastSignal[sym] != null && i - lastSignal[sym] < o.cooldownDays) continue;
      const s = signalAt(D.cs, i, o);
      if (!s) continue;
      lastSignal[sym] = i;
      pending[sym] = s;
    }
    // قيمة المحفظة آخر اليوم
    let val = cash;
    for (const t of Object.values(open)) { const D = data[t.sym]; const i = D.idx.get(day); const c = i != null ? D.cs[i].c : t.entry; val += t.qty * c; }
    equity.push({ d: day, v: r2(val) });
  }
  // الصفقات المفتوحة فى الآخر بتتقفل على آخر إقفال (للحساب بس)
  for (const t of Object.values(open)) {
    const D = data[t.sym]; const last = D.cs[D.cs.length - 1];
    const proceeds = t.qty * last.c * (1 - fee);
    trades.push({ symbol: t.sym, entryDate: t.entryDate, exitDate: last.d, entry: r2(t.entry), exit: r2(last.c), qty: t.qty,
      pnl: r2(proceeds - t.cost), pct: r2((proceeds / t.cost - 1) * 100), days: D.cs.length - 1 - t.entryIdx, why: 'مفتوحة لآخر يوم', added: t.added });
    cash += proceeds;
  }
  return Object.assign({ trades, equity, options: o }, summarize(trades, equity, o));
}

function summarize(trades, equity, o) {
  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl <= 0);
  const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  let streak = 0, worst = 0;
  for (const t of trades.slice().sort((a, b) => (a.exitDate < b.exitDate ? -1 : 1))) { if (t.pnl <= 0) { streak++; worst = Math.max(worst, streak); } else streak = 0; }
  let peak = -Infinity, mdd = 0;
  for (const e of equity) { peak = Math.max(peak, e.v); if (peak > 0) mdd = Math.max(mdd, (peak - e.v) / peak); }
  // كل سنة لوحدها: صافى الربح قبل وبعد الضريبة
  const byYear = {};
  for (const t of trades) {
    const y = t.exitDate.slice(0, 4);
    const b = byYear[y] || (byYear[y] = { year: y, trades: 0, wins: 0, pnl: 0 });
    b.trades++; if (t.pnl > 0) b.wins++; b.pnl += t.pnl;
  }
  let tax = 0;
  const years = Object.values(byYear).sort((a, b) => (a.year < b.year ? -1 : 1)).map((b) => {
    const t = b.pnl > 0 ? b.pnl * o.taxPct / 100 : 0; tax += t;
    return { year: b.year, trades: b.trades, winRate: r2(b.wins / b.trades * 100), pnl: r2(b.pnl), tax: r2(t), net: r2(b.pnl - t),
      returnPct: r2((b.pnl - t) / o.capital * 100) };
  });
  const gross = trades.reduce((s, t) => s + t.pnl, 0);
  return {
    summary: {
      trades: trades.length,
      winRate: trades.length ? r2(wins.length / trades.length * 100) : null,
      avgWinPct: r2(avg(wins.map((t) => t.pct))),
      avgLossPct: r2(avg(losses.map((t) => t.pct))),
      avgDays: r2(avg(trades.map((t) => t.days))),
      pnl: r2(gross), tax: r2(tax), net: r2(gross - tax),
      totalReturnPct: r2((gross - tax) / o.capital * 100),
      maxDrawdownPct: r2(mdd * 100),
      worstLosingStreak: worst,
      from: equity.length ? equity[0].d : null, to: equity.length ? equity[equity.length - 1].d : null,
    },
    byYear: years,
  };
}

/** الشراء والاحتفاظ: نفس المبلغ مقسوم بالتساوى على الأسهم من أول يوم ليها لآخر يوم، بالعمولات. */
function buyAndHold(series, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {}); const fee = o.feePct / 100;
  const syms = Object.keys(series || {}).filter((s) => (series[s] || []).length > 1);
  if (!syms.length) return null;
  const each = o.capital / syms.length;
  let end = 0;
  const per = syms.map((s) => {
    const cs = series[s].map(norm).sort((a, b) => (a.d < b.d ? -1 : 1));
    const v = each * (1 - fee) * cs[cs.length - 1].c / cs[0].o * (1 - fee);
    end += v;
    return { symbol: s, from: cs[0].d, to: cs[cs.length - 1].d, returnPct: r2((v / each - 1) * 100) };
  });
  return { returnPct: r2((end / o.capital - 1) * 100), per };
}

/** عائد مؤشر (EGX30) فى نفس الفترة */
function indexReturn(rows, from, to) {
  const cs = (rows || []).map(norm).filter((x) => x.d >= (from || '') && (!to || x.d <= to) && x.c > 0).sort((a, b) => (a.d < b.d ? -1 : 1));
  if (cs.length < 2) return null;
  return { from: cs[0].d, to: cs[cs.length - 1].d, returnPct: r2((cs[cs.length - 1].c / cs[0].c - 1) * 100) };
}

module.exports = { runBacktest, buyAndHold, indexReturn, DEFAULTS, signalAt, exitFor };
