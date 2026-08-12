#!/usr/bin/env node
/**
 * Guard robots.txt against the rule everyone gets wrong.
 *
 * A crawler obeys ONLY the most specific group that matches its user-agent, and
 * inherits NOTHING from `User-agent: *`. So naming a bot in its own group and
 * giving it a friendly "Allow: /" does not grant it the default rules — it
 * grants it everything, silently dropping every Disallow the default group has.
 *
 * That is exactly what this file said for the five AI crawlers, under a comment
 * claiming they had "the same access as the default group". /demo/ is public and
 * full of sample tenant data, so an assistant could have quoted invented
 * products and prices as a real pharmacy's stock.
 *
 * Two things asserted here, both no-dependency:
 *   · every named group carries at least the default group's Disallow rules
 *   · the AdSense and AI crawlers are not blocked from public content, because
 *     over-correcting this is the opposite failure (#3 and #9 in
 *     docs/SEO_MISTAKES_LOG.md are both about blocking too much)
 *
 *   node scripts/check-robots.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'public/robots.txt'), 'utf8');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

// Parse into groups: consecutive User-agent lines share the directives below them.
const groups = [];
let cur = null;
for (const raw of src.split('\n')) {
  const line = raw.replace(/#.*$/, '').trim();
  if (!line) continue;
  const m = /^(user-agent|allow|disallow|sitemap)\s*:\s*(.*)$/i.exec(line);
  if (!m) continue;
  const key = m[1].toLowerCase(), val = m[2].trim();
  if (key === 'user-agent') {
    if (!cur || cur.directives.length) { cur = { agents: [], directives: [] }; groups.push(cur); }
    cur.agents.push(val);
  } else if (key !== 'sitemap' && cur) {
    cur.directives.push({ key, val });
  }
}

const star = groups.find((g) => g.agents.includes('*'));
if (!star) {
  check('there is a default (User-agent: *) group', false);
} else {
  const baseline = star.directives.filter((d) => d.key === 'disallow' && d.val).map((d) => d.val);
  check('the default group exists', true, `${baseline.length} disallow rules`);

  // Crawlers that must be able to read the ad context or the content itself are
  // allowed to have a shorter list — but only these, and only deliberately.
  const MAY_SEE_MORE = new Set(['Mediapartners-Google']);
  for (const g of groups) {
    for (const agent of g.agents) {
      if (agent === '*' || MAY_SEE_MORE.has(agent)) continue;
      const mine = g.directives.filter((d) => d.key === 'disallow' && d.val).map((d) => d.val);
      const missing = baseline.filter((b) => !mine.includes(b));
      check(`${agent} carries the default disallows`, missing.length === 0,
        missing.length ? 'inherits nothing, so it is allowed into: ' + missing.join(' ') : `${mine.length} rules`);
    }
  }
}

// The opposite failure: blocking what has to stay open.
//
// OAI-SearchBot and OAI-AdsBot are listed for a reason that is easy to miss:
// OpenAI runs several bots and they do different jobs. GPTBot collects training
// data; OAI-SearchBot is the one that fetches a page so ChatGPT can answer with
// it *now*. Declaring GPTBot and calling it "we allow ChatGPT" is the mistake —
// it grants the crawler that cannot cite us and stays silent about the one that
// can. https://platform.openai.com/docs/bots
const named = groups.flatMap((g) => g.agents);
for (const bot of ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'OAI-AdsBot',
  'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Mediapartners-Google']) {
  const g = groups.find((x) => x.agents.includes(bot));
  check(`${bot} is not blocked from public content`,
    !!g && g.directives.some((d) => d.key === 'allow' && d.val === '/'),
    g ? '' : 'not named at all — falls back to the default group, which is fine but undeclared');
}
check('image assets stay crawlable (#3 in the mistakes log)',
  !/Disallow:\s*\/uploads\//i.test(src));
check('a sitemap is declared', /^Sitemap:\s*https?:\/\/\S+/im.test(src));
// #9: a static file must not shadow a dynamic route of the same path.
check('no dynamic /robots.txt route competing with this file',
  !/router\.get\(\s*['"]\/robots\.txt/.test(fs.readFileSync(path.join(ROOT, 'src/routes/legal.js'), 'utf8')));

console.log(fail ? `\n${fail} مشكلة في robots.txt.` : `\nrobots.txt سليم (${named.length} مجموعة).`);
process.exit(fail ? 1 : 0);
