'use strict';

// Action: fill form fields on a page and (optionally) submit — the first real
// "do something" browser action (login forms, search boxes, checkout steps…).
// Runs in the user's LIVE browser via the extension when connected (so their
// logged-in session + saved passwords apply), otherwise server-side Playwright.
// SENSITIVE (permission 'browser') → the planner/consent gate asks first, and
// the extension shows its own per-domain confirmation.
const { register } = require('./_registry');

// input.fields: [{ selector, value }]  (value may reference a stored secret by
// name via {{secret:name}} — resolved server-side, never shown to the model).
async function resolveSecrets(ctx, fields) {
  const out = [];
  for (const f of fields) {
    let value = String(f.value == null ? '' : f.value);
    const m = value.match(/^\{\{\s*secret:([\w.-]+)\s*\}\}$/i);
    if (m && ctx.userId) {
      try {
        const vault = require('../secrets/vault');
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const row = (await pool.query('SELECT ciphertext FROM sokro_secrets WHERE user_id=$1 AND name=$2', [ctx.userId, m[1].toLowerCase()])).rows[0];
        if (row) value = vault.decrypt(row.ciphertext);
      } catch (_) { /* leave literal if lookup fails */ }
    }
    out.push({ selector: String(f.selector || ''), value });
  }
  return out;
}

async function run(ctx, input) {
  let url = String((input && input.url) || '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'valid http(s) url required' };
  try { url = await require('../lib/urlGuard').assertSafeUrl(url); }
  catch (e) { return { ok: false, error: 'blocked url: ' + e.message }; }

  const rawFields = Array.isArray(input && input.fields) ? input.fields : [];
  if (!rawFields.length && !(input && input.submit)) return { ok: false, error: 'fields or submit required' };
  const fields = await resolveSecrets(ctx, rawFields);
  const submit = input && (input.submit || input.submitSelector);

  // Prefer the user's live browser (extension); secrets are resolved here and
  // sent as concrete values only to the trusted bridge, never to the model.
  const ext = require('../extension-bridge');
  if (ctx.userId && ext.connected(ctx.userId)) {
    const r = await ext.run(ctx.userId, 'fill_submit', { url, fields, submit, consented: !!ctx.consented, keepOpen: !(input && input.keepOpen === false) });
    if (r.ok) { if (ctx.log) ctx.log('fill_submit(ext)', { url, fields: fields.length }); return { ok: true, output: Object.assign({ url }, r.output) }; }
    return { ok: false, error: r.error };
  }
  if (!ctx.browser || !ctx.browser.available()) {
    return { ok: false, error: 'browser engine not installed (run: npm i playwright && npx playwright install chromium)' };
  }
  try {
    const out = await ctx.browser.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      for (const f of fields) {
        if (!f.selector) continue;
        try { await page.fill(f.selector, f.value, { timeout: 8000 }); }
        catch (_) { /* skip a field that isn't found rather than fail the whole task */ }
      }
      let submitted = false;
      if (submit) {
        try { await Promise.all([page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {}), page.click(submit, { timeout: 8000 })]); submitted = true; }
        catch (_) { submitted = false; }
      }
      const text = await page.evaluate(() => (document.body && document.body.innerText || '').slice(0, 6000));
      return { title: await page.title(), url: page.url(), submitted, text };
    });
    if (ctx.log) ctx.log('fill_submit', { url, fields: fields.length, submitted: out.submitted });
    return { ok: true, output: Object.assign({ url }, out) };
  } catch (e) {
    return { ok: false, error: 'fill_submit failed: ' + e.message };
  }
}

register({
  name: 'fill_submit',
  description: 'Fill form fields on a web page and optionally submit (login boxes, search forms, checkout). input.fields=[{selector,value}], optional input.submit=CSS selector of the submit button. A value of "{{secret:NAME}}" is replaced by a stored secret. Requires the user\'s browser.',
  permissions: ['browser', 'submit'],
  // (keepOpen defaults true → the tab with the results stays open in the user's browser)
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      fields: { type: 'array', items: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] } },
      submit: { type: 'string' },
    },
    required: ['url'],
  },
  run,
});

module.exports = run;
