'use strict';

// ── Browser Layer (swappable) ────────────────────────────────────────────────
// Default engine = Playwright, loaded via a LAZY/optional require so the base
// deployment stays light — Chromium is only needed once real browser actions run
// (login, forms, booking…). Search/report/image actions don't need it.
//
// To activate browser automation on the server:
//   npm i playwright && npx playwright install chromium
//
// The engine can later be swapped for Chrome CDP / Stagehand / Browser-Use
// without touching any Action, because actions only use withPage() + the page
// helpers below — never Playwright directly.
let playwright = null;
try { playwright = require('playwright'); } catch (_) { /* optional — install to enable */ }

function available() { return !!playwright; }

// Opens a fresh isolated browser context + page, runs fn(page, context), and
// always cleans up. Isolated context per call = no cross-user session leakage.
async function withPage(fn, opts = {}) {
  if (!playwright) {
    throw new Error('browser engine not installed — run: npm i playwright && npx playwright install chromium');
  }
  const browser = await playwright.chromium.launch({ headless: opts.headless !== false });
  try {
    const context = await browser.newContext({
      userAgent: opts.userAgent || 'Mozilla/5.0 (compatible; SokroBot/1.0)',
      viewport: opts.viewport || { width: 1280, height: 800 },
    });
    if (opts.storageState) await context.addCookies(opts.storageState.cookies || []);
    const page = await context.newPage();
    return await fn(page, context);
  } finally {
    await browser.close();
  }
}

module.exports = { available, withPage };
