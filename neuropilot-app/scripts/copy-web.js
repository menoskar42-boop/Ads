#!/usr/bin/env node
/**
 * Copy the web app into www/ before every build.
 *
 * The app is BUNDLED, not pointed at the live site. Two reasons:
 *
 *  - A focus timer that needs a signal is not a focus timer. Someone sitting
 *    down to start a three-minute task on the metro must not get a blank screen.
 *  - An app whose UI comes from a server can be changed under the user without
 *    a store review, which is exactly what both stores' policies exist to stop.
 *
 * The cost is that a web change needs a new build to reach the phone. That is
 * the correct trade for a tool whose whole promise is "start in three minutes".
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'neuropilot');
const DEST = path.join(__dirname, '..', 'www');

// Files that belong to the website and mean nothing inside an app bundle.
// Shipping a sitemap or robots.txt in an APK is dead weight the stores scan.
const SKIP = new Set(['sitemap.xml', 'robots.txt']);

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(SRC)) {
  console.error(`✋ web source not found at ${SRC}`);
  process.exit(1);
}
fs.rmSync(DEST, { recursive: true, force: true });
copyDir(SRC, DEST);

// A bundle without the bridge would silently fall back to the foreground
// watcher — the app would install, run, and quietly not do the one thing it
// was built for. Fail the build instead.
const bridge = path.join(DEST, 'native.js');
if (!fs.existsSync(bridge)) {
  console.error('✋ native.js is missing from the bundle — the geofence bridge would not load.');
  process.exit(1);
}
const html = fs.readFileSync(path.join(DEST, 'index.html'), 'utf8');
if (!html.includes('native.js')) {
  console.error('✋ index.html does not load native.js — the geofence bridge would not load.');
  process.exit(1);
}

const n = (function count(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .reduce((a, e) => a + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
})(DEST);
console.log(`✅ bundled ${n} files into www/`);
