// Kotlin car-screen logic has no sign/signal targets yet: these capture-only types stay web-only and are excluded from car sync.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../drive-web/road.js');
const LAT0 = 30, LNG0 = 31, north = (m) => LAT0 + m / 111195, east = (m) => LNG0 + m / 96486;
const appSource = fs.readFileSync(path.join(__dirname, '../drive-web/app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, '../drive-web/index.html'), 'utf8');
const routeSource = fs.readFileSync(path.join(__dirname, '../src/routes/drive_site.js'), 'utf8');

test('driver warnings never include sign or signal targets', () => {
  const targets = [
    { uuid: 's1', type: 'sign', lat: north(10), lng: LNG0, bearing: 0 },
    { uuid: 's2', type: 'signal', lat: north(10), lng: LNG0, bearing: 0 },
  ];
  assert.equal(R.ahead(targets, LAT0, LNG0, 0, 50, 0, {}, { minWarnM: 1 }), null);
  assert.equal(R.ahead(targets, LAT0, LNG0, null, 0, 0, {}, { test: true }), null);
});

test('captureAhead applies range, heading, same-direction and ahead-bearing gates', () => {
  const sign = { uuid: 's1', type: 'sign', lat: north(100), lng: LNG0, bearing: 0 };
  assert.equal(R.captureAhead([sign], LAT0, LNG0, null), null);
  assert.equal(R.captureAhead([{ ...sign, bearing: null }], LAT0, LNG0, 0), null);
  assert.equal(R.captureAhead([{ ...sign, lat: north(161) }], LAT0, LNG0, 0), null);
  assert.equal(R.captureAhead([{ ...sign, bearing: 70 }], LAT0, LNG0, 0), null);
  assert.equal(R.captureAhead([{ ...sign, lat: north(100), lng: east(100) }], LAT0, LNG0, 0), null);
  const signal = { ...sign, uuid: 's2', type: 'signal' };
  const found = R.captureAhead([sign, { ...signal, lat: north(70) }], LAT0, LNG0, 0);
  assert.equal(found.h.uuid, 's2');
  assert.ok(found.d <= 160);
});

test('capturePlan accepts the predefined sign marks', () => {
  assert.deepEqual(R.SIGN_MARKS, [150, 100, 60, 30]);
  assert.deepEqual(R.SIGNAL_MARKS, [150, 100, 50, 25]);
  assert.deepEqual(R.SIGNAL_PAIR_MARKS, [50, 25]);
  const plan = R.capturePlan(160, 0, R.SIGN_MARKS);
  assert.deepEqual(R.SIGN_MARKS.map((d, i) => plan.onDistance(d, i + 1, 5)), [150, 100, 60, 30]);
  assert.equal(plan.done, true);
});

test('sign catalogue is valid, provisional, and has unique class IDs', () => {
  const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, '../drive-web/sign-catalogue.json'), 'utf8'));
  assert.equal(catalogue.status, 'provisional');
  assert.ok(Array.isArray(catalogue.classes));
  const ids = catalogue.classes.map((item) => item.id);
  assert.ok(ids.length >= 1 && ids.every((id) => typeof id === 'string' && id.length > 0));
  assert.equal(new Set(ids).size, ids.length);
});

test('phone registration, filtered car sync, and paired signal capture are wired', () => {
  assert.match(routeSource, /hz\.list\(pool, req\.car\.id, false, true\)/);
  assert.match(htmlSource, /id="markSignal"/);
  assert.match(htmlSource, /id="markSign"/);
  assert.match(htmlSource, /id="signCat"/);
  assert.match(htmlSource, /id="signalHeads"/);
  assert.match(appSource, /async function markTarget\(type\)/);
  assert.match(appSource, /!lastFix \|\| !\(\(lastFix\.kmh \|\| 0\) < 5\)/);
  assert.match(appSource, /if \(roadHeading == null\)/);
  assert.match(appSource, /fetch\('\/sign-catalogue\.json'/);
  assert.match(appSource, /RD\.captureAhead\(\(pool \|\| \[\]\)\.filter\(\(h\) => h\.type === 'sign' \|\| h\.type === 'signal'\)/);
  assert.match(appSource, /pairOf: shotUuid, pairIndex: 1/);
  assert.match(appSource, /setTimeout\(\(\) => \{/);
  assert.match(appSource, /const secondJpg = grabFrame\(\)/);
  assert.match(appSource, /\}, 1000\)/);
});
