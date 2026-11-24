'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '../drive-web/app.js'), 'utf8');

test('wake lock release requests another lock while the page is visible', () => {
  assert.match(app, /wakeLock\.addEventListener\(['"]release['"],\s*\(\)\s*=>\s*\{[\s\S]{0,100}setTimeout\(keepAwake,\s*500\)/);
});

test('keep-awake watchdog checks every 20 seconds', () => {
  assert.match(app, /setInterval\(\(\)\s*=>\s*\{\s*if\s*\(!document\.hidden\)\s*keepAwake\(\);\s*\},\s*20000\)/);
});

test('the video layer starts on the first touch even when Wake Lock exists', () => {
  assert.match(app, /const onTouch = \(\) => \{\s*startVideo\(\);\s*keepAwake\(\);\s*\}/);
  assert.match(app, /document\.addEventListener\('touchstart',\s*onTouch/);
});

test('pageshow rechecks the screen wake state', () => {
  assert.match(app, /document\.addEventListener\('pageshow',\s*keepAwake\)/);
});
