'use strict';

// Browser action: open a URL in a real browser (Playwright), wait for it to
// load, and extract content — the whole page's visible text, or a specific
// selector's text — with an optional screenshot. This is the foundation for
// login/booking/social actions later. Requires the browser layer (Chromium);
// degrades gracefully with a clear error when it isn't installed.
const { register } = require('./_registry');

async function run(ctx, input) {
  const url = String((input && input.url) || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'valid http(s) url required' };
  // Prefer the user's LIVE browser via the connected extension (logged-in
  // sessions, no server Chromium). Falls back to server-side Playwright.
  const ext = require('../extension-bridge');
  if (ctx.userId && ext.connected(ctx.userId)) {
    const r = await ext.run(ctx.userId, 'browse', { url, selector: input && input.selector, screenshot: !!(input && input.screenshot) });
    if (r.ok) { if (ctx.log) ctx.log('browse(ext)', { url }); return { ok: true, output: Object.assign({ url }, r.output) }; }
    return { ok: false, error: r.error };
  }
  if (!ctx.browser || !ctx.browser.available()) {
    return { ok: false, error: 'browser engine not installed (run: npm i playwright && npx playwright install chromium)' };
  }
  try {
    const out = await ctx.browser.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const sel = input && input.selector;
      const text = await page.evaluate((s) => {
        const el = s ? document.querySelector(s) : document.body;
        return el ? (el.innerText || '').slice(0, 8000) : '';
      }, sel || null);
      let screenshot = null;
      if (input && input.screenshot) {
        const buf = await page.screenshot({ fullPage: false });
        screenshot = 'data:image/png;base64,' + buf.toString('base64');
      }
      const title = await page.title();
      return { title, text, screenshot };
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
