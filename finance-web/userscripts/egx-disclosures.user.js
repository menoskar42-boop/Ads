// ==UserScript==
// @name         EGX Swing: EGX disclosures
// @namespace    https://finance.oscardevs.com
// @version      1.6.0
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
  var IS_FIN = location.hostname === 'finance.oscardevs.com';
  function show(t, bad) { badge.style.background = bad ? '#b42318' : '#0b6e4f'; badge.textContent = (IS_PRICES ? 'EGX أسعار · ' : 'EGX · ') + t; }

  /*
   * على موقعنا (finance.oscardevs.com): طول ما التاب مفتوح، كل دقيقة بنشوف صفحة البحث فى أخبار البورصة مفتوحة ولا لأ
   * (صفحة البورصة بتكتب «أنا مفتوحة» كل دقيقة فى مخزن السكربت). لو مافيش نبض من ٣ دقايق ⇒ نفتحها فى تاب جنبه،
   * ومرة واحدة كل ١٠ دقايق بالكتير عشان لو الصفحة مابتحمّلش مانفتحش تابات كتير.
   */
  function financePage() {
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
    var feedMsg = null, feedBad = false;
    var keep = function () {
      var msg = [ensure('egxBeat', 'egxLastOpen', GM_getValue('egxUrl', EGX_URL), 'صفحة الأخبار')];
      // الأسعار وقت السوق بس: من الخلفية، وتاب صفحة الأسعار بس لو الخلفية فشلت ٣ مرات ورا بعض
      var fallback = pricesTime() && Number(GM_getValue('feedFails', 0)) >= 3;
      var needPrices = fallback && Date.now() - Number(GM_getValue('pricesBeat', 0)) >= 3 * 60000;
      if (fallback) msg.unshift(ensure('pricesBeat', 'pricesLastOpen', PRICES_URL, 'صفحة الأسعار'));
      if (feedMsg) msg.unshift(feedMsg);
      show(msg.join(' · '), feedBad);
      // لو التاب ماظهرش (اتفتح فى شباك تانى أو اتقفل): زرار يفتحه قدامك
      if (needPrices) {
        var b = document.createElement('button');
        b.type = 'button'; b.textContent = 'افتح صفحة الأسعار';
        b.style.cssText = 'margin-inline-start:8px;font:inherit;background:#fff;color:#0b6e4f;border:0;border-radius:6px;padding:2px 8px;cursor:pointer';
        b.onclick = function () { GM_setValue('pricesLastOpen', Date.now()); GM_openInTab(PRICES_URL, { active: true, insert: true, setParent: true }); };
        badge.appendChild(b);
      }
    };
    keep(); setInterval(keep, 60000);
    setTimeout(function () { pricesFeed(function (m, bad) { feedMsg = m; feedBad = !!bad; keep(); }); }, 3000);   // بعد ما المفتاح يوصل
  }
  // صفحة الأخبار: نبض كل دقيقة طول ما التاب مفتوح (صفحة الأسعار ليها نبض لوحدها)
  if (!IS_PRICES && !IS_FIN) {
    GM_setValue('egxBeat', Date.now());
    setInterval(function () { GM_setValue('egxBeat', Date.now()); }, 60000);
  }

  function req(method, url, body, headers, raw) {
    return new Promise(function (resolve, reject) {
      GM_xmlhttpRequest({
        method: method, url: url, data: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), timeout: 60000,
        headers: Object.assign(body != null && typeof body !== 'string' ? { 'Content-Type': 'application/json' } : {}, headers || {}),
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
   * ── الأسعار من صفحة «بيانات التداول» (prices.aspx) ──
   * الطريقة الأساسية (1.4.0): تاب موقعنا نفسه بيجيب الصفحة فى الخلفية (GM_xmlhttpRequest بكوكيز البورصة زى المتصفح بالظبط)،
   * ويبعت نفس الفورم اللى بيتبعت لما تدوس تبويب «جميع الأسهم» (ASP.NET postback)، ويقرا الجدول من الرد. من غير تاب زيادة.
   * ولو فشلت ٣ مرات ورا بعض ⇒ احتياطى: تاب prices.aspx بيتفتح وبيدوس «جميع الأسهم» بنفسه كل دقيقتين.
   * الجدول مافيهوش الرمز (ETEL)، فيه رابط بالـ ISIN بس. كود الـISIN لكل سهم فى القايمة بيتعرف مرة واحدة (بالاسم العربى، أو من
   * صفحة الشركة «كود رويترز ETEL.CA») وبيتحفظ على السيرفر فى قايمة المتابعة (1.5.0)، فمابيدوّرش تانى. بنبعت أسهم القايمة بس.
   */
  function num(s) { var v = parseFloat(latin(s).replace(/[,\s]/g, '')); return Number.isFinite(v) ? v : null; }
  function reutersCode(html) {
    // ١.٥.٢: المسافات بتتلم الأول (بين «كود رويترز» والكود كان فيه سطور فاضية كتير فالكود ماكانش بيتلقى)
    var t = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ');
    var m = t.match(/رويترز[\s\S]{0,300}?\b([A-Z][A-Z0-9]{1,7})\.CA\b/) || t.match(/Reuters[\s\S]{0,300}?\b([A-Z][A-Z0-9]{1,7})\.CA\b/i);
    if (m) return m[1].toUpperCase();
    // من غير لابل: نقبل الكود بس لو هو الوحيد فى الصفحة (عشان شريط أسعار فيه أكواد شركات تانية مايلخبطش)
    var all = (t.match(/\b[A-Z][A-Z0-9]{1,7}\.CA\b/g) || []).map(function (x) { return x.slice(0, -3).toUpperCase(); });
    var uniq = all.filter(function (x, k) { return all.indexOf(x) === k; });
    return uniq.length === 1 ? uniq[0] : '';
  }
  var GRID_ID = 'ctl00_C_S_RadGrid2_ctl00';
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
  /** اسم عربى للمقارنة: من غير تشكيل، والألفات والياء والتاء المربوطة موحّدة، ومن غير اللى بين القوسين والمسافات والرموز */
  function normAr(x) {
    return String(x || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
      .replace(/\([^)]*\)/g, ' ').replace(/شركه/g, ' ').replace(/[^ء-يa-z0-9]+/gi, '').toLowerCase();
  }
  /** الرمز المكتوب فى صفحة الشركة (كود رويترز)، محفوظ عندنا: اللى اتعرف مايتطلبش تانى، واللى مالقيناش فيه كود نجرّبه بعد يوم */
  async function codeOf(isin, getHtml) {
    var cache = {}; try { cache = JSON.parse(GM_getValue('isinCodes2', '{}')); } catch (_) { /* فاضى */ }
    var e = cache[isin];
    if (e && (e.s || Date.now() - e.t < 86400000)) return e.s;
    var code = reutersCode(await getHtml('https://www.egx.com.eg/ar/CompanyDetails.aspx?ISIN=' + isin));
    cache[isin] = { s: code, t: Date.now() }; GM_setValue('isinCodes2', JSON.stringify(cache));
    await sleep(1200);
    return code;
  }
  /**
   * أسهم القايمة اللى لسه مالهاش ISIN: (١) بالاسم العربى (لو صف واحد بس فى الجدول اسمه مطابق، ونتأكد من كود رويترز فى صفحته)
   * (٢) الباقى: صفحات الشركات واحدة واحدة لحد ما الوقت يخلص. بيرجّع [{symbol, isin}] الجديدة.
   */
  async function learn(missing, rows, taken, budgetMs, getHtml) {
    var t0 = Date.now(), found = [], left = missing.slice();
    var use = function (it, isin) { found.push({ symbol: it.symbol, isin: isin }); taken[isin] = it.symbol; left = left.filter(function (x) { return x !== it; }); };
    for (var k = 0; k < missing.length && Date.now() - t0 < budgetMs; k++) {
      var it = missing[k], n = normAr(it.note);
      if (n.length < 4) continue;
      var c = rows.filter(function (r) { var rn = normAr(r.name); return !taken[r.isin] && rn && (rn.indexOf(n) >= 0 || n.indexOf(rn) >= 0); });
      if (c.length !== 1) continue;
      try { var code = await codeOf(c[0].isin, getHtml); if (!code || code === it.symbol) use(it, c[0].isin); } catch (_) { /* الدورة الجاية */ }
    }
    for (var i = 0; i < rows.length && left.length && Date.now() - t0 < budgetMs; i++) {
      if (taken[rows[i].isin]) continue;
      try {
        var cd = await codeOf(rows[i].isin, getHtml);
        var hit = left.find(function (x) { return x.symbol === cd; });
        if (hit) use(hit, rows[i].isin);
      } catch (_) { /* الدورة الجاية */ }
    }
    return found;
  }
  /** صفوف الجدول ⇒ سيرفرنا (أسهم القايمة بس). كود الـISIN لكل سهم محفوظ على السيرفر، فالبحث بيحصل مرة واحدة بس. */
  async function sendRows(rows, getHtml, onLearn) {
    var K = { 'X-API-Key': apiKey() };
    var wl = await req('GET', server() + '/api/watchlist?all=1', null, K);
    if (wl.price_every_sec) GM_setValue('priceEvery', Number(wl.price_every_sec));   // من إعدادات الموقع
    var items = (wl.items || []).filter(function (x) { return x.is_active; });
    var taken = {}; items.forEach(function (x) { if (x.isin) taken[x.isin] = x.symbol; });
    var inTable = {}; rows.forEach(function (r) { inTable[r.isin] = 1; });
    var missing = items.filter(function (x) { return !x.isin; });
    // ١.٥.١: الأسعار المعروفة تتبعت الأول، وبعدها البحث عن الأكواد الناقصة (سهم ماتداولش، زى ADRI، كان بيأخّر الكل دقيقة)
    var send = async function () {
      var at = new Date().toISOString();
      var quotes = rows.filter(function (r) { return taken[r.isin]; }).map(function (r) { return { symbol: taken[r.isin], price: r.last, quote_ts: at }; });
      if (!quotes.length) return '';
      var res = await req('POST', server() + '/api/ingest/quotes?source=egx', quotes, K);
      GM_setValue('pricesOk', Date.now());
      return 'بعت ' + res.saved + ' سعر' + (res.rejected && res.rejected.length ? ' (اترفض ' + res.rejected.length + ')' : '') + ' · ';
    };
    var msg = (await send()) + rows.length + ' سهم فى الجدول';
    if (missing.length) {
      if (onLearn) onLearn(missing.length);
      var found = await learn(missing, rows, taken, 60000, getHtml);
      if (found.length) { await req('POST', server() + '/api/watchlist/isin', { items: found }, K); await send(); }
    }
    // مالوش ISIN لسه · أو ليه بس ماتداولش النهارده (مش فى الجدول)
    var noIsin = items.filter(function (x) { return !Object.keys(taken).some(function (k) { return taken[k] === x.symbol; }); }).map(function (x) { return x.symbol; });
    var notTraded = items.filter(function (x) { var k = Object.keys(taken).find(function (q) { return taken[q] === x.symbol; }); return k && !inTable[k]; }).map(function (x) { return x.symbol; });
    var tail = function (label, a) { return a.length ? ' · ' + label + ': ' + a.slice(0, 6).join(' ') + (a.length > 6 ? '…' : '') : ''; };
    return msg + tail('لسه بدوّر على', noIsin) + tail('ماتداولش النهارده', notTraded) + ' · ' + new Date().toLocaleTimeString('ar-EG');
  }

  /** الفورم زى ما المتصفح بيبعته: كل الحقول بقيمها، و__EVENTTARGET = تبويب «جميع الأسهم» */
  function postbackBody(doc) {
    var form = doc.forms[0]; if (!form) return null;
    var parts = [];
    var add = function (k, v) { parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v == null ? '' : v)); };
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.disabled) return;
      var type = (el.type || '').toLowerCase();
      if (['submit', 'button', 'image', 'file', 'reset'].indexOf(type) >= 0) return;
      if ((type === 'checkbox' || type === 'radio') && !el.checked) return;
      if (el.name === '__EVENTTARGET' || el.name === '__EVENTARGUMENT') return;
      if (el.tagName === 'SELECT') { var o = el.options[el.selectedIndex]; add(el.name, o ? o.value : ''); return; }
      add(el.name, el.value);
    });
    add('__EVENTTARGET', 'ctl00$C$S$lkMarket'); add('__EVENTARGUMENT', '');
    return { action: new URL(form.getAttribute('action') || PRICES_URL, PRICES_URL).href, body: parts.join('&') };
  }
  /** الجدول كله من الخلفية: GET للصفحة ثم POST «جميع الأسهم» */
  async function fetchGrid() {
    var page = new DOMParser().parseFromString(await req('GET', PRICES_URL, null, null, true), 'text/html');
    var pb = postbackBody(page); if (!pb) throw new Error('الفورم مش موجود فى صفحة الأسعار');
    var html = await req('POST', pb.action, pb.body, { 'Content-Type': 'application/x-www-form-urlencoded', Referer: PRICES_URL }, true);
    var g = new DOMParser().parseFromString(html, 'text/html').getElementById(GRID_ID);
    if (!g || !g.tBodies[0] || g.tBodies[0].rows.length < 20) throw new Error('الجدول ماظهرش فى الرد');
    return readGrid(g);
  }
  // ١.٦.٠: كل قد إيه الأسعار تتجدد (ثانية) من إعدادات الموقع، ٦٠ افتراضى ومن ١٥ لـ ٦٠٠
  function everyMs() { var n = Number(GM_getValue('priceEvery', 60)); return Math.min(600, Math.max(15, n || 60)) * 1000; }
  function lockMs() { return Math.max(10000, everyMs() - 5000); }
  /** على تاب موقعنا: كل «كل قد إيه» وقت السوق، وتاب واحد بس بيجيب لو فيه كذا تاب مفتوح */
  function pricesFeed(report) {
    var getHtml = function (u) { return req('GET', u, null, null, true); };
    async function tick() {
      if (!pricesTime() || !apiKey()) return report(null);
      if (Date.now() - Number(GM_getValue('feedLock', 0)) < lockMs()) return;   // تاب تانى لسه جايب
      GM_setValue('feedLock', Date.now());
      try {
        var rows = await fetchGrid();
        var msg = await sendRows(rows, getHtml, function () { report('الأسعار: بتعرّف على رموز الأسهم من صفحات الشركات…'); });
        GM_setValue('feedFails', 0); report('الأسعار: ' + msg);
      } catch (e) {
        var n = Number(GM_getValue('feedFails', 0)) + 1; GM_setValue('feedFails', n);
        report('الأسعار: ماعرفتش أجيبها (' + e.message + ')' + (n >= 3 ? '، هفتح صفحة الأسعار فى تاب' : ''), true);
        console.warn('[EGX prices]', e);
      }
    }
    (function next() { tick().catch(function () {}).then(function () { setTimeout(next, pricesTime() ? everyMs() : 2 * 60000); }); })();
  }

  /** الاحتياطى: تاب prices.aspx بيدوس «جميع الأسهم»، وبعدها Reload كامل للصفحة كل «كل قد إيه» (المالك: الريفريش بيجيب الجديد) */
  function pricesPage() {
    var beat = function () { GM_setValue('pricesBeat', Date.now()); };
    beat(); setInterval(beat, 60000);
    var started = Date.now(), fails = 0;
    var grid = function () { return document.getElementById(GRID_ID); };
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
    var getHtml = function (u) { return fetch(u, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }); };
    async function cycle() {
      if (!apiKey()) { show('افتح finance.oscardevs.com وانت عامل دخول (المفتاح بيتاخد لوحده)', true); return; }
      if (!pricesTime()) {
        show('السوق مقفول. الصفحة دى بتشتغل الأيام من الأحد للخميس من ١٠ لـ ٢:٣٠');
        if (cairo().min > hm('14:35')) window.close();   // التاب اللى السكربت فتحه بيتقفل بعد السوق
        return;
      }
      // تاب موقعنا لسه جايب الأسعار من الخلفية ⇒ مفيش داعى ندوس هنا كمان
      if (Date.now() - Number(GM_getValue('feedLock', 0)) < lockMs() && Number(GM_getValue('feedFails', 0)) === 0) { show('تاب موقعنا بيجيب الأسعار ✓'); return; }
      var a = marketLink();
      if (!a) { show('مالقيتش تبويب «جميع الأسهم» فى الصفحة', true); fails++; return; }
      show('بدوس «جميع الأسهم»…');
      var old = grid(); a.click();
      var g = await waitGrid(old, 60000);
      if (!g) { fails++; show('الجدول ماظهرش (' + fails + ')', true); return; }
      fails = 0;
      show(await sendRows(readGrid(g), getHtml, function () { show('بتعرّف على رموز الأسهم من صفحات الشركات…'); }));
    }
    async function loop() {
      try { await cycle(); } catch (e) { fails++; show('خطأ: ' + e.message, true); console.warn('[EGX prices]', e); }
      // وقت السوق ⇒ Reload كامل للصفحة كل «كل قد إيه» (١.٦.٠). برّه السوق أو من غير مفتاح ⇒ نبص تانى كل دقيقتين
      var reload = function () { location.assign(location.href.split('#')[0]); };
      if (fails >= 3 || Date.now() - started > 30 * 60000) return reload();
      if (pricesTime() && apiKey()) { setTimeout(reload, everyMs()); return; }
      setTimeout(loop, 2 * 60000);
    }
    loop();
  }

  if (IS_FIN) { financePage(); return; }
  if (IS_PRICES) { pricesPage(); return; }
  run().then(function (ok) { if (ok) scheduleReload(); }).catch(function (e) { show('خطأ: ' + e.message, true); console.warn('[EGX disclosures]', e); });
})();
