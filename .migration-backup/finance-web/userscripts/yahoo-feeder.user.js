// ==UserScript==
// @name         EGX Swing: Yahoo feeder
// @namespace    https://finance.oscardevs.com
// @version      1.0.1
// @updateURL    https://finance.oscardevs.com/userscripts/yahoo-feeder.user.js
// @downloadURL  https://finance.oscardevs.com/userscripts/yahoo-feeder.user.js
// @description  يقرا أسعار أسهم البورصة المصرية من Yahoo Finance (وتاب Yahoo مفتوح) ويبعتها لـ finance.oscardevs.com. مابينفّذش أى صفقة.
// @match        https://finance.yahoo.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      finance.oscardevs.com
// @connect      query1.finance.yahoo.com
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  if (window.top !== window.self) return;

  var DEF_SERVER = 'https://finance.oscardevs.com';
  function server() { return String(GM_getValue('server', DEF_SERVER)).replace(/\/+$/, ''); }
  function apiKey() { return GM_getValue('apiKey', ''); }
  GM_registerMenuCommand('Set server URL', function () { var v = prompt('Server URL', server()); if (v) GM_setValue('server', v.trim()); });
  GM_registerMenuCommand('Set API key', function () { var v = prompt('API key (FINANCE_INGEST_KEY)', apiKey()); if (v != null) GM_setValue('apiKey', v.trim()); });
  GM_registerMenuCommand('Run daily candles now', function () { GM_setValue('lastDailyRun', ''); tick(true); });

  var st = { last: GM_getValue('lastOk', ''), count: 0, err: '' };
  var badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;background:#0b6e4f;color:#fff;font:12px/1.5 Tahoma,sans-serif;' +
    'padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);direction:rtl;max-width:320px';
  document.documentElement.appendChild(badge);
  function show() {
    badge.style.background = st.err ? '#b42318' : '#0b6e4f';
    badge.textContent = 'EGX feeder · آخر نجاح: ' + (st.last || 'لسه') + ' · ' + st.count + ' سهم' + (st.err ? ' · خطأ: ' + st.err : '');
  }
  show();

  function req(method, url, body, headers) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: method, url: url, data: body ? JSON.stringify(body) : undefined, timeout: 30000,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
        onload: function (r) { if (r.status >= 200 && r.status < 300) { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error('bad json')); } } else { var e = new Error('HTTP ' + r.status); e.status = r.status; reject(e); } },
        onerror: function () { reject(new Error('network')); }, ontimeout: function () { reject(new Error('timeout')); },
      });
    });
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // وقت القاهرة
  function cairo() {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { iso: p.year + '-' + p.month + '-' + p.day, wd: p.weekday, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  }
  function hm(s) { var a = String(s).split(':'); return Number(a[0]) * 60 + Number(a[1] || 0); }
  var market = { open: '10:00', close: '14:30', daily_after: '14:45' };
  function tradingDay(c) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].indexOf(c.wd) >= 0; }

  var backoffUntil = 0;
  function chartUrl(sym, range, interval) {
    return 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym + '.CA') + '?range=' + range + '&interval=' + interval;
  }

  async function quotes(symbols) {
    var out = [];
    for (var i = 0; i < symbols.length; i++) {
      try {
        var j = await req('GET', chartUrl(symbols[i], '1d', '5m'));
        var r = j && j.chart && j.chart.result && j.chart.result[0];
        var ts = r && r.timestamp || [], cl = r && r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close || [];
        for (var k = ts.length - 1; k >= 0; k--) { if (cl[k] != null) { out.push({ symbol: symbols[i], price: cl[k], quote_ts: new Date(ts[k] * 1000).toISOString() }); break; } }
        if (!out.length || out[out.length - 1].symbol !== symbols[i]) {
          var mp = r && r.meta && r.meta.regularMarketPrice; if (mp) out.push({ symbol: symbols[i], price: mp, quote_ts: new Date((r.meta.regularMarketTime || 0) * 1000).toISOString() });
        }
      } catch (e) {
        console.warn('[EGX feeder] quote', symbols[i], e.message);
        if (e.status === 429) { backoffUntil = Date.now() + 15 * 60000; st.err = 'Yahoo قال 429، هستنى ١٥ دقيقة'; break; }
      }
      await sleep(1000);
    }
    return out;
  }

  async function candles(symbols) {
    var batches = [];
    for (var i = 0; i < symbols.length; i++) {
      try {
        var j = await req('GET', chartUrl(symbols[i], '9mo', '1d'));
        var r = j && j.chart && j.chart.result && j.chart.result[0];
        var ts = r && r.timestamp || [], q = r && r.indicators && r.indicators.quote && r.indicators.quote[0] || {};
        var rows = [];
        for (var k = 0; k < ts.length; k++) {
          if (q.close == null || q.close[k] == null || q.high[k] == null || q.low[k] == null) continue;
          var d = new Date((ts[k] + 2 * 3600) * 1000).toISOString().slice(0, 10);   // تاريخ الجلسة بتوقيت القاهرة تقريباً
          rows.push({ trade_date: d, open: q.open[k], high: q.high[k], low: q.low[k], close: q.close[k], volume: q.volume ? q.volume[k] : null });
        }
        if (rows.length) batches.push({ symbol: symbols[i], rows: rows });
      } catch (e) {
        console.warn('[EGX feeder] candles', symbols[i], e.message);
        if (e.status === 429) { backoffUntil = Date.now() + 30 * 60000; st.err = 'Yahoo قال 429'; break; }
      }
      await sleep(1000);
    }
    // دفعات صغيرة للسيرفر
    for (var b = 0; b < batches.length; b += 5) await req('POST', server() + '/api/ingest/candles', batches.slice(b, b + 5), { 'X-API-Key': apiKey() });
    return batches.length;
  }

  var running = false;
  async function tick(force) {
    if (running || Date.now() < backoffUntil) return;
    if (!apiKey()) { st.err = 'حط المفتاح من قايمة Tampermonkey: Set API key'; show(); return; }
    running = true;
    try {
      var wl = await req('GET', server() + '/api/watchlist');
      if (wl.market) market = wl.market;
      var symbols = wl.symbols || [];
      st.count = symbols.length; st.err = '';
      var c = cairo();
      var inMarket = tradingDay(c) && c.min >= hm(market.open) && c.min <= hm(market.close);
      var lastQuote = Number(GM_getValue('lastQuoteRun', 0));
      if (inMarket && (force || Date.now() - lastQuote >= 10 * 60000)) {
        var qs = [];
        for (var i = 0; i < symbols.length; i += 5) qs = qs.concat(await quotes(symbols.slice(i, i + 5)));
        if (qs.length) await req('POST', server() + '/api/ingest/quotes', qs, { 'X-API-Key': apiKey() });
        GM_setValue('lastQuoteRun', Date.now());
      }
      var last = GM_getValue('lastDailyRun', '');
      if (!last || (tradingDay(c) && c.min >= hm(market.daily_after) && last !== c.iso)) {
        await candles(symbols);
        GM_setValue('lastDailyRun', c.iso);
      }
      st.last = new Date().toLocaleTimeString('ar-EG', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit' });
      GM_setValue('lastOk', st.last);
    } catch (e) {
      st.err = e.message; console.warn('[EGX feeder]', e);
      backoffUntil = Date.now() + 5 * 60000;
    } finally { running = false; show(); }
  }

  tick();
  setInterval(tick, 60000);
})();
