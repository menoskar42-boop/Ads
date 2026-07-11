'use strict';

// First Action — proves the plugin registry end-to-end. Searches the web via
// DuckDuckGo's HTML endpoint over plain HTTP, so it works on the base deployment
// with NO browser/Chromium. Browser-based actions (login/forms/booking) use the
// browser layer instead.
const { register } = require('./_registry');

async function run(ctx, input) {
  const query = String((input && input.query) || '').trim();
  if (!query) return { ok: false, error: 'query required' };
  const limit = Math.min(Math.max(parseInt(input && input.limit, 10) || 8, 1), 20);

  const url = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query);
  let html;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SokroBot/1.0)' } });
    if (!r.ok) return { ok: false, error: 'search failed ' + r.status };
    html = await r.text();
  } catch (e) {
    return { ok: false, error: 'search request failed: ' + e.message };
  }

  const results = [];
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && results.length < limit) {
    let link = m[1];
    // DDG wraps links in a redirect (…?uddg=<encoded>) — unwrap to the real URL.
    const um = link.match(/[?&]uddg=([^&]+)/);
    if (um) link = decodeURIComponent(um[1]);
    const title = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (title && /^https?:\/\//.test(link)) results.push({ title, url: link });
  }

  if (ctx && ctx.log) ctx.log('search_web', { query, count: results.length });
  return { ok: true, output: { query, results } };
}

register({
  name: 'search_web',
  description: 'Search the web and return the top results (title + link). No login required.',
  permissions: ['network'],
  inputSchema: {
    type: 'object',
    properties: { query: { type: 'string' }, limit: { type: 'number' } },
    required: ['query'],
  },
  run,
});

module.exports = run;
