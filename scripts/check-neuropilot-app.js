#!/usr/bin/env node
/**
 * Static checks on the NeuroPilot native shell.
 *
 * The APK cannot be built in this environment (dl.google.com is blocked by the
 * network policy, so the Android SDK cannot be installed). These checks catch
 * the class of mistake that would otherwise only surface on a physical phone —
 * and several of them are the kind that produce an app which installs, runs,
 * and silently does not do the one thing it was built for.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// The native sources live in overlay/ — they are applied ON TOP of the
// scaffold `cap add` generates, and the generated folders do not exist in git.
const A = (p) => path.join(ROOT, 'neuropilot-app', 'overlay', p);
const W = (p) => path.join(ROOT, 'neuropilot', p);
const read = (p) => fs.readFileSync(p, 'utf8');

let failed = 0;
function check(label, ok, why) {
  console.log((ok ? '✅ ' : '❌ ') + label + (ok ? '' : '\n   ' + why));
  if (!ok) failed += 1;
}

const manifest = read(A('android/app/src/main/AndroidManifest.xml'));
const plugin = read(A('android/app/src/main/java/com/oscardevs/neuropilot/GeofencePlugin.java'));
const store = read(A('android/app/src/main/java/com/oscardevs/neuropilot/Store.java'));
const proguard = read(A('android/app/proguard-rules.pro'));
const plist = read(A('ios/App/App/Info.plist'));
const swift = read(A('ios/App/App/GeofencePlugin.swift'));
const objc = read(A('ios/App/App/GeofencePlugin.m'));
const appjs = read(W('app.js'));
const html = read(W('index.html'));

// ── The capability the whole app exists for ──────────────────────────────────
check('Android asks for background location',
  manifest.includes('ACCESS_BACKGROUND_LOCATION'),
  'Without it a fence only fires while the app is open — identical to the website.');

check('Android re-registers fences after reboot',
  manifest.includes('BOOT_COMPLETED') && /class BootReceiver/.test(
    read(A('android/app/src/main/java/com/oscardevs/neuropilot/BootReceiver.java'))),
  'Android drops every geofence on reboot and tells nobody. The feature would appear '
  + 'to work, then stop the first time the phone restarts.');

check('Fence store persists places for re-registration',
  /saveFences/.test(plugin) && /reregister/.test(store),
  'There is no OS API to ask what is being watched; if it is not written down it is lost.');

check('PendingIntent is MUTABLE on Android 12+',
  /FLAG_MUTABLE/.test(plugin),
  'IMMUTABLE delivers an arrival event with no idea which place fired it.');

check('Initial trigger fires when already inside',
  /INITIAL_TRIGGER_ENTER/.test(plugin),
  'Otherwise adding "remind me at the office" while in the office does nothing '
  + 'until you leave and come back.');

check('Old fences cleared before re-registering',
  /removeGeofences/.test(plugin),
  'A place the user deleted would keep buzzing them for weeks.');

// ── The failures that only show up in a release build ────────────────────────
check('ProGuard keeps the Capacitor plugin classes',
  /CapacitorPlugin class/.test(proguard) && /com\.oscardevs\.neuropilot/.test(proguard),
  'Capacitor bridges by reflection. R8 would strip the plugin and the release APK '
  + 'would install, run, and silently have no geofence — while debug worked.');

check('Geofence receiver is not exported',
  /GeofenceReceiver[\s\S]{0,200}?android:exported="false"/.test(manifest),
  'An exported receiver lets any app on the device fake an arrival.');

// ── iOS ──────────────────────────────────────────────────────────────────────
check('iOS declares the Always-location purpose string',
  plist.includes('NSLocationAlwaysAndWhenInUseUsageDescription'),
  'iOS will not even show the prompt without it, and review rejects a vague one.');

check('iOS does not claim an unused background mode',
  !/<string>location<\/string>/.test(plist),
  'Region monitoring wakes the app on its own. Declaring the location background '
  + 'mode is a review rejection and drains the battery.');

check('iOS plugin is registered with the Objective-C macro',
  /CAP_PLUGIN\(GeofencePlugin, "Geofence"/.test(objc),
  'Without it the Swift plugin compiles, ships, and is simply absent at runtime.');

check('iOS reports regions it could not watch',
  /"dropped"/.test(swift),
  'iOS caps monitoring at 20 regions system-wide; silently watching the first 20 '
  + 'leaves the user believing in reminders that will never fire.');

// ── One source of truth ──────────────────────────────────────────────────────
check('The web app loads the native bridge',
  html.includes('native.js'),
  'Without it the app falls back to the foreground watcher — it would install, '
  + 'run, and quietly not do the thing it was built for.');

check('Native and foreground watchers never run together',
  /N\.watch\(list\);\s*\n\s*return;/.test(appjs) && /stopGeofence\(\);\s*\n\s*N\.watch/.test(appjs),
  'Running both would fire every arrival alert twice.');

check('No duplicated app logic in the native project',
  !fs.existsSync(A('android/app/src/main/assets/app.js'))
  && !/DEFAULT_MINUTES|FIB\s*=/.test(plugin),
  'The timer, ladder, thought dump and stats must live in exactly one place.');

// The overlay is applied after the scaffold is generated. If it shipped the
// root build.gradle or settings.gradle it would clobber the wiring `cap add`
// writes for the Capacitor modules, and the build would fail on a missing
// project reference.
// The first CI run died here. The overlay shipped its own app/build.gradle,
// which dropped androidx.core:core-splashscreen — and AAPT then failed with
// "style/Theme.SplashScreen not found", an error that names the style and says
// nothing about the missing dependency.
check('Overlay does not replace any generated Gradle file',
  !fs.existsSync(A('android/settings.gradle'))
  && !fs.existsSync(A('android/build.gradle'))
  && !fs.existsSync(A('android/app/build.gradle'))
  && !fs.existsSync(A('android/variables.gradle')),
  'Gradle files are PATCHED by scripts/patch-gradle.js, never replaced: a replacement '
  + 'is correct the day it is written and wrong the next time Capacitor changes.');

const patcher = read(A('../scripts/patch-gradle.js'));
check('The Gradle patcher guards the splash-screen dependency',
  /core-splashscreen/.test(patcher),
  'It must fail with the real reason rather than letting AAPT report a missing style.');

check('The Gradle patcher rejects a duplicated minifyEnabled',
  /minifyEnabled/.test(patcher) && /last one wins/.test(patcher),
  'Two minifyEnabled lines means the later wins, the ProGuard rules never apply, '
  + 'and the release build silently loses the geofence.');

// ── Every R.* the overlay's Java references must actually exist ──────────────
//
// The second CI run died on `R.drawable.ic_stat_neuropilot` — an icon that was
// referenced and never created. javac catches it, but only after ~45 seconds of
// Gradle, on a runner, in a log nobody is watching. It is a filesystem check.
{
  const javaDir = A('android/app/src/main/java/com/oscardevs/neuropilot');
  const resDir = A('android/app/src/main/res');

  // Types the scaffold provides (launcher icons, the app theme). Ours are the
  // ones that have to be in the overlay.
  const FROM_SCAFFOLD = new Set(['mipmap', 'style', 'layout', 'id', 'color']);

  const has = (type, name) => {
    // values/*.xml declare strings by name rather than by filename.
    if (type === 'string') {
      const values = path.join(resDir, 'values');
      if (!fs.existsSync(values)) return false;
      return fs.readdirSync(values).some((f) =>
        new RegExp(`name="${name}"`).test(fs.readFileSync(path.join(values, f), 'utf8')));
    }
    const dir = path.join(resDir, type);
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).some((f) => f.replace(/\.[^.]+$/, '') === name);
  };

  const missing = [];
  for (const file of fs.readdirSync(javaDir)) {
    if (!file.endsWith('.java')) continue;
    const src = fs.readFileSync(path.join(javaDir, file), 'utf8');
    for (const m of src.matchAll(/\bR\.([a-z]+)\.([A-Za-z0-9_]+)/g)) {
      const [, type, name] = m;
      if (FROM_SCAFFOLD.has(type)) continue;
      if (!has(type, name)) missing.push(`${file}: R.${type}.${name}`);
    }
  }
  check('Every resource the Java references exists in the overlay',
    missing.length === 0,
    'javac would catch these, but only after a full Gradle run on CI:\n   '
    + missing.join('\n   '));
}

console.log(failed ? `\n⚠️  ${failed} مشكلة — راجعها قبل البناء.` : '\nمشروع التطبيق سليم.');
process.exit(failed ? 1 : 0);
