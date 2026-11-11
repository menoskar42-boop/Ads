// الأسعار اللحظية من موقع البورصة نفسه، من السيرفر (٢٠٢٦-١١-١١): صفحة «بيانات التداول» prices.aspx. الجدول (Telerik RadGrid)
// بيظهر لما تدوس تبويب «جميع الأسهم» (ASP.NET postback)، فالسيرفر بيعمل زى المتصفح بالظبط: GET للصفحة، وبعدين POST بنفس
// الحقول المخفية (__VIEWSTATE …) و__EVENTTARGET=ctl00$C$S$lkMarket، ويقرا «آخر سعر» من الرد. الجدول فيه كود الـISIN بس (مش
// الرمز)، فالربط بالرمز من egx.watchlist.isin. ولو الموقع رفض السيرفر، سكربت Tampermonkey فاضل احتياطى، وYahoo بعده.
'use strict';

const PRICES_URL = 'https://www.egx.com.eg/ar/prices.aspx';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
  });
}
const text = (html) => decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i'));
  return m ? decode(m[2] != null ? m[2] : m[3] != null ? m[3] : m[4]) : null;
}
const DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
function num(s) {
  const v = parseFloat(String(s || '').replace(/[٠-٩]/g, (d) => DIGITS[d]).replace(/[,\s]/g, ''));
  return Number.isFinite(v) ? v : null;
}

/** حقول الفورم زى ما المتصفح بيبعتها: المخفية + القوايم (المختار) + خانات النص، و__EVENTTARGET = «جميع الأسهم» */
function postbackBody(html) {
  const form = (String(html).match(/<form[\s\S]*?<\/form>/i) || [String(html)])[0];
  const parts = [];
  const add = (k, v) => parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v == null ? '' : v));
  for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
    const name = attr(tag, 'name'); if (!name || name === '__EVENTTARGET' || name === '__EVENTARGUMENT') continue;
    const type = (attr(tag, 'type') || 'text').toLowerCase();
    if (['submit', 'button', 'image', 'file', 'reset'].includes(type)) continue;
    if ((type === 'checkbox' || type === 'radio') && !/\schecked\b/i.test(tag)) continue;
    if (/\sdisabled\b/i.test(tag)) continue;
    add(name, attr(tag, 'value') || '');
  }
  for (const sel of form.match(/<select\b[\s\S]*?<\/select>/gi) || []) {
    const name = attr(sel.match(/<select\b[^>]*>/i)[0], 'name'); if (!name) continue;
    const opts = sel.match(/<option\b[^>]*>/gi) || [];
    const chosen = opts.find((o) => /\sselected\b/i.test(o)) || opts[0];
    add(name, chosen ? (attr(chosen, 'value') || '') : '');
  }
  add('__EVENTTARGET', 'ctl00$C$S$lkMarket'); add('__EVENTARGUMENT', '');
  const action = attr((form.match(/<form\b[^>]*>/i) || [''])[0], 'action');
  return { action: new URL(action || PRICES_URL, PRICES_URL).href, body: parts.join('&') };
}

/** جدول «جميع الأسهم» ⇒ [{isin, name, last}]. «آخر سعر» بعنوانه، وإلا العمود الـ٨ (زى السكربت). */
function parseGrid(html) {
  const s = String(html || '');
  const i = s.search(/id="ctl00_C_S_RadGrid2_ctl00"/);
  if (i < 0) return [];
  const tbl = s.slice(i, s.indexOf('</table>', s.indexOf('<tbody', i)) + 8);
  const thead = (tbl.match(/<thead[\s\S]*?<\/thead>/i) || [''])[0];
  let heads = [];
  for (const tr of thead.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const h = (tr.match(/<th\b[\s\S]*?<\/th>/gi) || []).map(text);
    if (h.join('').length > heads.join('').length) heads = h;
  }
  const iLast = heads.findIndex((h) => /آخر سعر|اخر سعر|^Last/i.test(h));
  const body = (tbl.match(/<tbody[\s\S]*?<\/tbody>/i) || [''])[0];
  const out = [];
  for (const tr of body.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const m = tr.match(/ISIN=([A-Z0-9]{12})/i); if (!m) continue;
    const cells = tr.match(/<td\b[\s\S]*?<\/td>/gi) || [];
    const k = iLast >= 0 && heads.length === cells.length ? iLast : 7;
    const last = cells[k] ? num(text(cells[k])) : null;
    const a = tr.match(/<a\b[^>]*ISIN=[^>]*>([\s\S]*?)<\/a>/i);
    if (last > 0) out.push({ isin: m[1].toUpperCase(), name: a ? text(a[1]) : '', last });
  }
  return out;
}

/** GET ثم POST «جميع الأسهم» بكوكيز الجلسة. بيرجّع الصفوف أو بيرمى غلطة فيها status لو الموقع رفض. */
async function fetchGrid(opts) {
  opts = opts || {};
  const f = opts.fetch || fetch;
  const timed = async (url, init) => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), opts.timeoutMs || 45000);
    try {
      const res = await f(url, Object.assign({ redirect: 'follow', signal: ctrl.signal }, init));
      if (!res.ok) { const e = new Error('egx HTTP ' + res.status); e.status = res.status; throw e; }
      return res;
    } finally { clearTimeout(t); }
  };
  const r1 = await timed(PRICES_URL, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'ar,en;q=0.8' } });
  const cookie = cookiesOf(r1);
  const page = await r1.text();
  const pb = postbackBody(page);
  if (!/__VIEWSTATE=/.test(pb.body)) throw new Error('صفحة الأسعار من غير __VIEWSTATE');
  const r2 = await timed(pb.action, { method: 'POST', body: pb.body, headers: { 'User-Agent': UA, Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded',
    Referer: PRICES_URL, Origin: 'https://www.egx.com.eg', ...(cookie ? { Cookie: cookie } : {}) } });
  const rows = parseGrid(await r2.text());
  if (rows.length < 20) throw new Error('الجدول ماظهرش فى الرد (' + rows.length + ' صف)');
  return rows;
}
function cookiesOf(res) {
  const h = res.headers;
  const list = typeof h.getSetCookie === 'function' ? h.getSetCookie() : (h.get('set-cookie') ? h.get('set-cookie').split(/,(?=\s*[^;,=\s]+=)/) : []);
  return list.map((c) => String(c).split(';')[0].trim()).filter(Boolean).join('; ');
}

/** صفوف الجدول ⇒ أسعار أسهم القايمة (بكود الـISIN المحفوظ). items = [{symbol, isin}] */
function quotesFor(rows, items, at) {
  const bySym = {}; (items || []).forEach((w) => { if (w.isin) bySym[String(w.isin).toUpperCase()] = w.symbol; });
  const ts = (at || new Date()).toISOString();
  return rows.filter((r) => bySym[r.isin]).map((r) => ({ symbol: bySym[r.isin], price: r.last, quote_ts: ts }));
}

module.exports = { PRICES_URL, postbackBody, parseGrid, fetchGrid, quotesFor, decode };
