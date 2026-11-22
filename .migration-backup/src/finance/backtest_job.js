// تشغيل «اختبار النظام على البيانات التاريخية» على سيرفر finance: يجيب شموع ٥ سنين لأسهم قايمة المتابعة ومؤشر EGX30
// من Yahoo، ويشغّل النظام الحالى والبدائل الأربعة بنفس المحرّك (backtest.js)، ويخزّن النتيجة فى egx.backtest_runs.
// ⛔ مابيغيّرش أى شرط حى — قراءة بس.
'use strict';

const B = require('./backtest');
const yahoo = require('./yahoo');
const store = require('./store');

const VARIANTS = [
  { key: 'current', label: 'النظام الحالى', opts: {} },
  { key: 'slope', label: '(أ) ميل المتوسط ٢٠ طالع', opts: { slope: true } },
  { key: 'trendStart', label: '(ب) الدخول على بداية التحول الصاعد', opts: { trendStart: true } },
  { key: 'atrStop', label: '(ج) وقف ٢ ATR من الدخول', opts: { atrStop: true } },
  { key: 'pyramid', label: '(د) تعزيز المركز بقاعدة صارمة', opts: { pyramid: true } },
];

let running = null;

/** بيرجّع رقم التشغيلة؛ لو فيه تشغيلة شغّالة بيرجّع رقمها */
async function start(p, params, deps) {
  if (running) return running.id;
  deps = deps || {};
  const range = ['3y', '5y'].includes(params && params.range) ? params.range : '5y';
  const id = (await p.query(`INSERT INTO egx.backtest_runs(params) VALUES ($1) RETURNING id`, [JSON.stringify({ range })])).rows[0].id;
  running = { id };
  (async () => {
    try {
      const wl = await store.watchlist(p, false);
      const symbols = wl.map((w) => w.symbol);
      const got = await (deps.fetchCandles || yahoo.fetchCandles)(symbols, { range, delayMs: deps.delayMs });
      const series = {};
      for (const b of got.batches) series[b.symbol] = b.rows;
      const notes = [];
      if (got.errors.length) notes.push('أسهم ماجتش من Yahoo: ' + got.errors.slice(0, 10).join('، '));
      let index = null;
      try { index = await (deps.fetchIndex || yahoo.fetchIndexCandles)('^CASE30', range); } catch (e) { notes.push('مؤشر EGX30 ماجاش: ' + e.message); }
      const variants = VARIANTS.map((v) => {
        const r = B.runBacktest(series, v.opts);
        return { key: v.key, label: v.label, summary: r.summary, byYear: r.byYear, trades: v.key === 'current' ? r.trades : undefined };
      });
      const cur = variants[0].summary;
      const result = {
        symbols: Object.keys(series), range, notes, variants,
        buyAndHold: B.buyAndHold(series),
        egx30: index ? B.indexReturn(index, cur.from, cur.to) : null,
        assumptions: B.DEFAULTS,
        untested: 'شرط الأخبار مااتختبرش: مفيش أرشيف للإفصاحات القديمة، فالأخبار اتحسبت صفر.',
      };
      await p.query(`UPDATE egx.backtest_runs SET status='DONE', finished_ts=now(), result=$2 WHERE id=$1`, [id, JSON.stringify(result)]);
    } catch (e) {
      await p.query(`UPDATE egx.backtest_runs SET status='ERROR', finished_ts=now(), error=$2 WHERE id=$1`, [id, String(e.message || e).slice(0, 400)]).catch(() => {});
    } finally { running = null; }
  })();
  return id;
}

async function latest(p) {
  const r = (await p.query(`SELECT id, created_ts, finished_ts, status, params, result, error FROM egx.backtest_runs ORDER BY id DESC LIMIT 1`)).rows[0];
  return r || null;
}

module.exports = { start, latest, VARIANTS, isRunning: () => !!running };
