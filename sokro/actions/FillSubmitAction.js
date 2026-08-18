'use strict';

// Action: fill form fields on a page and (optionally) submit — the first real
// "do something" browser action (login forms, search boxes, checkout steps…).
// Runs in the user's LIVE browser via the extension when connected (so their
// logged-in session + saved passwords apply), otherwise server-side Playwright.
// SENSITIVE (permission 'browser') → the planner/consent gate asks first, and
// the extension shows its own per-domain confirmation.
const { register } = require('./_registry');
const SF = require('../lib/siteFinder');

// ── Half a form, reported as a whole one ─────────────────────────────────────
//
// A field whose selector did not match was SKIPPED — "rather than fail the
// whole task" — and the action still returned ok. Then it clicked submit. On a
// government booking form that means a request went in with the name filled and
// the national ID empty, or the other way round, and the user was told it
// worked. There is no worse outcome available here: a clean failure costs a
// retry, a silent half-submission costs an appointment nobody can trace.
//
// So: every requested field must land, NOTHING is submitted when one did not,
// and what actually happened comes back in the answer.
//
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

// The same fallbacks the extension uses, so «اكتب في خانة البحث» (which the
// planner sends as an EMPTY selector) works on the server path too. It used to
// `continue` past an empty selector, filling nothing and reporting success.
const SEARCH_BOXES = [
  'input[type="search"]', 'input[name="q"]', 'textarea[name="q"]',
  'input[aria-label*="search" i]', 'input[placeholder*="بحث"]',
  'input[placeholder*="search" i]', '[role="search"] input',
  'input[type="text"]', 'textarea',
];

async function fillOne(page, f, used) {
  // A GIVEN selector is used as given. The candidate list is the fallback for
  // «اكتب في خانة البحث» only — running it after a missed selector is how a
  // national ID ends up in the name box on a form that then looks complete.
  if (f.selector) {
    try { await page.fill(f.selector, f.value, { timeout: 8000 }); return f.selector; }
    catch (_) { return null; }
  }
  for (const sel of SEARCH_BOXES) {
    if (used.includes(sel)) continue;   // never two values into one box
    try {
      await page.fill(sel, f.value, { timeout: 1500 });
      return sel;
    } catch (_) { /* try the next candidate */ }
  }
  return null;
}

// What the user is told. The numbers matter: "2 of 3" is the difference between
// a retry and a form somebody has to go and cancel.
function partialMessage(missed, total) {
  return 'مقدرتش أملا ' + missed.length + ' من ' + total + ' خانة في الصفحة'
    + (missed.length ? ' (' + missed.join('، ') + ')' : '')
    + ' — وماضغطتش إرسال، عشان مايتبعتش نص بيانات. الصفحة مفتوحة قدامك.';
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
  try { url = await require('../lib/urlGuard').assertSafeUrl(url); }
  catch (e) { return SF.cannotOpen(url, e.message); }

  const rawFields = Array.isArray(input && input.fields) ? input.fields : [];
  // An EMPTY submit means "press Enter / submit the form", which is exactly what
  // the planner sends for «افتح جوجل واكتب كذا». Treating it as falsy meant the
  // box was filled and never submitted — and the task said it was done.
  const rawSubmit = input && (input.submit != null ? input.submit : input.submitSelector);
  const wantsSubmit = rawSubmit != null;
  const submit = wantsSubmit ? String(rawSubmit) : null;
  if (!rawFields.length && !wantsSubmit) return { ok: false, error: 'fields or submit required' };
  const fields = await resolveSecrets(ctx, rawFields);

  // Prefer the user's live browser (extension); secrets are resolved here and
  // sent as concrete values only to the trusted bridge, never to the model.
  const ext = require('../extension-bridge');
  if (ctx.userId && ext.connected(ctx.userId)) {
    const r = await ext.run(ctx.userId, 'fill_submit', { url, fields, submit, wantsSubmit, consented: !!ctx.consented, keepOpen: !(input && input.keepOpen === false) });
    if (!r.ok) return { ok: false, error: r.error };
    const o = r.output || {};
    if (ctx.log) ctx.log('fill_submit(ext)', { url, fields: fields.length, filled: o.filled, submitted: o.submitted });
    const out = Object.assign({ url }, SF.note(site), o);
    // The extension reports how many fields it actually found. Ignoring that
    // number is what made a half-filled form look like a finished one.
    const filled = Number(o.filled || 0);
    if (fields.length && filled < fields.length) {
      return { ok: false, error: partialMessage(o.missed || [], fields.length), errorCode: 'partial_fill', output: out };
    }
    if (wantsSubmit && !o.submitted) {
      return { ok: false, error: 'البيانات اتكتبت بس مقدرتش أضغط إرسال. الصفحة مفتوحة قدامك عشان تراجع وتبعت بنفسك.', errorCode: 'not_submitted', output: out };
    }
    return { ok: true, output: out };
  }
  if (!ctx.browser || !ctx.browser.available()) {
    return { ok: false, error: 'browser engine not installed (run: npm i playwright && npx playwright install chromium)' };
  }
  try {
    const out = await ctx.browser.withPage(async (page) => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const missed = [];
      const used = [];
      let lastSelector = null;
      for (const f of fields) {
        const hit = await fillOne(page, f, used);
        if (hit) { used.push(hit); lastSelector = hit; }
        else missed.push(f.selector || 'خانة البحث');
      }
      let submitted = false;
      // Nothing is submitted while a field is missing. This is the whole point:
      // an incomplete form that was never sent is a retry; one that was sent is
      // somebody's appointment with half their details on it.
      if (wantsSubmit && !missed.length) {
        const press = async () => {
          if (submit) { await page.click(submit, { timeout: 8000 }); return true; }
          if (lastSelector) { await page.press(lastSelector, 'Enter', { timeout: 8000 }); return true; }
          return false;
        };
        try {
          const nav = page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
          submitted = await press();
          await nav;
        } catch (_) { submitted = false; }
      }
      const text = await page.evaluate(() => (document.body && document.body.innerText || '').slice(0, 6000));
      return { title: await page.title(), url: page.url(), filled: fields.length - missed.length, missed, submitted, text };
    });
    if (ctx.log) ctx.log('fill_submit', { url, fields: fields.length, filled: out.filled, submitted: out.submitted });
    const payload = Object.assign({ url }, SF.note(site), out);
    if (out.missed.length) {
      return { ok: false, error: partialMessage(out.missed, fields.length), errorCode: 'partial_fill', output: payload };
    }
    if (wantsSubmit && !out.submitted) {
      return { ok: false, error: 'البيانات اتكتبت بس مقدرتش أضغط إرسال. الصفحة مفتوحة قدامك عشان تراجع وتبعت بنفسك.', errorCode: 'not_submitted', output: payload };
    }
    return { ok: true, output: payload };
  } catch (e) {
    return { ok: false, error: 'مقدرتش أكمّل الفورم: ' + e.message, errorCode: 'failed' };
  }
}

register({
  name: 'fill_submit',
  description: 'Fill form fields on a web page and optionally submit (login boxes, search forms, checkout). input.fields=[{selector,value}], optional input.submit=CSS selector of the submit button. A value of "{{secret:NAME}}" is replaced by a stored secret. Requires the user\'s browser.',
  permissions: ['browser', 'submit'],
  // Typing into a search box may be repeated; sending a form may not. A retry
  // after a submit whose reply was lost is a second booking on the same name.
  retryable: (input) => !(input && (input.submit != null || input.submitSelector != null)),
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
