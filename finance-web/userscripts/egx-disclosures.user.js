// ==UserScript==
// @name         EGX Swing: EGX disclosures
// @namespace    https://finance.oscardevs.com
// @version      1.0.0
// @description  يقرا جدول نتايج البحث فى أخبار البورصة المصرية (الصفحة اللى إنت فاتحها) ويبعت الإفصاحات الجديدة لـ finance.oscardevs.com.
// @match        https://www.egx.com.eg/ar/NewsSearch.aspx*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
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

  var badge = document.createElement('div');
  badge.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;background:#0b6e4f;color:#fff;font:12px/1.5 Tahoma,sans-serif;' +
    'padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3);direction:rtl;max-width:340px';
  document.documentElement.appendChild(badge);
  function show(t, bad) { badge.style.background = bad ? '#b42318' : '#0b6e4f'; badge.textContent = 'EGX إفصاحات · ' + t; }

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

  async function run() {
    if (!apiKey()) { show('حط المفتاح من قايمة Tampermonkey: Set API key', true); return; }
    var rows = parseRows();
    if (!rows.length) { show('مالقيتش جدول النتايج. افتح الصفحة بنفسك ودوّر، وبعدين السكربت هيكمّل', true); return false; }
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

  function scheduleReload() {
    var c = cairo(), trading = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'].indexOf(c.wd) >= 0;
    var open = hm('10:00'), close = hm('14:30');
    if (trading && c.min >= open && c.min <= close) { setTimeout(function () { location.assign(location.href); }, 10 * 60000); return; }
    // مرة كمان بعد الإقفال
    if (trading && c.min > close && GM_getValue('afterClose', '') !== c.iso) {
      GM_setValue('afterClose', c.iso); setTimeout(function () { location.assign(location.href); }, 60000);
    }
  }

  run().then(function (ok) { if (ok) scheduleReload(); }).catch(function (e) { show('خطأ: ' + e.message, true); console.warn('[EGX disclosures]', e); });
})();
