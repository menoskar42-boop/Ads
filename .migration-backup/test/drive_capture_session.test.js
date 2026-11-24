'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '../drive-web/app.js'), 'utf8');

test('arming refuses to open the camera while moving above 5 km/h', () => {
  const arm = app.match(/async function armCapture\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(arm);
  assert.match(arm[1], /lastFix && lastFix\.kmh > 5/);
  assert.match(arm[1], /⏸️ اقف الأول/);
});

test('capture readiness requires a live camera, visible page, fresh GPS, and active keep-awake', () => {
  const checks = app.match(/function capturePauseReason\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(checks);
  assert.match(checks[1], /track\.readyState === 'live'/);
  assert.match(checks[1], /!v\.videoWidth/);
  assert.match(checks[1], /document\.hidden/);
  assert.match(checks[1], /Date\.now\(\) - lastFix\.t >= 10000/);
  assert.match(checks[1], /wakeLock && !wakeLock\.released/);
  assert.match(checks[1], /awakeVideo && !awakeVideo\.paused/);
});

test('armed approach plans use the pure capture plan and only accepted hazard types', () => {
  assert.match(app, /hit\.h\.type === 'bump' \|\| hit\.h\.type === 'pothole'/);
  assert.match(app, /RD\.capturePlan\(hit\.d, Date\.now\(\)\)/);
  assert.match(app, /entry\.plan\.onDistance\(d, Date\.now\(\), f\.acc\)/);
});

test('automatic voice reply is controlled only by the voice checkbox', () => {
  assert.match(app, /if \(announce && \$\('autoShotsSay'\)\.checked\) oscar\('shot_auto', 'لقط صورة'\)/);
});

test('the ready chip is only shown after all readiness checks pass', () => {
  const update = app.match(/function updateCaptureStatus\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(update);
  assert.match(update[1], /const reason = captureRequested \? capturePauseReason\(\)/);
  assert.match(update[1], /const ready = captureRequested && !reason/);
  assert.match(update[1], /status\.textContent = ready \? '📸 جاهز'/);
});
