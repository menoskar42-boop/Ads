#!/usr/bin/env node
/**
 * Guard the async-error patch.
 *
 * Express 4 does not understand promises: when an `async (req, res) => {}`
 * handler rejects, `res` is never written and the request hangs — the visitor
 * gets a spinner until the browser gives up, and the only trace is a line in
 * the console. src/lib/async_routes.js patches the Router prototype so a
 * rejected handler reaches the error middleware instead.
 *
 * The patch has one fragile requirement: it must be applied BEFORE any route
 * module is required, because route files register their handlers at load time.
 * Move that require line below the route requires in server.js and everything
 * still boots, still passes every other check, and silently goes back to
 * hanging. So this asserts the ordering, and then loads the real routers and
 * counts how many of their handlers actually came out wrapped.
 *
 * Usage: node scripts/check-async-routes.js
 */
'use strict';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/none';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let failed = 0;
const check = (label, ok, why) => {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
};

// ── 1. Ordering in server.js ────────────────────────────────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const patchAt = src.indexOf("require('./src/lib/async_routes')");
  const firstRoute = src.search(/require\('\.\/src\/routes\//);
  check('server.js applies the async patch before requiring any route module',
    patchAt !== -1 && firstRoute !== -1 && patchAt < firstRoute,
    patchAt === -1
      ? "src/lib/async_routes is never applied — every async handler can hang."
      : 'The patch runs at char ' + patchAt + ' but the first route module is required at '
        + firstRoute + '. Handlers registered before the patch are not wrapped.');

  // The error middleware is what the patch hands rejections to. Without it,
  // Express' built-in finalhandler answers instead — a bare stack trace.
  const errHandler = /app\.use\(\s*\(\s*err\s*,\s*req\s*,\s*res\s*,\s*next\s*\)/.test(src);
  check('server.js registers a four-argument error handler', errHandler,
    'The patch forwards errors with next(err); with no error middleware they\n   '
    + "reach Express' default handler, which leaks a stack trace to the visitor.");

  const notFoundAt = src.search(/res\.status\(404\)\.render/);
  const errAt = src.search(/app\.use\(\s*\(\s*err\s*,/);
  check('the error handler is registered after the 404 fallback',
    errHandler && errAt > notFoundAt,
    'An error handler only catches what is registered before it.');

  check('the error page exists', fs.existsSync(path.join(ROOT, 'src/views/500.ejs')),
    'src/views/500.ejs is what the error handler renders.');
}

// ── 2. No route writes a bare "Internal Server Error" ───────────────────────
// It used to: a DB blip on a merchant subdomain produced a white page with no
// branding, no link back, and no reference the owner could match to a log line.
{
  const offenders = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.git/.test(p)) walk(p); }
      else if (e.name.endsWith('.js')) {
        const s = fs.readFileSync(p, 'utf8');
        if (/res\.status\(500\)\.send\(\s*['"`]Internal Server Error/.test(s)) {
          offenders.push(path.relative(ROOT, p));
        }
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  check('no handler sends a bare "Internal Server Error"', offenders.length === 0,
    'Call next(err) instead so the shared error page with a reference id is\n   '
    + 'served. Offenders: ' + offenders.join(', '));
}

// ── 3. The patch actually reaches the real routers ──────────────────────────
{
  const express = require('express');
  require(path.join(ROOT, 'src/lib/async_routes'))(express);

  const MODULES = ['index', 'tenant', 'company', 'pharmacy_admin', 'food_admin',
    'clinic_admin', 'admin', 'shop', 'customer', 'apply', 'legal', 'blog',
    'gym_admin', 'furniture_admin', 'nutrition_admin', 'nutrition_portal', 'accounting'];

  let total = 0, wrapped = 0;
  const bare = [];
  const scan = (router, label) => {
    for (const layer of (router.stack || [])) {
      if (layer.route) {
        for (const s of layer.route.stack) {
          total += 1;
          if (s.handle.__asyncWrapped) wrapped += 1;
          else bare.push(label + ' ' + layer.route.path);
        }
      } else if (layer.handle && layer.handle.stack) {
        // A mounted sub-router. It is passed through unwrapped on purpose —
        // wrapping a Router would break it — so recurse into its handlers.
        scan(layer.handle, label);
      } else if (typeof layer.handle === 'function') {
        total += 1;
        if (layer.handle.__asyncWrapped) wrapped += 1;
        else bare.push(label + ' [middleware ' + (layer.handle.name || 'anon') + ']');
      }
    }
  };

  for (const m of MODULES) {
    let r;
    try { r = require(path.join(ROOT, 'src/routes', m)); }
    catch (e) { console.log('⏭️  ' + m + ' — ' + e.message.slice(0, 60)); continue; }
    scan(r, m);
  }

  check(`every handler in the real routers is wrapped (${wrapped}/${total})`,
    bare.length === 0,
    'Unwrapped handlers can still hang:\n   ' + bare.slice(0, 12).join('\n   '));
  check('the scan found a realistic number of handlers', total > 500,
    'Only ' + total + ' found — the modules probably failed to load, so this\n   '
    + 'check proved nothing.');
}

console.log(failed ? `\n⚠️  ${failed} مشكلة.` : '\nمعالجة أخطاء الـasync مركّبة ومغطّية كل الراوتات.');
process.exit(failed ? 1 : 0);
