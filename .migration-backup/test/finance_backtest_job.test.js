// تشغيل الاختبار التاريخى على السيرفر: بيجيب الشموع (وهمية هنا) ويشغّل النظام الحالى والبدائل الأربعة ويخزّن النتيجة.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const job = require('../src/finance/backtest_job');

function wavy(n, seed) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out = []; const d0 = Date.parse('2021-01-03T00:00:00Z'); let c = 100;
  for (let i = 0; i < n; i++) {
    c = Math.max(5, c * (1 + 0.0015 + 0.012 * Math.sin(i / 4) + (rnd() - 0.5) * 0.03));
    const o = c * (1 + (rnd() - 0.5) * 0.01);
    out.push({ trade_date: new Date(d0 + i * 86400000).toISOString().slice(0, 10), open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: c, volume: 1 });
  }
  return out;
}

test('backtest job: 5 variants, buy & hold, EGX30, stored as DONE', async () => {
  const runs = [];
  const pool = { query: async (sql, params) => {
    if (/INSERT INTO egx.backtest_runs/.test(sql)) { runs.push({ id: runs.length + 1, status: 'RUNNING', params: params[0] }); return { rows: [{ id: runs.length }] }; }
    if (/FROM egx.watchlist/.test(sql)) return { rows: [{ symbol: 'AAA' }, { symbol: 'BBB' }] };
    if (/status='DONE'/.test(sql)) { Object.assign(runs[params[0] - 1], { status: 'DONE', result: JSON.parse(params[1]) }); return { rows: [] }; }
    if (/status='ERROR'/.test(sql)) { Object.assign(runs[params[0] - 1], { status: 'ERROR', error: params[1] }); return { rows: [] }; }
    return { rows: [] };
  } };
  const id = await job.start(pool, { range: '5y' }, {
    fetchCandles: async (syms) => ({ batches: syms.map((s, k) => ({ symbol: s, rows: wavy(400, 7 + k) })), errors: [], blocked: null }),
    fetchIndex: async () => wavy(400, 99),
  });
  for (let i = 0; i < 100 && job.isRunning(); i++) await new Promise((r) => setTimeout(r, 20));
  const run = runs[id - 1];
  assert.equal(run.status, 'DONE', run.error);
  assert.deepEqual(run.result.variants.map((v) => v.key), ['current', 'slope', 'trendStart', 'atrStop', 'pyramid']);
  assert.ok(Array.isArray(run.result.variants[0].trades));
  assert.equal(run.result.variants[1].trades, undefined);
  assert.ok(run.result.buyAndHold && run.result.egx30);
  assert.match(run.result.untested, /الأخبار/);
});
