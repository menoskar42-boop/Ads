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

const fs = require('fs');

/**
 * Is there actually a browser to launch?
 *
 * `!!playwright` answered a different question: whether the npm PACKAGE is
 * installed. The package is a few megabytes of JavaScript; Chromium is a few
 * hundred megabytes downloaded by a separate command, and on a fresh deploy the
 * first is there and the second is not. So `available()` said yes, the planner
 * offered the browser tools, and every one of them died at launch with
 * "Executable doesn't exist at /root/.cache/ms-playwright/…" — a sentence that
 * reaches the user as a failed task.
 *
 * Written as a pure function of its inputs so the failure modes can be TESTED
 * without installing (or uninstalling) a browser on the machine running the
 * check.
 */
function probe(deps) {
  const pw = deps && 'playwright' in deps ? deps.playwright : playwright;
  const env = (deps && deps.env) || process.env;
  const exists = (deps && deps.existsSync) || fs.existsSync;
  if (!pw) return { ok: false, why: 'package' };
  // An explicitly configured Chromium wins — and if it is not there, that is a
  // misconfiguration to report, not something to quietly fall back from.
  if (env.SOKRO_CHROMIUM_PATH) {
    return exists(env.SOKRO_CHROMIUM_PATH)
      ? { ok: true, why: '', path: env.SOKRO_CHROMIUM_PATH }
      : { ok: false, why: 'custom-missing', path: env.SOKRO_CHROMIUM_PATH };
  }
  let p = '';
  try { p = pw.chromium && pw.chromium.executablePath ? pw.chromium.executablePath() : ''; }
  catch (_) { return { ok: false, why: 'not-installed' }; }
  if (!p) return { ok: false, why: 'not-installed' };
  return exists(p) ? { ok: true, why: '', path: p } : { ok: false, why: 'not-installed', path: p };
}

// The answer is asked on every plan, and a stat call per plan is pointless —
// but a cached NO must not survive an install, so it expires.
let cached = { at: 0, value: null };
function status() {
  if (cached.value && Date.now() - cached.at < 30000) return cached.value;
  cached = { at: Date.now(), value: probe() };
  return cached.value;
}

function available() { return status().ok; }

// What to say when it is not there. One sentence, and the next step in it.
function unavailableMessage(why) {
  return {
    package: 'متصفّح السيرفر مش متثبّت. شغّل: npm i playwright && npx playwright install chromium',
    'not-installed': 'حزمة المتصفّح موجودة بس Chromium نفسه مش متنزّل. شغّل: npx playwright install chromium',
    'custom-missing': 'المسار في SOKRO_CHROMIUM_PATH مش موجود على القرص.',
  }[why] || 'متصفّح السيرفر مش متاح دلوقتي.';
}

// Opens a fresh isolated browser context + page, runs fn(page, context), and
// always cleans up. Isolated context per call = no cross-user session leakage.
async function withPage(fn, opts = {}) {
  {
    // Checked here too, not just in the planner: an action can be reached by a
    // resumed task or a direct API call, and "Executable doesn't exist at …" is
    // not a sentence to hand anybody.
    const st = status();
    if (!st.ok) throw new Error(unavailableMessage(st.why));
  }
  // Container-safe + LOW-MEMORY flags — Chromium won't start inside Replit/containers
  // without --no-sandbox + --disable-dev-shm-usage, and the rest trim RAM so it has
  // a better chance on a small (0.5 GiB) instance. For extreme low memory set
  // SOKRO_BROWSER_SINGLE_PROCESS=1 (uses one process — lighter but less stable on
  // heavy sites). SOKRO_CHROMIUM_PATH points at a system/nix Chromium if needed.
  // Always-safe container flags. The AGGRESSIVE memory caps (single renderer,
  // small JS heap) are gated behind SOKRO_BROWSER_LOWMEM=1 — great on a 0.5 GiB
  // box, but they CHOKE heavy JS sites when you have real RAM (1–2 GiB), so they
  // must NOT be on by default once the instance is bumped.
  const args = [
    '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--disable-extensions', '--disable-background-networking',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--disable-features=TranslateUI',
  ];
  if (process.env.SOKRO_BROWSER_LOWMEM === '1') {
    args.push('--no-zygote', '--renderer-process-limit=1', '--js-flags=--max-old-space-size=256', '--disable-features=IsolateOrigins,site-per-process,TranslateUI');
  }
  if (process.env.SOKRO_BROWSER_SINGLE_PROCESS === '1') args.push('--single-process');
  const launchOpts = { headless: opts.headless !== false, args };
  if (process.env.SOKRO_CHROMIUM_PATH) launchOpts.executablePath = process.env.SOKRO_CHROMIUM_PATH;
  const browser = await playwright.chromium.launch(launchOpts);
  try {
    const context = await browser.newContext({
      // A real browser UA — many sites serve empty/blocked pages to obvious bots.
      userAgent: opts.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: opts.viewport || { width: 1280, height: 800 },
      locale: 'ar-EG',
    });
    if (opts.storageState) await context.addCookies(opts.storageState.cookies || []);
    const page = await context.newPage();
    return await fn(page, context);
  } finally {
    await browser.close();
  }
}

module.exports = { available, status, probe, unavailableMessage, withPage };
