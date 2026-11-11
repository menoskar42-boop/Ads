// الأسعار من Yahoo Finance من السيرفر نفسه (من غير Tampermonkey): endpoint الرسم v8 (من غير مفتاح).
// سهم سهم وبينهم ثانية، ولو Yahoo رجّع 429 بنقف ونستنى. لو Yahoo منع السيرفر خالص، سكربت Tampermonkey فاضل احتياطى.
'use strict';

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * آخر سعر من رد الرسم: الأحدث بين آخر شمعة مش فاضية وregularMarketPrice.
 * (٢٠٢٦-١١-١١: بيانات الـ٥ دقايق بتاعة Yahoo للبورصة المصرية واقفة من ٢٣ يوليو، فالأحدث هو اللى بيكسب،
 * والقديم بيترفض فى fetchQuotes وingestQuotes.)
 */
function parseQuote(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r) return null;
  const cands = [];
  const ts = r.timestamp || [];
  const cl = (r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close) || [];
  for (let k = ts.length - 1; k >= 0; k--) if (cl[k] != null) { cands.push({ price: cl[k], t: ts[k] }); break; }
  const m = r.meta || {};
  if (m.regularMarketPrice && m.regularMarketTime) cands.push({ price: m.regularMarketPrice, t: m.regularMarketTime });
  if (!cands.length) return null;
  const best = cands.sort((a, b) => b.t - a.t)[0];
  return { price: best.price, quote_ts: new Date(best.t * 1000).toISOString() };
}

/** السعر قديم؟ (أكتر من يومين من ساعة الجلب) */
const STALE_MS = 2 * 86400000;
function isStale(q, now) { return !q || !q.quote_ts || (now || new Date()) - new Date(q.quote_ts) > STALE_MS; }

/** الشموع اليومية: التاريخ بتوقيت القاهرة (UTC+2 أو +3 صيفاً، والجلسة الصبح فالتاريخ مابيتغيّرش). */
function parseCandles(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r) return [];
  const ts = r.timestamp || []; const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
  const out = [];
  for (let k = 0; k < ts.length; k++) {
    if (!q.close || q.close[k] == null || q.high[k] == null || q.low[k] == null) continue;
    out.push({ trade_date: new Date((ts[k] + 3 * 3600) * 1000).toISOString().slice(0, 10), open: q.open ? q.open[k] : q.close[k],
      high: q.high[k], low: q.low[k], close: q.close[k], volume: q.volume ? q.volume[k] : null });
  }
  return out;
}

async function getJson(sym, range, interval, fetchImpl) {
  const f = fetchImpl || fetch;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await f(`${BASE}${encodeURIComponent(sym + '.CA')}?range=${range}&interval=${interval}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) { const e = new Error('yahoo HTTP ' + res.status); e.status = res.status; throw e; }
    return await res.json();
  } finally { clearTimeout(t); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** أسعار قايمة كاملة. بيرجّع {quotes, errors, blocked}. */
async function fetchQuotes(symbols, opts) {
  opts = opts || {};
  const quotes = [], errors = [];
  for (const s of symbols) {
    try {
      // يومى (الشمعة بتاعة النهارده بتتحدّث وقت السوق) بدل الـ٥ دقايق اللى واقفة
      const q = parseQuote(await getJson(s, '5d', '1d', opts.fetch));
      if (q && isStale(q, opts.now)) errors.push(`${s}: سعر قديم من ${q.quote_ts.slice(0, 10)}`);
      else if (q) quotes.push(Object.assign({ symbol: s }, q));
    }
    catch (e) { errors.push(s + ': ' + e.message); if (e.status === 429 || e.status === 401 || e.status === 403) return { quotes, errors, blocked: e.status }; }
    if (opts.delayMs !== 0) await sleep(opts.delayMs || 1000);
  }
  return { quotes, errors, blocked: null };
}

async function fetchCandles(symbols, opts) {
  opts = opts || {};
  const batches = [], errors = [];
  for (const s of symbols) {
    try { const rows = parseCandles(await getJson(s, opts.range || '1y', '1d', opts.fetch)); if (rows.length) batches.push({ symbol: s, rows }); }
    catch (e) { errors.push(s + ': ' + e.message); if (e.status === 429 || e.status === 401 || e.status === 403) return { batches, errors, blocked: e.status }; }
    if (opts.delayMs !== 0) await sleep(opts.delayMs || 1000);
  }
  return { batches, errors, blocked: null };
}

module.exports = { parseQuote, parseCandles, fetchQuotes, fetchCandles, isStale, STALE_MS };
