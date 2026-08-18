'use strict';

// Action: NAVIGATE INSIDE a website toward a goal (not web search). A small agent
// loop — open a page, let the model read its text + links and pick the next link
// (same-site preferred), repeat until it finds the answer or runs out of hops.
// This is how "ادخل الموقع ودوّر جوّه على كذا" actually works for JS sites whose
// deep pages aren't in search engines. Reuses the browse action (extension or
// server Playwright, SSRF-guarded, returns page links).
const { register } = require('./_registry');

function sameHost(a, b) { try { return new URL(a).host === new URL(b).host; } catch (_) { return false; } }

async function run(ctx, input) {
  const goal = String((input && (input.goal || input.query)) || '').trim();
  // «ادخل سيلندر ودوّر على…» — the site arrives as a name people say, not as a
  // URL the model can spell. Resolved from the table, or refused honestly.
  const SF = require('../lib/siteFinder');
  const site = await SF.find(ctx, (input && input.url) || '');
  if (!site) return SF.cannotOpen((input && input.url) || '', 'not_found');
  const startUrl = site.url;
  const browse = ctx.actions && ctx.actions.get('browse');
  if (!browse) return { ok: false, error: 'browse action unavailable' };

  const maxHops = Math.min(Math.max(parseInt(input && input.maxHops, 10) || 3, 1), 5);
  const visited = new Set();
  const trail = [];
  let current = startUrl;
  let answer = null;

  for (let hop = 0; hop < maxHops; hop++) {
    if (visited.has(current)) break;
    visited.add(current);
    const r = await browse.run(ctx, { url: current, keepOpen: false }); // scrape hops: don't leave tabs open
    if (!r.ok) { trail.push({ url: current, error: r.error }); if (hop === 0) return { ok: false, error: r.error }; break; }
    const page = r.output || {};
    trail.push({ url: current, title: page.title || '' });

    const links = (page.links || []).filter((l) => l.url && sameHost(l.url, startUrl)).slice(0, 40);
    const sys = 'You are navigating a website toward a goal. Read the current page text and its links, then decide: is the goal already answered on THIS page, or which link should be opened next to get closer? Prefer same-site links. Reply ONLY as JSON: {"done":true|false,"answer":"the info found so far (Arabic), if done","next":"exact url from the links to open next, or empty string"}.';
    const user = `Goal: ${goal}\nCurrent URL: ${current}\nPage text:\n${(page.text || '').slice(0, 3500)}\n\nLinks:\n${links.map((l, i) => `${i}. ${l.text} → ${l.url}`).join('\n')}`;
    let dec = null;
    try { dec = await ctx.llm.json({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }] }); } catch (_) {}
    if (ctx.log) ctx.log('navigate_site', { hop, url: current, done: !!(dec && dec.done) });
    if (dec && dec.done) { answer = dec.answer || ''; break; }
    const next = dec && dec.next && /^https?:\/\//.test(dec.next) ? dec.next : null;
    if (!next || visited.has(next)) break;
    current = next;
  }

  if (!answer && trail.length) {
    // No explicit answer — hand back what we saw so the summarizer can use it.
    answer = 'زُرت ' + trail.length + ' صفحة داخل الموقع. آخر صفحة: ' + (trail[trail.length - 1].url || '');
  }
  return { ok: true, output: Object.assign({ goal, startUrl, hops: trail.length, trail, answer },
    SF.note(site)) };
}

register({
  name: 'navigate_site',
  description: 'Navigate INSIDE a specific website toward a goal (open the site, follow its own links to find something) — use this instead of search_web when the user wants content from inside one site (e.g. "ادخل موقع X ودوّر على Y"، "افتح سيلندر وهات تقرير فحص عربية"). input.url = the site or its listing page, input.goal = what to find.',
  permissions: ['browser'],
  inputSchema: { type: 'object', properties: { url: { type: 'string' }, goal: { type: 'string' }, maxHops: { type: 'number' } }, required: ['url', 'goal'] },
  run,
});

module.exports = run;
