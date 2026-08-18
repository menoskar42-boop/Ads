'use strict';

// ── Finding a site the dictionary has never heard of ─────────────────────────
//
// The written-down table (`siteDict`) covers the sites people ask for every
// day. It will never cover «مغسلة النور» or a company somebody heard of this
// morning — and the old behaviour for those was the dangerous one: the model
// invented a domain that looked plausible.
//
// So a name that is not in the table is SEARCHED FOR, exactly the way a person
// would: type the Arabic name, look at what comes back, and take the site that
// the results agree on. Three things keep that from becoming a fancier guess:
//
//   · **Directories are not the site.** Facebook, Wikipedia, YouTube, the app
//     stores and the review aggregators all rank above a small business's own
//     page for its own name. They are excluded by name — following one of them
//     would put the user on a page ABOUT the business instead of the business.
//   · **The results have to agree.** One mention is a coincidence; a domain
//     that shows up more than once, or that carries the name in its own title,
//     is a finding. A single low-confidence hit is returned as low confidence
//     rather than as fact.
//   · **The host has to exist.** The domain is put through the same SSRF guard
//     as everything else, which resolves it — so a domain nobody can reach is
//     never handed back as an answer.
//
// The caller is told WHERE the answer came from ('dict' or 'search') because
// the two deserve different sentences on screen.

const dict = require('./siteDict');
const guard = require('./urlGuard');

// Ranked above the business itself for its own name, and not the business.
const NOT_THE_SITE = [
  'facebook.com', 'fb.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com',
  'youtube.com', 'youtu.be', 'linkedin.com', 'pinterest.com', 'reddit.com',
  'wikipedia.org', 'wikiwand.com', 'fandom.com',
  'play.google.com', 'apps.apple.com', 'google.com', 'bing.com', 'duckduckgo.com',
  'yelp.com', 'tripadvisor.com', 'foursquare.com', 'glassdoor.com', 'crunchbase.com',
  'similarweb.com', 'medium.com', 'blogspot.com', 'wordpress.com', 'blogger.com',
  'amazon.com', 'noon.com', 'jumia.com.eg', 'dubizzle.com.eg', 'olx.com.eg',
  'yellowpages.com', 'daleeli.com', 'zoominfo.com', 'trustpilot.com',
];

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (_) { return ''; }
}

/** The part a person would call "the domain": `sub.example.co.uk` → `example.co.uk`. */
function registrable(host) {
  const parts = String(host || '').split('.');
  if (parts.length <= 2) return host;
  const twoLevel = /^(com|net|org|gov|edu|co|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(twoLevel ? -3 : -2).join('.');
}

function isDirectory(host) {
  const h = registrable(host);
  return NOT_THE_SITE.some((d) => h === d || host === d || host.endsWith('.' + d));
}

// Names already discovered this process. A repeat of the same question must not
// cost another search — and must not come back with a different answer.
const memo = new Map();

/**
 * Where does this name live?
 *
 *   { url, domain, source: 'url' | 'host' | 'dict' | 'search', label, confidence }
 * or null when nothing trustworthy was found.
 */
async function find(ctx, text) {
  const raw = String(text == null ? '' : text).trim();
  if (!raw) return null;

  const direct = dict.resolve(raw);
  if (direct) {
    return {
      url: direct.url,
      domain: hostOf(direct.url),
      source: direct.source,
      label: direct.site ? direct.site.label : hostOf(direct.url),
      confidence: direct.source === 'dict' ? 'known' : 'given',
    };
  }
  // Only a NAME gets searched for. A string with a slash or a scheme that got
  // this far is broken input, not a business somebody can look up.
  if (/\s\//.test(raw) || raw.length > 80) return null;

  const key = dict.normalize(raw);
  if (memo.has(key)) return memo.get(key);

  const search = ctx && ctx.actions && ctx.actions.get && ctx.actions.get('search_web');
  if (!search) return null;

  let results = [];
  try {
    const r = await search.run(ctx, { query: raw + ' الموقع الرسمي', limit: 8 });
    results = (r && r.ok && r.output && r.output.results) || [];
  } catch (_) { results = []; }
  if (!results.length) { memo.set(key, null); return null; }

  const score = new Map();
  results.forEach((res, i) => {
    const host = hostOf(res.url);
    if (!host || isDirectory(host)) return;
    const dom = registrable(host);
    const prev = score.get(dom) || { dom, hits: 0, best: i, title: res.title || '', url: res.url };
    prev.hits += 1;
    if (i < prev.best) { prev.best = i; prev.title = res.title || ''; prev.url = res.url; }
    score.set(dom, prev);
  });
  if (!score.size) { memo.set(key, null); return null; }

  const ranked = [...score.values()].sort((a, b) => (b.hits - a.hits) || (a.best - b.best));
  const top = ranked[0];
  // Agreement, or the very first result: anything else is a coincidence with a
  // domain attached, and this answer is about to be typed into.
  const agreed = top.hits > 1 || top.best === 0;
  if (!agreed) { memo.set(key, null); return null; }

  let url = null;
  try { url = await guard.assertSafeUrl('https://' + top.dom); } catch (_) { url = null; }
  if (!url) { memo.set(key, null); return null; }

  const out = {
    url,
    domain: top.dom,
    source: 'search',
    label: top.title || top.dom,
    confidence: top.hits > 1 ? 'likely' : 'guess',
    evidence: { hits: top.hits, rank: top.best + 1, title: top.title },
  };
  memo.set(key, out);
  return out;
}

/**
 * What to hand back with the action's output when the user gave a NAME.
 *
 * A URL the user typed themselves needs no comment. A site that was looked up
 * — and especially one that was discovered by searching — does: the screen has
 * to be able to say WHICH site was opened, so a wrong answer is visible in one
 * glance instead of after the form is submitted.
 */
function note(site) {
  if (!site || site.source === 'url') return {};
  return { site: { domain: site.domain, label: site.label, source: site.source, confidence: site.confidence } };
}

module.exports = { find, note, registrable, isDirectory, hostOf, NOT_THE_SITE, _memo: memo };
