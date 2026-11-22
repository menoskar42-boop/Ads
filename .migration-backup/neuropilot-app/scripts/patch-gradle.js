#!/usr/bin/env node
/**
 * Patch the Gradle files Capacitor generated — never replace them.
 *
 * The first CI run failed here: the overlay shipped its own app/build.gradle,
 * which silently dropped `androidx.core:core-splashscreen`. Capacitor's own
 * generated styles.xml inherits from Theme.SplashScreen, so resource linking
 * failed with an error that names a style and says nothing about a missing
 * dependency.
 *
 * That is the general problem with replacing a generated file: it is correct on
 * the day it is written and wrong the next time the generator changes. So this
 * adds what we need and leaves everything else exactly as Capacitor wrote it.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ANDROID = path.join(__dirname, '..', 'android');
const appGradle = path.join(ANDROID, 'app', 'build.gradle');
const vars = path.join(ANDROID, 'variables.gradle');

if (!fs.existsSync(appGradle)) {
  console.error('✋ android/app/build.gradle not found — run "npx cap add android" first.');
  process.exit(1);
}

let g = fs.readFileSync(appGradle, 'utf8');
let changed = [];

// 1. The geofencing API. Everything this app adds over the website comes from
//    this one dependency.
if (!g.includes('play-services-location')) {
  g = g.replace(
    /dependencies\s*\{/,
    `dependencies {\n    // Background geofencing — the one capability the web app cannot provide.\n    implementation "com.google.android.gms:play-services-location:$playServicesLocationVersion"`
  );
  changed.push('play-services-location');
}

// 2. Release signing, read from a file that is not in git.
if (!g.includes('keystore.properties')) {
  const signing = `
// Signing is read from a file that is NOT in git: a keystore password in a
// tracked build file is a keystore password in every clone of the repo.
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
`;
  g = signing + g;

  g = g.replace(/android\s*\{/, `android {
    signingConfigs {
        if (keystorePropertiesFile.exists()) {
            release {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }`);

  // minify + the ProGuard rules, without which the release build installs,
  // runs, and silently has no geofence.
  //
  // The whole release block is REPLACED, not prepended to. Inserting new lines
  // above the generated ones left `minifyEnabled false` after `true`, and in
  // Groovy the last assignment wins — so minification would have been silently
  // off in exactly the build that needs the ProGuard rules.
  g = g.replace(
    /buildTypes\s*\{\s*release\s*\{[\s\S]*?\n(\s*)\}/,
    `buildTypes {
        release {
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            if (keystorePropertiesFile.exists()) { signingConfig signingConfigs.release }
$1}`);
  changed.push('signing + proguard');
}

fs.writeFileSync(appGradle, g);

// 3. Versions. variables.gradle is Capacitor's designated customisation point,
//    so values are edited in place rather than the file being rewritten —
//    a rewrite would drop any variable a future Capacitor adds.
if (fs.existsSync(vars)) {
  let v = fs.readFileSync(vars, 'utf8');
  // minSdk 26 (Oreo) for notification channels: the arrival alert depends on a
  // high-importance channel, and a reminder that might not make a sound is not
  // worth shipping.
  v = v.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 26');
  if (!v.includes('playServicesLocationVersion')) {
    v = v.replace(/ext\s*\{/, "ext {\n    playServicesLocationVersion = '21.3.0'");
  }
  fs.writeFileSync(vars, v);
  changed.push('variables.gradle');
}

console.log(changed.length ? `✅ gradle patched: ${changed.join(', ')}` : '•  gradle already patched');

// Two minifyEnabled lines in one block means the later one wins and the patch
// achieved nothing. Cheap to check, and invisible in a build that succeeds.
const finalGradle = fs.readFileSync(appGradle, 'utf8');
const minifyCount = (finalGradle.match(/minifyEnabled/g) || []).length;
if (minifyCount > 1) {
  console.error(`✋ ${minifyCount} minifyEnabled lines in app/build.gradle — the last one wins, `
    + 'so the ProGuard rules may not apply and the release build would lose the geofence.');
  process.exit(1);
}

// The splash-screen dependency the first CI run died on. Capacitor puts it
// there; if it is ever missing, fail here with the real reason rather than
// letting AAPT report a missing style.
if (!/core-splashscreen/.test(fs.readFileSync(appGradle, 'utf8'))) {
  console.error('✋ core-splashscreen is missing from app/build.gradle.\n'
    + '   The generated styles.xml inherits Theme.SplashScreen, and resource linking\n'
    + '   will fail with "style/Theme.SplashScreen not found" — which names the style,\n'
    + '   not the missing dependency.');
  process.exit(1);
}
