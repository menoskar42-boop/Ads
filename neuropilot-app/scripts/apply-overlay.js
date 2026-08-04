#!/usr/bin/env node
/**
 * Copy overlay/ over the scaffold Capacitor generated.
 *
 * Runs after `npx cap add android|ios`. Every file here either does not exist
 * in the scaffold (the plugin, the receivers) or must replace it (the manifest,
 * the app-level build.gradle).
 *
 * It verifies the scaffold is actually there first. Copying an overlay onto
 * nothing produces a folder that looks like an Android project, fails at
 * `gradlew` with a missing-file error, and sends whoever is building it hunting
 * in the wrong place.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OVERLAY = path.join(ROOT, 'overlay');

function copyDir(from, to) {
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === 'README.md' && from === OVERLAY) continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) { fs.mkdirSync(b, { recursive: true }); copyDir(a, b); }
    else { fs.mkdirSync(path.dirname(b), { recursive: true }); fs.copyFileSync(a, b); }
  }
}

let applied = 0;
for (const platform of ['android', 'ios']) {
  const src = path.join(OVERLAY, platform);
  const dest = path.join(ROOT, platform);
  if (!fs.existsSync(src)) continue;
  if (!fs.existsSync(dest)) {
    console.log(`•  ${platform}/ not generated yet — run "npx cap add ${platform}" first. Skipping.`);
    continue;
  }
  copyDir(src, dest);
  applied += 1;
  console.log(`✅ overlay applied to ${platform}/`);
}

// The single file whose absence produces a working-looking app with no
// geofence. Worth its own check rather than trusting the copy loop.
const pg = path.join(ROOT, 'android', 'app', 'proguard-rules.pro');
if (fs.existsSync(path.join(ROOT, 'android')) && !fs.existsSync(pg)) {
  console.error('✋ proguard-rules.pro did not land — the release build would silently lose the geofence.');
  process.exit(1);
}

if (!applied) {
  console.error('✋ nothing to overlay: no platform folder exists.');
  process.exit(1);
}
