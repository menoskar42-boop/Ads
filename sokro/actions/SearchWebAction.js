'use strict';

// Web search Action — no API key, no browser/Chromium needed. Datacenter IPs
// (Replit) get blocked or served empty pages by a single engine, and a bot-like
// User-Agent makes it worse, so we send a real browser UA and fall back across
// three HTML endpoints (DuckDuckGo HTML → DuckDuckGo Lite → Bing) until one
// returns results. Each result carries a title, url and snippet.
const { register } = require('./_registry');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function decode(s) {
  return String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/gi, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

async function getText(url, extra) {
  const r = await fetch(url, {
    headers: Object.assign({
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ar,en;q=0.8',
    }, extra || {}),
  });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.text();
}

function parseDDG(html, limit) {
  const out = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snip = html.split('result__snippet');
  let m, i = 1;
  while ((m = re.exec(html)) && out.length < limit) {
    let link = m[1];
    const um = link.match(/[?&]uddg=([^&]+)/);
    if (um) { try { link = decodeURIComponent(um[1]); } catch (_) {} }
    const title = decode(m[2]);
    let snippet = '';
    if (snip[i]) { const sm = snip[i].match(/>([\s\S]*?)<\/a>/); if (sm) snippet = decode(sm[1]); }
    i++;
    if (title && /^https?:\/\//.test(link)) out.push({ title, url: link, snippet });
  }
  return out;
}

function parseLite(html, limit) {
  const out = [];
  const re = /<a[^>]*class=['"]result-link['"][^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    let link = m[1];
    const um = link.match(/[?&]uddg=([^&]+)/);
    if (um) { try { link = decodeURIComponent(um[1]); } catch (_) {} }
    const title = decode(m[2]);
    if (title && /^https?:\/\//.test(link)) out.push({ title, url: link, snippet: '' });
  }
  return out;
}

function parseBing(html, limit) {
  const out = [];
  const re = /<li class="b_algo">[\s\S]*?<h2>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html)) && out.length < limit) {
    const link = m[1];
    const title = decode(m[2]);
    const pm = m[3].match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const snippet = pm ? decode(pm[1]) : '';
    if (title && /^https?:\/\//.test(link)) out.push({ title, url: link, snippet });
  }
  return out;
}

// Brave Search API — reliable from datacenter IPs (unlike scraping DDG/Bing,
// which a Replit IP often gets blocked/empty on). Used first when a key is set.
async function braveSearch(query, limit) {
  const key = process.env.SOKRO_BRAVE_KEY || process.env.BRAVE_SEARCH_KEY;
  if (!key) return { results: null, note: 'no-brave-key' };
  try {
    const r = await fetch('https://api.search.brave.com/res/v1/web/search?count=' + limit + '&q=' + encodeURIComponent(query), {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': key },
    });
    if (!r.ok) {
      // Surface WHY so a wrong key (401) / over-quota (429) is diagnosable instead
      // of silently falling through to the blocked engines.
      return { results: null, note: 'brave-http-' + r.status };
    }
    const data = await r.json();
    const items = (data.web && data.web.results) || [];
    const results = items.slice(0, limit).map((x) => ({ title: decode(x.title || ''), url: x.url, snippet: decode(x.description || '') }))
      .filter((x) => x.title && /^https?:\/\//.test(x.url));
    return { results };
  } catch (e) { return { results: null, note: 'brave-err:' + (e && e.message || '').slice(0, 40) }; }
}

// Run the search in the USER'S browser via the extension — their residential IP
// isn't blocked the way a datacenter (Replit) IP is. We open a Bing results page
// (closed after), and read the external result links off it.
async function extSearch(ctx, query, limit) {
  try {
    const ext = require('../extension-bridge');
    if (!(ctx && ctx.userId && ext.connected(ctx.userId))) return null;
    const r = await ext.run(ctx.userId, 'browse', { url: 'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&setlang=ar', keepOpen: false });
    if (!(r && r.ok && r.output && Array.isArray(r.output.links))) return null;
    const seen = new Set(); const out = [];
    for (const l of r.output.links) {
      const u = l && l.url;
      if (!u || !/^https?:\/\//.test(u)) continue;
      let host = ''; try { host = new URL(u).hostname; } catch (_) { continue; }
      if (/(^|\.)(bing|microsoft|msn|live|go\.microsoft)\.com$/.test(host) || /bing\.com|microsoft/.test(host)) continue;
      if (seen.has(u) || !l.text || l.text.trim().length < 3) continue;
      seen.add(u); out.push({ title: decode(l.text), url: u, snippet: '' });
      if (out.length >= limit) break;
    }
    return out.length ? out : null;
  } catch (_) { return null; }
}

async function run(ctx, input) {
  const query = String((input && input.query) || '').trim();
  if (!query) return { ok: false, error: 'query required' };
  const limit = Math.min(Math.max(parseInt(input && input.limit, 10) || 8, 1), 20);
  const q = encodeURIComponent(query);

  // Prefer the Brave API when configured — it works reliably server-side.
  const brave = await braveSearch(query, limit);
  if (brave.results && brave.results.length) {
    if (ctx && ctx.log) ctx.log('search_web', { query, count: brave.results.length, used: 'brave' });
    return { ok: true, output: { query, engine: 'brave', results: brave.results } };
  }
  const braveNote = brave.note || ''; // e.g. no-brave-key / brave-http-401 / brave-http-429
  // No Brave key → search in the user's own browser (unblocked IP) if connected.
  const viaExt = await extSearch(ctx, query, limit);
  if (viaExt && viaExt.length) {
    if (ctx && ctx.log) ctx.log('search_web', { query, count: viaExt.length, used: 'extension' });
    return { ok: true, output: { query, engine: 'browser', results: viaExt } };
  }

  // Normal engines (no key needed). These are flaky from a datacenter IP — one may
  // return empty while another works, and a retry often succeeds — so we try all of
  // them across TWO passes before giving up.
  const providers = [
    { name: 'ddg', url: 'https://html.duckduckgo.com/html/?q=' + q, parse: parseDDG },
    { name: 'lite', url: 'https://lite.duckduckgo.com/lite/?q=' + q, parse: parseLite },
    { name: 'bing', url: 'https://www.bing.com/search?q=' + q + '&setlang=ar', parse: parseBing },
  ];

  let results = [];
  let used = null;
  const errors = [];
  for (let pass = 0; pass < 2 && !results.length; pass++) {
    for (const p of providers) {
      try {
        const html = await getText(p.url);
        const r = p.parse(html, limit);
        if (r.length) { results = r; used = p.name; break; }
        errors.push(p.name + ':empty');
      } catch (e) { errors.push(p.name + ':' + e.message); }
    }
    if (!results.length && pass === 0) await new Promise((r) => setTimeout(r, 600)); // brief wait, then retry
  }

  if (ctx && ctx.log) ctx.log('search_web', { query, count: results.length, used: used || 'none', brave: braveNote });
  if (!results.length) {
    // The normal engines were tried (twice) and returned nothing. Keep the message
    // soft — search MIGHT work next time; Brave is an OPTIONAL reliability upgrade.
    const braveMsg = braveNote.startsWith('brave-http-401') ? 'مفتاح Brave غلط (401) — راجع SOKRO_BRAVE_KEY.'
      : (braveNote.startsWith('brave-http-429') ? 'كوتة Brave خلصت (429) — استنى شوية.'
        : (braveNote && braveNote !== 'no-brave-key' ? ('Brave: ' + braveNote + '. ') : '') +
          'مفيش نتايج دلوقتي — محرّكات البحث بتحجب سيرفر الاستضافة أحياناً. جرّب تاني بعد شوية، أو حط مفتاح Brave (SOKRO_BRAVE_KEY) لبحث مضمون.');
    return { ok: false, error: braveMsg, output: { query, results: [] } };
  }
  return { ok: true, output: { query, engine: used, results } };
}

register({
  name: 'search_web',
  description: 'Search the web and return the top results (title + link + snippet). No login required.',
  permissions: ['network'],
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' }, limit: { type: 'number' } },
    required: ['query'],
  },
  run,
});

module.exports = run;
