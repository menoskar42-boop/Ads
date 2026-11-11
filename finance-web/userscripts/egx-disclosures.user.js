// ==UserScript==
// @name         EGX Swing: EGX disclosures
// @namespace    https://finance.oscardevs.com
// @version      1.3.0
// @updateURL    https://finance.oscardevs.com/userscripts/egx-disclosures.user.js
// @downloadURL  https://finance.oscardevs.com/userscripts/egx-disclosures.user.js
// @description  الأسعار من جدول «جميع الأسهم» فى موقع البورصة المصرية كل دقيقتين وقت السوق، والإفصاحات الجديدة من صفحة البحث فى الأخبار، ويبعتهم لـ finance.oscardevs.com. وطول ما موقعنا مفتوح، بيفتح الصفحتين لو مش مفتوحين.
// @match        https://www.egx.com.eg/ar/NewsSearch.aspx*
// @match        https://www.egx.com.eg/ar/prices.aspx*
// @match        https://www.egx.com.eg/en/prices.aspx*
// @match        https://finance.oscardevs.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_openInTab
// @connect      finance.oscardevs.com
// @connect      www.egx.com.eg
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// @noframes
// ==/UserScript==
(function () {
  'use strict';
  var DEF_SERVER = 'https://finance.oscardevs.com';
  function server() { return String(GM_getValue('server', DEF_SERVER)).replace(/\/+$/, ''); }
  function apiKey() { return GM_getValue('apiKey', ''); }
  GM_registerMenuCommand('Set server URL', function () { var v = prompt('Server URL', server()); if (v) GM_setValue('server', v.trim()); });
  GM_registerMenuCommand('Set API key', function () { var v = prompt('API key (FINANCE_INGEST_KEY)', apiKey()); if (v != null) GM_setValue('apiKey', v.trim()); });

  var EGX_URL = 'https://www.egx.com.eg/ar/NewsSearch.aspx';
  var PRICES_URL = 'https://www.egx.com.eg/ar/prices.aspx';
  var TRADING = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'];
  /** وقت صفحة الأسعار: أيام التداول من ٩:٥٥ لـ ٢:٣٥ بتوقيت القاهرة */
  function pricesTime() { var c = cairo(); return TRADING.indexOf(c.wd) >= 0 && c.min >= hm('09:55') && c.min <= hm('14:35'); }
  GM_registerMenuCommand('Set EGX search page URL', function () { var v = prompt('EGX search page URL', GM_getValue('egxUrl', EGX_URL)); if (v) GM_setValue('egxUrl', v.trim()); });

  var badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;background:#0b6e4f;color:#fff;font:12px/1.5 Tahoma,sans-serif;' +
    'padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);direction:rtl;max-width:340px';
  document.documentElement.appendChild(badge);
  var IS_PRICES = /\/prices\.aspx$/i.test(location.pathname);
  function show(t, bad) { badge.style.background = bad ? '#b42318' : '#0b6e4f'; badge.textContent = (IS_PRICES ? 'EGX أسعار · ' : 'EGX · ') + t; }

  /*
   * على موقعنا (finance.oscardevs.com): طول ما التاب مفتوح، كل دقيقة بنشوف صفحة البحث فى أخبار البورصة مفتوحة ولا لأ
   * (صفحة البورصة بتكتب «أنا مفتوحة» كل دقيقة فى مخزن السكربت). لو مافيش نبض من ٣ دقايق ⇒ نفتحها فى تاب جنبه،
   * ومرة واحدة كل ١٠ دقايق بالكتير عشان لو الصفحة مابتحمّلش مانفتحش تابات كتير.
   */
  if (location.hostname === 'finance.oscardevs.com') {
    // المفتاح لوحده: طول ما إنت عامل دخول فى موقعنا، السكربت بياخده من السيرفر (مفيش Set API key بإيدك)
    fetch('/api/script-key', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { if (j && j.key && j.key !== apiKey()) GM_setValue('apiKey', j.key); }).catch(function () {});
    /** تاب لازم يفضل مفتوح: نبض أقل من ٣ دقايق ⇒ تمام، وإلا نفتحه (مرة كل ١٠ دقايق بالكتير) */
    var ensure = function (beatKey, openKey, url, label) {
      var now = Date.now();
      if (now - Number(GM_getValue(beatKey, 0)) < 3 * 60000) return label + ' مفتوحة ✓';
      if (now - Number(GM_getValue(openKey, 0)) < 10 * 60000) return 'مستنى ' + label + ' تفتح…';
      GM_setValue(openKey, now);
      GM_openInTab(url, { active: false, insert: true, setParent: true });
      return 'فتحت ' + label + ' فى تاب جنب ده';
    };
    var keep = function () {
      var msg = [ensure('egxBeat', 'egxLastOpen', GM_getValue('egxUrl', EGX_URL), 'صفحة الأخبار')];
      // الأسعار وقت السوق بس
      if (pricesTime()) msg.unshift(ensure('pricesBeat', 'pricesLastOpen', PRICES_URL, 'صفحة الأسعار'));
      show(msg.join(' · '));
    };
    keep(); setInterval(keep, 60000);
    return;
  }
  // صفحة الأخبار: نبض كل دقيقة طول ما التاب مفتوح (صفحة الأسعار ليها نبض لوحدها)
  if (!IS_PRICES) {
    GM_setValue('egxBeat', Date.now());
    setInterval(function () { GM_setValue('egxBeat', Date.now()); }, 60000);
  }

  function req(method, url, body, headers, raw) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: method, url: url, data: body ? JSON.stringify(body) : undefined, timeout: 30000,
        headers: Object.assign(body ? { 'Content-Type': 'application/json' } : {}, headers || {}),
        onload: function (r) { if (r.status >= 200 && r.status < 300) { if (raw) resolve(r.responseText); else { try { resolve(JSON.parse(r.responseText)); } catch (e) { reject(new Error('bad json')); } } } else reject(new Error('HTTP ' + r.status)); },
        onerror: function () { reject(new Error('network')); }, ontimeout: function () { reject(new Error('timeout')); },
      });
    });
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function cairo() {
    var p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return { iso: p.year + '-' + p.month + '-' + p.day, wd: p.weekday, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  }
  function hm(s) { var a = String(s).split(':'); return Number(a[0]) * 60 + Number(a[1] || 0); }
  var DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
  function latin(s) { return String(s || '').replace(/[٠-٩]/g, function (d) { return DIGITS[d]; }); }
  /** 10/11/2026 أو 2026-11-10 ⇒ 2026-11-10 */
  function toIso(s) {
    var t = latin(s), m = t.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    m = t.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null;
  }
  var clean = function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); };

  /** صفوف جدول النتايج: صف فيه تاريخ ولينك. بنقرا الصفحة المفتوحة بس. */
  function parseRows() {
    var out = [];
    document.querySelectorAll('table tr').forEach(function (tr) {
      var cells = Array.prototype.slice.call(tr.querySelectorAll('td'));
      if (cells.length < 2) return;
      var link = tr.querySelector('a[href]'); if (!link) return;
      var dateCell = cells.find(function (c) { return toIso(c.textContent); });
      if (!dateCell) return;
      var title = clean(link.textContent); if (!title || title.length < 4) return;
      var others = cells.filter(function (c) { return c !== dateCell && !c.contains(link); }).map(function (c) { return clean(c.textContent); }).filter(Boolean);
      var company = others.sort(function (a, b) { return b.length - a.length; })[0] || '';
      out.push({ published_date: toIso(dateCell.textContent), company: company, title: title, url: link.href });
    });
    return out;
  }

  async function detail(url) {
    try {
      var html = await req('GET', url, null, null, true);
      var doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script,style,nav,header,footer').forEach(function (n) { n.remove(); });
      return clean(doc.body ? doc.body.textContent : '').slice(0, 15000);
    } catch (e) { console.warn('[EGX disclosures] detail', e.message); return null; }
  }

  /** زرار «بحث» بتاع الصفحة نفسها (الفورم فيه آخر يوم تلقائياً). */
  function searchButton() {
    var els = document.querySelectorAll('input[type=submit],input[type=button],button,a');
    for (var i = 0; i < els.length; i++) {
      var t = clean(els[i].value || els[i].textContent);
      // اللينكات: زرار ASP.NET بس (__doPostBack)، مش لينكات القايمة
      if (els[i].tagName === 'A' && !/__doPostBack|^javascript:/i.test(els[i].getAttribute('href') || '')) continue;
      if (t === 'بحث' || t === 'ابحث' || t === 'Search') return els[i];
    }
    return null;
  }

  async function run() {
    if (!apiKey()) { show('افتح finance.oscardevs.com وانت عامل دخول (المفتاح بيتاخد لوحده)، أو من قايمة Tampermonkey: Set API key', true); return; }
    var rows = parseRows();
    if (!rows.length) {
      // مفيش نتايج ⇒ ندوس «بحث» بتاع الصفحة مرة (مش أكتر من مرة كل دقيقتين عشان لو البحث رجّع فاضى)
      var btn = searchButton(), last = Number(sessionStorage.getItem('egx_auto_search') || 0);
      if (btn && Date.now() - last > 2 * 60000) {
        sessionStorage.setItem('egx_auto_search', String(Date.now()));
        show('بدوس «بحث»…');
        btn.click();
        return false;
      }
      show('مالقيتش نتايج. دوّر بنفسك مرة، وبعدين السكربت هيكمّل', true);
      setTimeout(function () { location.assign(location.href); }, 30 * 60000);
      return false;
    }
    // الصفحة دى فيها نتايج: لو اللينك فيه البحث نفسه (GET) نحفظه عشان موقعنا يفتح نفس البحث بعد كده
    if (location.search) GM_setValue('egxUrl', location.href);
    var seen = JSON.parse(GM_getValue('seen', '[]'));
    var fresh = rows.filter(function (r) { return seen.indexOf(r.url) < 0; });
    // نص الإفصاح: للجديد بس، واحد واحد كل ٢ ثانية
    for (var i = 0; i < fresh.length && i < 15; i++) {
      if (/^https:\/\/www\.egx\.com\.eg\//i.test(fresh[i].url)) { fresh[i].body_text = await detail(fresh[i].url); await sleep(2000); }
    }
    if (fresh.length) {
      var r = await req('POST', server() + '/api/ingest/disclosures', fresh, { 'X-API-Key': apiKey() });
      seen = seen.concat(fresh.map(function (x) { return x.url; })).slice(-500);
      GM_setValue('seen', JSON.stringify(seen));
      show('بعت ' + fresh.length + ' (جديد على السيرفر ' + r.new + ') · ' + new Date().toLocaleTimeString('ar-EG'));
    } else show('مفيش جديد · ' + rows.length + ' صف · ' + new Date().toLocaleTimeString('ar-EG'));
    return true;
  }

  // تحديث الصفحة: كل ١٠ دقايق وقت السوق، وكل ٣٠ دقيقة غير كده (الإفصاحات بتنزل بعد الإقفال كمان)
  function scheduleReload() {
    var c = cairo(), trading = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].indexOf(c.wd) >= 0;
    var inMarket = trading && c.min >= hm('10:00') && c.min <= hm('14:30');
    setTimeout(function () { location.assign(location.href); }, (inMarket ? 10 : 30) * 60000);
  }

  /*
   * ── صفحة الأسعار (prices.aspx) ──
   * الجدول بيظهر لما ندوس تبويب «جميع الأسهم» (postback جزئى بيستبدل الجدول)، والصفحة مابتحدّثش نفسها، فبندوسه تانى كل
   * دقيقتين وقت السوق، ونعمل Reload كامل كل ٣٠ دقيقة. الجدول مافيهوش الرمز (ETEL)، فيه رابط بالـ ISIN بس، فالرمز بنعرفه
   * مرة واحدة من صفحة الشركة («كود رويترز ETEL.CA») ونحفظه، ونقف لما نلاقى كل أسهم قايمة المتابعة. بنبعت أسهم القايمة بس.
   */
  function num(s) { var v = parseFloat(latin(s).replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : null; }
  function reutersCode(html) {
    var t = String(html || '').replace(/<[^>]+>/g, ' ');
    var m = t.match(/رويترز[\s\S]{0,300}?\b([A-Z][A-Z0-9]{1,7})\.CA\b/) || t.match(/Reuters[\s\S]{0,300}?\b([A-Z][A-Z0-9]{1,7})\.CA\b/i) || t.match(/\b([A-Z][A-Z0-9]{1,7})\.CA\b/);
    return m ? m[1].toUpperCase() : '';
  }
  /** صفوف الجدول ⇒ [{isin, name, last}]. الأعمدة بالعنوان، ولو العناوين مش متطابقة مع الخلايا: آخر سعر = العمود الـ٨ */
  function readGrid(g) {
    var heads = [];
    g.querySelectorAll('thead tr').forEach(function (tr) { var h = Array.prototype.map.call(tr.cells, function (c) { return clean(c.textContent); }); if (h.join('').length > heads.join('').length) heads = h; });
    var iLast = heads.findIndex(function (h) { return /آخر سعر|اخر سعر|^Last/i.test(h); });
    var out = [];
    Array.prototype.forEach.call((g.tBodies[0] || { rows: [] }).rows, function (tr) {
      var a = tr.querySelector('a[href*="ISIN="]'); if (!a) return;
      var m = (a.getAttribute('href') || '').match(/ISIN=([A-Z0-9]{12})/i); if (!m) return;
      var cells = tr.cells, i = iLast >= 0 && heads.length === cells.length ? iLast : 7;
      var last = cells[i] ? num(cells[i].textContent) : null;
      if (last > 0) out.push({ isin: m[1].toUpperCase(), name: clean(a.textContent), last: last });
    });
    return out;
  }
  function pricesPage() {
    var beat = function () { GM_setValue('pricesBeat', Date.now()); };
    beat(); setInterval(beat, 60000);
    var map = JSON.parse(GM_getValue('isinMap', '{}'));   // isin ⇒ {s: 'ETEL' أو '' لو مالقيناش, t: وقت}
    var started = Date.now(), fails = 0;
    var grid = function () { return document.getElementById('ctl00_C_S_RadGrid2_ctl00'); };
    var marketLink = function () { return document.getElementById('ctl00_C_S_lkMarket') || document.querySelector('a[href*="lkMarket"]'); };
    function waitGrid(old, ms) {
      return new Promise(function (resolve) {
        var t0 = Date.now();
        (function poll() {
          var g = grid();
          if (g && g !== old && g.tBodies[0] && g.tBodies[0].rows.length >= 20) return resolve(g);
          if (Date.now() - t0 > ms) return resolve(null);
          setTimeout(poll, 500);
        })();
      });
    }
    async function learn(rows, want, budgetMs) {
      var t0 = Date.now(), have = function () { return want.every(function (s) { return Object.keys(map).some(function (k) { return map[k].s === s; }); }); };
      for (var i = 0; i < rows.length && !have() && Date.now() - t0 < budgetMs; i++) {
        var e = map[rows[i].isin];
        if (e && (e.s || Date.now() - e.t < 7 * 86400000)) continue;
        try {
          var r = await fetch('/ar/CompanyDetails.aspx?ISIN=' + rows[i].isin, { credentials: 'same-origin' });
          if (r.ok) { map[rows[i].isin] = { s: reutersCode(await r.text()), t: Date.now() }; GM_setValue('isinMap', JSON.stringify(map)); }
        } catch (_) { /* نجرّب الدورة الجاية */ }
        await sleep(1200);
      }
    }
    async function cycle() {
      if (!apiKey()) { show('افتح finance.oscardevs.com وانت عامل دخول (المفتاح بيتاخد لوحده)', true); return; }
      if (!pricesTime()) {
        show('السوق مقفول. الصفحة دى بتشتغل الأيام من الأحد للخميس من ١٠ لـ ٢:٣٠');
        if (cairo().min > hm('14:35')) window.close();   // التاب اللى السكربت فتحه بيتقفل بعد السوق
        return;
      }
      var a = marketLink();
      if (!a) { show('مالقيتش تبويب «جميع الأسهم» فى الصفحة', true); fails++; return; }
      show('بدوس «جميع الأسهم»…');
      var old = grid(); a.click();
      var g = await waitGrid(old, 60000);
      if (!g) { fails++; show('الجدول ماظهرش (' + fails + ')', true); return; }
      fails = 0;
      var rows = readGrid(g);
      var want = ((await req('GET', server() + '/api/watchlist')).symbols || []);
      var known = function () { var o = {}; Object.keys(map).forEach(function (k) { if (map[k].s) o[map[k].s] = k; }); return o; };
      if (want.some(function (s) { return !known()[s]; })) { show(rows.length + ' سهم فى الجدول · بتعرّف على رموز الأسهم من صفحات الشركات…'); await learn(rows, want, 60000); }
      var at = new Date().toISOString();
      var quotes = rows.filter(function (r) { return map[r.isin] && want.indexOf(map[r.isin].s) >= 0; })
        .map(function (r) { return { symbol: map[r.isin].s, price: r.last, quote_ts: at }; });
      var msg = rows.length + ' سهم فى الجدول';
      if (quotes.length) {
        var res = await req('POST', server() + '/api/ingest/quotes?source=egx', quotes, { 'X-API-Key': apiKey() });
        msg = 'بعت ' + res.saved + ' سعر' + (res.rejected && res.rejected.length ? ' (اترفض ' + res.rejected.length + ')' : '') + ' · ' + msg;
      }
      var missing = want.filter(function (s) { return !known()[s]; });
      show(msg + (missing.length ? ' · مش لاقى فى الجدول: ' + missing.slice(0, 6).join(' ') + (missing.length > 6 ? '…' : '') : '') + ' · ' + new Date().toLocaleTimeString('ar-EG'), false);
    }
    async function loop() {
      try { await cycle(); } catch (e) { fails++; show('خطأ: ' + e.message, true); console.warn('[EGX prices]', e); }
      // ٣ مرات ورا بعض الجدول ماظهرش، أو بقالنا ٣٠ دقيقة ⇒ Reload كامل
      if (fails >= 3 || Date.now() - started > 30 * 60000) { location.assign(location.href.split('#')[0]); return; }
      setTimeout(loop, 2 * 60000);
    }
    loop();
  }

  if (IS_PRICES) { pricesPage(); return; }
  run().then(function (ok) { if (ok) scheduleReload(); }).catch(function (e) { show('خطأ: ' + e.message, true); console.warn('[EGX disclosures]', e); });
})();
