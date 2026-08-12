#!/usr/bin/env node
/**
 * A page is in the sitemap or it is noindex. Never both.
 *
 * That is #17 in docs/SEO_MISTAKES_LOG.md, and it has already happened twice on
 * this site: /privacy and /terms were listed while rendering noindex, and the
 * sitemap's tenant gate fell through to the portfolio rule for any page_type it
 * did not name, so furniture pages were listed while tenant.js always made them
 * noindex. Both were fixed by hand and nothing stopped them coming back.
 *
 * Telling Google "index this" and "do not index this" about the same URL is not
 * a small inconsistency — it wastes crawl budget on pages we do not want found
 * and it is the signal that a site does not know its own mind.
 *
 * This renders every STATIC entry the sitemap lists (the tenant ones need a
 * database and are gated in code that check-page-types already covers) and
 * fails if any of them comes back noindex, or if a page the audit renders as
 * indexable is missing from the sitemap entirely.
 *
 *   node scripts/check-sitemap.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let ejs;
try { ejs = require('ejs'); }
catch (e) { console.log('⏭️  ejs مش منزّل — الفحص ده محتاج node_modules.'); process.exit(2); }

const { base } = require('./seo-audit');

let fail = 0;
const check = (label, ok, extra) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (extra ? ' — ' + extra : ''));
  if (!ok) fail++;
};

// The static list in the sitemap route.
const legal = fs.readFileSync(path.join(ROOT, 'src/routes/legal.js'), 'utf8');
const block = (legal.match(/router\.get\('\/sitemap\.xml'[\s\S]*?const urls = \[([\s\S]*?)\n\s*\];/) || [])[1] || '';
const listed = [...block.matchAll(/\{\s*loc:\s*'([^']+)'/g)].map((m) => m[1]);
check('the sitemap has a static URL list', listed.length > 0, `${listed.length} رابط`);

// Which template answers each path. Only paths with a fixed template are here;
// anything data-driven is covered by check-page-types.js instead.
const PAGE = {
  '/': 'home.ejs',
  '/about': 'legal/about.ejs',
  '/contact': 'legal/contact.ejs',
  '/faq': 'legal/faq.ejs',
  '/help': 'legal/help.ejs',
  '/our-work': 'legal/our_work.ejs',
  '/apply': 'apply/form.ejs',
  '/dental': 'landing/dental.ejs',
  '/workshop': 'landing/workshop.ejs',
  '/blog': 'blog/index.ejs',
};
const LOCALS = {
  '/contact': { sent: false, error: null, showAds: false },
  '/apply': { showAds: false, error: null, values: {} },
};

const VIEWS = path.join(ROOT, 'src/views');
const { ARTICLES } = require('../src/routes/blog_articles');
const latest = ARTICLES.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

const unknown = [];
for (const loc of listed) {
  const file = PAGE[loc];
  if (!file) { unknown.push(loc); continue; }
  const full = path.join(VIEWS, file);
  let html;
  try {
    html = ejs.render(fs.readFileSync(full, 'utf8'),
      base(Object.assign({ articles: ARTICLES, latest, canonicalUrl: 'https://oscardevs.com' + loc }, LOCALS[loc] || {})),
      { filename: full, root: VIEWS });
  } catch (e) {
    check(`${loc} بترسم`, false, e.message.split('\n')[0]);
    continue;
  }
  const noindex = /<meta name="robots" content="[^"]*noindex/.test(html);
  check(`${loc} في السايت‌ماب ومش noindex`, !noindex,
    noindex ? 'الصفحة بتقول noindex وهي مدرجة — تناقض صريح' : '');
}

// A path in the sitemap with no template here is not a failure — it may be
// data-driven — but it is worth naming so the list does not silently rot.
if (unknown.length) console.log(`ℹ️  ${unknown.length} مسار مش متغطّى هنا (ديناميكي أو محتاج قاعدة): ${unknown.join(' ')}`);

// The reverse direction: a page the site renders as indexable and never lists
// is a page nobody will find. /workshop was added this session and would have
// been easy to build and forget.
{
  const shouldBeListed = ['/dental', '/workshop', '/our-work', '/faq', '/help'];
  const missing = shouldBeListed.filter((p) => !listed.includes(p));
  check('كل صفحة قطاعية/محتوى مدرجة في السايت‌ماب', missing.length === 0, missing.join(' '));
}

// #2: the sitemap must list canonical URLs, never a path that redirects.
{
  const redirecting = listed.filter((l) => /^\/view\//.test(l));
  check('مفيش روابط /view/ في السايت‌ماب (بتعمل redirect)', redirecting.length === 0, redirecting.join(' '));
}

console.log(fail ? `\n${fail} مشكلة — noindex والسايت‌ماب ما يجتمعوش.` : '\nالسايت‌ماب متسق مع الفهرسة.');
process.exit(fail ? 1 : 0);
