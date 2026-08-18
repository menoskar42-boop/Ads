'use strict';

// Browser action: open a URL and extract an HTML table as rows (arrays of cell
// text). Feeds naturally into the Reports layer (Excel/CSV). Requires the
// browser layer (Chromium); degrades gracefully when it isn't installed.
const { register } = require('./_registry');

async function run(ctx, input) {
  let url = String((input && input.url) || '').trim();
  // A name, not a URL: «سيلندر» is a site the user can name and the model
  // cannot spell. Looked up in a written-down table — never guessed.
  {
    const hit = require('../lib/siteDict').resolve(url);
    if (!hit) return { ok: false, error: 'valid http(s) url required' };
    url = hit.url;
  }
  try { url = await require('../lib/urlGuard').assertSafeUrl(url); }
  catch (e) { return { ok: false, error: 'blocked url: ' + e.message }; }
  const ext = require('../extension-bridge');
  if (ctx.userId && ext.connected(ctx.userId)) {
    const r = await ext.run(ctx.userId, 'extract_table', { url, selector: input && input.selector });
    if (r.ok) { if (ctx.log) ctx.log('extract_table(ext)', { url }); return { ok: true, output: Object.assign({ url }, r.output) }; }
    return { ok: false, error: r.error };
  }
  if (!ctx.browser || !ctx.browser.available()) {
    return { ok: false, error: 'محتاج تشغّل متصفّح سوكرو (إضافة كروم من sokro.oscardevs.com/ext) أو متصفّح السيرفر عشان أدخل الموقع. (browser engine unavailable)' };
  }
  try {
    const rows = await ctx.browser.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const sel = (input && input.selector) || 'table';
      return await page.evaluate((s) => {
        const t = document.querySelector(s);
        if (!t) return [];
        const out = [];
        t.querySelectorAll('tr').forEach((tr) => {
          const cells = [...tr.querySelectorAll('th,td')].map((td) => (td.innerText || '').trim());
          if (cells.length) out.push(cells);
        });
        return out.slice(0, 200);
      }, sel);
    });
    if (ctx.log) ctx.log('extract_table', { url, rows: rows.length });
    return { ok: true, output: { url, rows } };
  } catch (e) {
    return { ok: false, error: 'extract failed: ' + e.message };
  }
}

register({
  name: 'extract_table',
  description: 'Open a web page and extract an HTML table as rows (for reports/Excel).',
  permissions: ['browser'],
  inputSchema: { type: 'object', properties: { url: { type: 'string' }, selector: { type: 'string' } }, required: ['url'] },
  run,
});

module.exports = run;
