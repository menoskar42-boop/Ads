// finance.oscardevs.com: الحسابات الصافية (المستويات · العلامات · التنبيهات · الترتيب · التذكرة · تحليل الأخبار بموديل وهمى).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/finance/levels');
const A = require('../src/finance/analysis');

// شموع يومية مصطنعة: n يوم، close يبدأ من base ويزيد step، high = close + 1 و low = close - 1
function series(n, base, step, start) {
  const out = []; const d0 = Date.parse(start || '2026-01-01T00:00:00Z');
  for (let i = 0; i < n; i++) {
    const c = base + i * step;
    out.push({ trade_date: new Date(d0 + i * 86400000).toISOString().slice(0, 10), open_p: c, high_p: c + 1, low_p: c - 1, close_p: c });
  }
  return out;
}

test('levels math: support, resistance, sma, atr, zone, stop, targets', () => {
  const lv = L.computeLevels(series(60, 100, 0.5));
  // آخر ٢٠ close: من 120 لـ 129.5 ⇒ المتوسط 124.75
  assert.equal(lv.sma20, 124.75);
  assert.equal(lv.support, 119);            // أقل low فى آخر ٢٠ = 120 - 1
  assert.equal(lv.resistance20, 130.5);     // أعلى high = 129.5 + 1
  assert.equal(lv.resistance60, 130.5);
  assert.equal(lv.atr14, 2);
  assert.equal(lv.buy_lo, 123.75); assert.equal(lv.buy_hi, 125.75);
  assert.equal(lv.stop_loss, 118);
  assert.equal(lv.target1, 130.5); assert.equal(lv.target2, 130.5);
  assert.equal(lv.sma50, 117.25);
  assert.equal(lv.reliable, true); assert.deepEqual(lv.flags, []);
  assert.equal(lv.as_of, '2026-03-01');
});

test('flags: short history, split suspect, flat data', () => {
  assert.deepEqual(L.computeLevels(series(30, 100, 1)).flags, ['short_history']);
  const s = series(80, 100, 0); s[70].close_p = 140; // قفزة ٤٠٪
  const f = L.computeLevels(s).flags;
  assert.ok(f.includes('split_suspect')); assert.ok(!f.includes('short_history'));
  const flat = L.computeLevels(series(70, 50, 0));
  assert.ok(flat.flags.includes('flat_data')); assert.equal(flat.reliable, false);
  assert.equal(L.computeLevels([]), null);
});

test('alert rules: stop, buy zone, target1, unreliable gets none', () => {
  const lv = { reliable: true, stop_loss: 90, buy_lo: 98, buy_hi: 102, target1: 110 };
  assert.deepEqual(L.alertKinds(89, lv), ['STOP']);
  assert.deepEqual(L.alertKinds(100, lv), ['IN_BUY_ZONE']);
  assert.deepEqual(L.alertKinds(111, lv), ['TARGET1']);
  assert.deepEqual(L.alertKinds(105, lv), []);
  assert.deepEqual(L.alertKinds(89, Object.assign({}, lv, { reliable: false })), []);
});

test('ranking order: technical + news + fouda, unreliable last, breakdown explained', () => {
  const base = { reliable: true, stop_loss: 90, buy_lo: 98, buy_hi: 102, atr14: 4, sma20: 100, sma50: 95, target1: 110 };
  const rows = L.rank([
    { symbol: 'AAA', price: 120, levels: base, news: 0 },                       // فوق بأكتر من ATR: 0 +1 = 1
    { symbol: 'BBB', price: 100, levels: base, news: 1 },                       // جوّه: 2 +1 +1 = 4
    { symbol: 'CCC', price: 104, levels: base, news: 0, fouda_score: 50 },      // +1 +1 +1 = 3
    { symbol: 'DDD', price: 100, levels: Object.assign({}, base, { reliable: false }), news: 3 },
    { symbol: 'EEE', price: 89, levels: base, news: -3 },                       // -2 +1 -3 = -4
  ]);
  assert.deepEqual(rows.map((r) => r.symbol), ['BBB', 'CCC', 'AAA', 'EEE', 'DDD']);
  assert.equal(rows[0].composite, 4);
  assert.ok(rows[0].breakdown.some((p) => p.label.includes('جو') && p.points === 2));
  assert.equal(L.newsScore([{ published_date: '2026-11-01', impact_score: 2 }, { published_date: '2026-11-05', impact_score: 2 },
    { published_date: '2026-10-01', impact_score: 2 }], '2026-11-10'), 3);
});

test('ticket quantity math and cash cap', () => {
  const lv = { buy_hi: 10, stop_loss: 9, target1: 12, target2: 14 };
  const t = L.ticket(lv, 10000, 1);       // مخاطرة 100 جنيه ÷ 1 = 100 سهم، التكلفة 1000
  assert.equal(t.quantity, 100); assert.equal(t.cost, 1000); assert.equal(t.risk_egp, 100);
  assert.equal(t.rr1, 2); assert.equal(t.rr2, 4); assert.equal(t.capped_by_cash, false);
  const capped = L.ticket({ buy_hi: 10, stop_loss: 9.9, target1: 11 }, 1000, 5); // 50 ÷ 0.1 = 500 سهم بس الكاش يكفى 100
  assert.equal(capped.quantity, 100); assert.equal(capped.capped_by_cash, true); assert.ok(capped.cost <= 1000);
  assert.equal(L.ticket(lv, 0, 1).ok, false);
  assert.equal(L.ticket({ buy_hi: 9, stop_loss: 10 }, 1000, 1).ok, false);
});

test('market hours: Cairo, Sunday to Thursday', () => {
  // 2026-11-10 الثلاثاء 09:00 UTC = 11:00 القاهرة
  assert.equal(L.marketOpen(new Date('2026-11-10T09:00:00Z'), '10:00', '14:30'), true);
  assert.equal(L.marketOpen(new Date('2026-11-10T13:00:00Z'), '10:00', '14:30'), false);   // 15:00
  assert.equal(L.marketOpen(new Date('2026-11-13T09:00:00Z'), '10:00', '14:30'), false);   // الجمعة
});

test('analysis JSON validation with a fake model (retry once, then unknown)', async () => {
  const good = JSON.stringify({ sentiment: 'positive', impact_score: 2, event_type: 'dividend', summary_ar: 'توزيع أرباح نقدية.', key_facts: ['1 جنيه للسهم'] });
  let calls = 0;
  const r = await A.analyzeDisclosure('توزيع', 'نص', 'شركة', { callModel: async () => (++calls === 1 ? 'مش JSON' : good) });
  assert.equal(calls, 2); assert.equal(r.sentiment, 'positive'); assert.equal(r.impact_score, 2); assert.deepEqual(r.key_facts, ['1 جنيه للسهم']);
  const bad = await A.analyzeDisclosure('x', 'y', 'z', { callModel: async () => '{"sentiment":"great","impact_score":9}' });
  assert.equal(bad.sentiment, 'unknown');
  assert.equal((await A.analyzeDisclosure('x', 'y', 'z', { env: {} })).sentiment, 'unknown');
  assert.equal(A.validate({ sentiment: 'neutral', impact_score: 0, event_type: 'weird', summary_ar: 'x' }).event_type, 'other');
  assert.equal(A.provider({ DEEPSEEK_API_KEY: 'k', OPENAI_API_KEY: 'o' }).name, 'deepseek');
  assert.equal(A.provider({ OPENAI_API_KEY: 'o' }).model, 'gpt-4o-mini');
});

// المرحلة ٢: الترشيحات بالقواعد + محفظة الديمو
const S = require('../src/finance/signals');
const Sim = require('../src/finance/sim');

test('RSI and volume ratio', () => {
  assert.equal(S.rsi14([1, 2, 3]), null);
  assert.equal(S.rsi14(Array.from({ length: 30 }, (_, i) => 10 + i)), 100);           // طالع على طول
  const zig = Array.from({ length: 40 }, (_, i) => 10 + (i % 2));
  assert.ok(Math.abs(S.rsi14(zig) - 50) < 5);
  const v = Array.from({ length: 21 }, (_, i) => ({ volume: i === 20 ? 3000 : 1000 }));
  assert.equal(S.volumeRatio(v), 3);
});

test('buy signal only when everything lines up, with reasons', () => {
  const lv = { reliable: true, buy_lo: 98, buy_hi: 102, sma20: 100, sma50: 95, stop_loss: 94, target1: 115, target2: 120, atr14: 4 };
  const s = S.buySignal({ price: 100, levels: lv, rsi: 50, news: 1, volRatio: 2, fundamental: { profit_growth_pct: 30 } });
  assert.equal(s.side, 'BUY'); assert.equal(s.price, 100); assert.equal(s.rr1, 2.5); assert.equal(s.strength, 4);
  assert.ok(s.reasons.some((r) => r.includes('جوّه منطقة الشراء'))); assert.ok(s.reasons.some((r) => r.includes('صافى الربح زاد 30٪')));
  assert.equal(S.buySignal({ price: 104, levels: lv, rsi: 50 }), null);                       // برّه المنطقة
  assert.equal(S.buySignal({ price: 100, levels: Object.assign({}, lv, { sma20: 90 }), rsi: 50 }), null);   // اتجاه هابط
  assert.equal(S.buySignal({ price: 100, levels: lv, rsi: 75 }), null);                       // متشبّع
  assert.equal(S.buySignal({ price: 100, levels: lv, rsi: 50, news: -1 }), null);             // أخبار سلبية
  assert.equal(S.buySignal({ price: 100, levels: Object.assign({}, lv, { target1: 105, target2: 106 }), rsi: 50 }), null);  // العائد قليل
  const far = S.buySignal({ price: 100, levels: Object.assign({}, lv, { target1: 105, target2: 112 }), rsi: 50 });          // الهدف التانى بيدّى ٢
  assert.equal(far.target1, 112); assert.equal(far.rr1, 2); assert.ok(far.reasons.some((r) => r.includes('٦٠ جلسة')));
  assert.equal(S.buySignal({ price: 100, levels: lv, rsi: 50, holding: true }), null);
  assert.equal(S.buySignal({ price: 100, levels: Object.assign({}, lv, { reliable: false }), rsi: 50 }), null);
});

test('sell signal: danger first, then trend, then take profit', () => {
  const lv = { buy_lo: 98, buy_hi: 102, sma20: 100, sma50: 95, stop_loss: 94, target1: 115 };
  const pos = { qty: 10, avg_cost: 100 };
  const d = S.sellSignal({ price: 93, levels: lv, position: pos });
  assert.equal(d.kind, 'DANGER'); assert.equal(d.qty, 10); assert.ok(d.reasons[0].includes('خسارة 7٪'));
  assert.equal(S.sellSignal({ price: 100, levels: lv, position: pos, news: -2 }).kind, 'DANGER');
  assert.equal(S.sellSignal({ price: 96, levels: Object.assign({}, lv, { sma20: 97, sma50: 99 }), position: pos }).kind, 'TREND');
  assert.equal(S.sellSignal({ price: 116, levels: lv, position: pos }).kind, 'TAKE_PROFIT');
  assert.equal(S.sellSignal({ price: 105, levels: lv, position: pos }), null);
  assert.equal(S.sellSignal({ price: 93, levels: lv, position: null }), null);
  assert.equal(S.qtyFor(1000, 13.3), 75);
});

test('demo portfolio: limit fills, exits cancel each other, P/L and win rate', () => {
  const buy = { side: 'BUY', type: 'LIMIT', price: 10, qty: 100, status: 'OPEN' };
  assert.equal(Sim.fillPrice(buy, 10.5), null);
  assert.equal(Sim.fillPrice(buy, 9.9), 9.9);
  let acc = { cash: 100000, start_cash: 100000 };
  const f = Sim.applyFill(acc, null, buy, 9.9);
  assert.equal(f.cash, 99010); assert.deepEqual(f.position, { qty: 100, avg_cost: 9.9 });
  const ex = Sim.exitOrders('COMI', 100, 9, 12);
  assert.equal(ex.length, 2); assert.equal(ex[0].oco, ex[1].oco);
  const stop = Object.assign({ status: 'OPEN' }, ex[0]), tp = Object.assign({ status: 'OPEN' }, ex[1]);
  assert.equal(Sim.fillPrice(stop, 9.5), null); assert.equal(Sim.fillPrice(tp, 12.2), 12.2);
  const s = Sim.applyFill({ cash: f.cash }, f.position, tp, 12.2);
  assert.equal(s.cash, 99010); assert.equal(s.proceeds, 1220); assert.equal(s.position, null); assert.equal(s.trade.pnl, 230);   // الفلوس T+2
  assert.equal(Sim.applyFill({ cash: 50 }, null, buy, 10).error, 'no_cash');
  const p = Sim.performance({ cash: 99010, start_cash: 100000 }, [], {}, [s.trade, { side: 'SELL', pnl: -50 }], 1220);
  // T+2: الأحد للخميس (الخميس + ٢ = الاتنين · الأحد + ٢ = التلات)
  assert.equal(Sim.addTradingDays('2026-11-12', 2), '2026-11-16');
  assert.equal(Sim.addTradingDays('2026-11-08', 2), '2026-11-10');
  assert.equal(Sim.addTradingDays('2026-11-13', 2), '2026-11-16');   // بيع يوم جمعة (مش هيحصل) يتحسب من الأحد
  assert.equal(p.value, 100230); assert.equal(p.return_pct, 0.23); assert.equal(p.win_rate, 50); assert.equal(p.realized, 180);
});

test('Yahoo chart parsing: last non-empty 5m close, daily candles in Cairo date', () => {
  const Y = require('../src/finance/yahoo');
  const q = Y.parseQuote({ chart: { result: [{ meta: { regularMarketPrice: 9 }, timestamp: [1794560400, 1794560700], indicators: { quote: [{ close: [12.5, null] }] } }] } });
  assert.deepEqual(q, { price: 12.5, quote_ts: new Date(1794560400 * 1000).toISOString() });
  assert.equal(Y.parseQuote({ chart: { result: [{ meta: { regularMarketPrice: 9, regularMarketTime: 1 }, timestamp: [], indicators: { quote: [{}] } }] } }).price, 9);
  assert.equal(Y.parseQuote({}), null);
  const c = Y.parseCandles({ chart: { result: [{ timestamp: [1794556800], indicators: { quote: [{ open: [1], high: [2], low: [0.5], close: [1.5], volume: [100] }] } }] } });
  assert.deepEqual(c, [{ trade_date: '2026-11-13', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }]);
});
