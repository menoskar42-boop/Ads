// اختبار نظام الترشيحات على الشموع القديمة (src/finance/backtest.js): من غير ما يشوف المستقبل، والخروج بالوقف/الهدف،
// والعمولات، والبدائل بتغيّر النتيجة. بيانات مصطنعة (اتجاه صاعد بتذبذب) — الأرقام الحقيقية من صفحة finance.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/finance/backtest');

// سهم صاعد بموجات: الإقفال بيطلع ويرجع للمتوسط كل كام جلسة (فيدخل منطقة الشراء)
function wavy(n, seed, start) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = []; const d0 = Date.parse((start || '2021-01-03') + 'T00:00:00Z');
  let c = 100;
  for (let i = 0; i < n; i++) {
    c = Math.max(5, c * (1 + 0.0015 + 0.03 * Math.sin(i / 4) * 0.4 + (rnd() - 0.5) * 0.03));
    const o = c * (1 + (rnd() - 0.5) * 0.01);
    out.push({ trade_date: new Date(d0 + i * 86400000).toISOString().slice(0, 10), open: o, high: Math.max(o, c) * (1 + rnd() * 0.015),
      low: Math.min(o, c) * (1 - rnd() * 0.015), close: c, volume: 1000 });
  }
  return out;
}

const SERIES = { AAA: wavy(500, 7), BBB: wavy(500, 11), CCC: wavy(500, 23) };

test('the current system produces trades on a trending series, with sane stats', () => {
  const r = B.runBacktest(SERIES);
  assert.ok(r.summary.trades > 0, 'expected some trades');
  assert.ok(r.summary.winRate >= 0 && r.summary.winRate <= 100);
  assert.equal(r.byYear.reduce((n, y) => n + y.trades, 0), r.summary.trades);
  for (const t of r.trades) {
    assert.ok(t.entryDate <= t.exitDate);
    assert.ok(['الوقف', 'الهدف', 'وقف عند الدخول', 'مفتوحة لآخر يوم'].includes(t.why), t.why);
  }
});

test('no look-ahead: cutting the future does not change earlier trades', () => {
  const full = B.runBacktest(SERIES);
  const cut = {};
  for (const [k, v] of Object.entries(SERIES)) cut[k] = v.slice(0, 350);
  const part = B.runBacktest(cut);
  const lastDay = SERIES.AAA[349].trade_date;
  const closed = (r) => r.trades.filter((t) => t.exitDate < lastDay && t.why !== 'مفتوحة لآخر يوم')
    .map((t) => [t.symbol, t.entryDate, t.exitDate, t.entry, t.exit].join('|'));
  assert.deepEqual(closed(part), closed(full));
});

test('entry is the next day open after the signal, and one trade per symbol at a time', () => {
  const r = B.runBacktest(SERIES);
  for (const sym of Object.keys(SERIES)) {
    const ts = r.trades.filter((t) => t.symbol === sym).sort((a, b) => (a.entryDate < b.entryDate ? -1 : 1));
    for (let k = 1; k < ts.length; k++) assert.ok(ts[k].entryDate >= ts[k - 1].exitDate, `${sym} overlapping trades`);
    for (const t of ts) {
      const day = SERIES[sym].find((c) => c.trade_date === t.entryDate);
      assert.equal(t.entry, Math.round(day.open * 100) / 100);
    }
  }
});

test('stop wins when both stop and target are hit the same day; gaps fill at the open', () => {
  const t = { entry: 100, stop: 90, target: 120 };
  assert.deepEqual(B.exitFor(t, { o: 100, h: 130, l: 80, c: 100 }), { exit: 90, why: 'الوقف' });
  assert.deepEqual(B.exitFor(t, { o: 85, h: 86, l: 84, c: 85 }), { exit: 85, why: 'الوقف' });       // فجوة تحت الوقف
  assert.deepEqual(B.exitFor(t, { o: 125, h: 126, l: 124, c: 125 }), { exit: 125, why: 'الهدف' });  // فجوة فوق الهدف
  assert.deepEqual(B.exitFor(t, { o: 101, h: 121, l: 99, c: 110 }), { exit: 120, why: 'الهدف' });
  assert.deepEqual(B.exitFor(t, { o: 101, h: 110, l: 95, c: 105 }), { exit: null, why: null });
  assert.equal(B.exitFor({ entry: 100, stop: 100, target: 120 }, { o: 101, h: 102, l: 99, c: 100 }).why, 'وقف عند الدخول');
});

test('fees and tax reduce the result', () => {
  const free = B.runBacktest(SERIES, { feePct: 0, taxPct: 0 });
  const paid = B.runBacktest(SERIES, { feePct: 0.25, taxPct: 10 });
  assert.ok(paid.summary.pnl <= free.summary.pnl);
  assert.ok(paid.summary.net <= paid.summary.pnl);
});

test('alternatives plug into the same engine', () => {
  const base = B.runBacktest(SERIES);
  const slope = B.runBacktest(SERIES, { slope: true });
  const trend = B.runBacktest(SERIES, { trendStart: true });
  const atr = B.runBacktest(SERIES, { atrStop: true });
  const pyr = B.runBacktest(SERIES, { pyramid: true });
  // الشروط الزيادة مابتزوّدش الصفقات
  assert.ok(slope.summary.trades <= base.summary.trades);
  assert.ok(trend.summary.trades <= base.summary.trades);
  // الوقف ٢ ATR بيغيّر الصفقات/النتيجة
  assert.notDeepEqual(atr.trades.map((t) => t.exit), base.trades.map((t) => t.exit));
  assert.ok(pyr.trades.every((t) => typeof t.added === 'boolean'));
});

test('buy & hold and index return', () => {
  const bh = B.buyAndHold(SERIES);
  assert.equal(bh.per.length, 3);
  const idx = B.indexReturn([{ trade_date: '2021-01-01', open: 10, high: 10, low: 10, close: 10 }, { trade_date: '2021-12-31', open: 12, high: 12, low: 12, close: 12 }]);
  assert.equal(idx.returnPct, 20);
});
