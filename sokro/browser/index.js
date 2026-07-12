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
  // Container-safe + LOW-MEMORY flags — Chromium won't start inside Replit/containers
  // without --no-sandbox + --disable-dev-shm-usage, and the rest trim RAM so it has
  // a better chance on a small (0.5 GiB) instance. For extreme low memory set
  // SOKRO_BROWSER_SINGLE_PROCESS=1 (uses one process — lighter but less stable on
  // heavy sites). SOKRO_CHROMIUM_PATH points at a system/nix Chromium if needed.
  const args = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--no-zygote', '--disable-extensions', '--disable-background-networking',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-features=IsolateOrigins,site-per-process,TranslateUI',
    '--renderer-process-limit=1', '--js-flags=--max-old-space-size=256',
  ];
  if (process.env.SOKRO_BROWSER_SINGLE_PROCESS === '1') args.push('--single-process');
  const launchOpts = { headless: opts.headless !== false, args };
  if (process.env.SOKRO_CHROMIUM_PATH) launchOpts.executablePath = process.env.SOKRO_CHROMIUM_PATH;
  const browser = await playwright.chromium.launch(launchOpts);
  try {
    const context = await browser.newContext({
      // A real browser UA — many sites serve empty/blocked pages to obvious bots.
      userAgent: opts.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: opts.viewport || { width: 1024, height: 720 },
      locale: 'ar-EG',
    });
    if (opts.storageState) await context.addCookies(opts.storageState.cookies || []);
    const page = await context.newPage();
    return await fn(page, context);
  } finally {
    await browser.close();
  }
}

module.exports = { available, withPage };
