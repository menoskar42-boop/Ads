'use strict';

// Browser action: open a URL in a real browser (Playwright), wait for it to
// load, and extract content — the whole page's visible text, or a specific
// selector's text — with an optional screenshot. This is the foundation for
// login/booking/social actions later. Requires the browser layer (Chromium);
// degrades gracefully with a clear error when it isn't installed.
const { register } = require('./_registry');

async function run(ctx, input) {
  let url = String((input && input.url) || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'valid http(s) url required' };
  // SSRF guard: never let a browse target hit localhost / the private network /
  // the cloud metadata endpoint (server Playwright shares the deployment's LAN).
  try { url = await require('../lib/urlGuard').assertSafeUrl(url); }
  catch (e) { return { ok: false, error: 'blocked url: ' + e.message }; }
  // Prefer the user's LIVE browser via the connected extension (logged-in
  // sessions, no server Chromium). Falls back to server-side Playwright.
  const ext = require('../extension-bridge');
  if (ctx.userId && ext.connected(ctx.userId)) {
    const r = await ext.run(ctx.userId, 'browse', { url, selector: input && input.selector, screenshot: !!(input && input.screenshot) });
    if (r.ok) { if (ctx.log) ctx.log('browse(ext)', { url }); return { ok: true, output: Object.assign({ url }, r.output) }; }
    return { ok: false, error: r.error };
  }
  if (!ctx.browser || !ctx.browser.available()) {
    return { ok: false, error: 'محتاج تشغّل متصفّح سوكرو عشان أدخل الموقع بنفسي: نزّل إضافة كروم من sokro.oscardevs.com/ext ووصّلها، أو فعّل متصفّح السيرفر (Playwright). (browser engine unavailable)' };
  }
  try {
    const out = await ctx.browser.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'load', timeout: 30000 });
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
    if (ctx.log) ctx.log('browse', { url });
    return { ok: true, output: Object.assign({ url }, out) };
  } catch (e) {
    return { ok: false, error: 'browse failed: ' + e.message };
  }
}

register({
  name: 'browse',
  description: 'Open a web page in a real browser and extract its text (optionally a selector + screenshot).',
  permissions: ['browser'],
  inputSchema: { type: 'object', properties: { url: { type: 'string' }, selector: { type: 'string' }, screenshot: { type: 'boolean' } }, required: ['url'] },
  run,
});

module.exports = run;
