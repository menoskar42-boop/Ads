'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '../drive-web/app.js'), 'utf8');

test('failed manifest fetches remain retryable', () => {
  const load = app.match(/async function loadOscarLines\(\) \{([\s\S]*?)\n  \}/);
  assert.ok(load);
  assert.match(load[1], /if \(!r\.ok\) throw new Error/);
  const caught = load[1].slice(load[1].indexOf('catch (e) {'));
  assert.ok(caught.startsWith('catch (e) {'));
  assert.doesNotMatch(caught, /oscarLinesFor\s*=/);
});

test('an older clip ignores AbortError after a newer phrase starts', () => {
  assert.match(app, /e\.name === 'AbortError' && my !== playSeq[\s\S]{0,150}replaced by newer phrase/);
});

test('sayRoad does not pause or invalidate a clip-failure fallback', () => {
  const say = app.match(/function sayRoad\(text, fromClipFail\) \{([\s\S]*?)\n  \}/);
  assert.ok(say);
  assert.match(say[1], /if \(!fromClipFail\) \{ \+\+playSeq; try \{ oscarAudio\.pause\(\);/);
});

test('voice diagnostics keep a short history and expose only playback details', () => {
  assert.match(app, /function voiceLog\(key, url, engine, reason\)/);
  assert.ok(app.includes("url: url ? url.split('/').pop().slice(0, 12) : ''"));
  assert.match(app, /if \(voiceHist\.length > 10\) voiceHist\.shift\(\)/);
  assert.match(app, /add\('آخر الأصوات', voiceHist\.slice\(\)\.reverse\(\)/);
});

test('audio can be unlocked again without priming over a playing phrase', () => {
  const unlock = app.match(/const unlockAudio = \(\) => \{([\s\S]*?)\n  \};/);
  assert.ok(unlock);
  assert.match(unlock[1], /if \(oscarAudio\.paused\)/);
  assert.doesNotMatch(unlock[1], /audioUnlocked/);
  assert.match(app, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(!document\.hidden\) loadOscarLines\(\); \}\)/);
});
