'use strict';

// Browser action: open a URL in a real browser (Playwright), wait for it to
// load, and extract content — the whole page's visible text, or a specific
// selector's text — with an optional screenshot. This is the foundation for
// login/booking/social actions later. Requires the browser layer (Chromium);
// degrades gracefully with a clear error when it isn't installed.
const { register } = require('./_registry');
const SF = require('../lib/siteFinder');

// Toggle the www. prefix so a wrong-guessed host (sylndr.com vs www.sylndr.com)
// can be retried automatically.
function wwwVariant(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith('www.') ? u.hostname.slice(4) : 'www.' + u.hostname;
    return u.href;
  } catch (_) { return null; }
}

async function run(ctx, input) {
  let url = String((input && input.url) || '').trim();
  // A name, not a URL: «سيلندر» is a site the user can name and the model
  // cannot spell. Looked up in the written-down table, and — for a name nobody
  // wrote down — searched for the way a person would. Never guessed.
  let site = null;
  {
    site = await SF.find(ctx, url);
    if (!site) return SF.cannotOpen(url, 'not_found');
    url = site.url;
  }
  // SSRF guard: never let a browse target hit localhost / the private network /
  // the cloud metadata endpoint (server Playwright shares the deployment's LAN).
  try { url = await require('../lib/urlGuard').assertSafeUrl(url); }
  catch (e) { return SF.cannotOpen(url, e.message); }
  // Prefer the user's LIVE browser via the connected extension (logged-in
  // sessions, no server Chromium). Falls back to server-side Playwright.
  const ext = require('../extension-bridge');
  if (ctx.userId && ext.connected(ctx.userId)) {
    // Keep the opened tab OPEN by default — the user asked to open a page in their
    // browser and expects to see it. Only internal callers that scrape-and-discard
    // (e.g. navigate_site hops) pass keepOpen:false to avoid leaving a trail of tabs.
    const keepOpen = !(input && input.keepOpen === false);
    const r = await ext.run(ctx.userId, 'browse', { url, selector: input && input.selector, screenshot: !!(input && input.screenshot), keepOpen });
    if (r.ok) { if (ctx.log) ctx.log('browse(ext)', { url }); return { ok: true, output: Object.assign({ url }, SF.note(site), r.output) }; }
    return { ok: false, error: r.error };
  }
  if (!ctx.browser || !ctx.browser.available()) {
    return { ok: false, error: 'محتاج تشغّل متصفّح سوكرو عشان أدخل الموقع بنفسي: نزّل إضافة كروم من sokro.oscardevs.com/ext ووصّلها، أو فعّل متصفّح السيرفر (Playwright). (browser engine unavailable)' };
  }
  try {
    let usedUrl = url;
    const out = await ctx.browser.withPage(async (page) => {
      // Try the URL; on a navigation failure, retry the www-toggled host once.
      try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); }
      catch (e) {
        const alt = wwwVariant(url);
        if (!alt || alt === url) throw e;
        await page.goto(alt, { waitUntil: 'load', timeout: 30000 });
        usedUrl = alt;
      }
      // Let a JS/SPA site (like a car marketplace) finish rendering its links.
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      const sel = input && input.selector;
      const data = await page.evaluate((s) => {
        const el = s ? document.querySelector(s) : document.body;
        const text = el ? (el.innerText || '').slice(0, 8000) : '';
        // Return the page's links too, so the model can NAVIGATE INSIDE the site
        // (open the listing, then follow a car/detail link) instead of web search.
        const seen = new Set(); const links = [];
        document.querySelectorAll('a[href]').forEach((a) => {
          const href = a.href; if (!/^https?:/.test(href) || seen.has(href)) return;
          seen.add(href);
          links.push({ text: (a.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80), url: href });
        });
        return { text, links: links.slice(0, 80) };
      }, sel || null);
      let screenshot = null;
      if (input && input.screenshot) {
        const buf = await page.screenshot({ fullPage: false });
        screenshot = 'data:image/png;base64,' + buf.toString('base64');
      }
      const title = await page.title();
      return { title, text: data.text, links: data.links, screenshot };
    });
    if (ctx.log) ctx.log('browse', { url: usedUrl });
    return { ok: true, output: Object.assign({ url: usedUrl }, SF.note(site), out) };
  } catch (e) {
    return { ok: false, error: 'browse failed: ' + e.message };
  }
}

register({
  name: 'browse',
  description: 'Open a web page in a real browser and extract its text (optionally a selector + screenshot). Set keepOpen=true to just OPEN the site and LEAVE the tab open (for "افتح/روح لموقع X" where the user wants the site to stay open in front of them).',
  permissions: ['browser'],
  inputSchema: { type: 'object', properties: { url: { type: 'string' }, selector: { type: 'string' }, screenshot: { type: 'boolean' }, keepOpen: { type: 'boolean' } }, required: ['url'] },
  run,
});

module.exports = run;
