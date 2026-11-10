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
