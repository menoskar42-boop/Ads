// drive-web/road.js (الموبايل لوحده) لازم يطابق حساب الشاشة (RoadMemory.kt) — نفس حالات اختبارات الشاشة بنفس الأرقام.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../drive-web/road.js');
const LAT0 = 30.0, LNG0 = 31.0, north = (m) => LAT0 + m / 111195.0;
const bump = { uuid: 'b1', type: 'bump', lat: north(120), lng: LNG0, bearing: 0 };

test('ahead only, heading, repeat after 5 minutes (same as the screen)', () => {
  const r = R.ahead([bump], LAT0, LNG0, 0, 50, 0, {});
  assert.ok(r && Math.abs(r.d - 120) < 2);
  assert.equal(R.warning(r.h, r.d), 'خلّى بالك، مطب بعد 100 متر');
  assert.equal(R.ahead([bump], LAT0, LNG0, 180, 50, 0, {}), null);
  assert.equal(R.ahead([bump], LAT0, LNG0, 0, 50, 60000, { b1: 0 }), null);
  assert.ok(R.ahead([bump], LAT0, LNG0, 0, 50, 360000, { b1: 0 }));
});
test('distance setting, speed growth, quiet mode, radar 3 km', () => {
  assert.equal(R.ahead([bump], LAT0, LNG0, 0, 30, 0, {}, { minWarnM: 100 }), null);
  assert.ok(R.ahead([bump], LAT0, LNG0, 0, 30, 0, {}, { minWarnM: 150 }));
  assert.ok(Math.abs(R.rangeM('bump', 100, 100) - 415) < 5);
  assert.equal(R.rangeM('radar', 60, 50), 3000);
  const near = { ...bump, uuid: 'n', lat: north(60) };
  assert.equal(R.ahead([near], LAT0, LNG0, 0, 5, 0, {}, { minKmh: R.C.QUIET_KMH }), null);
  assert.ok(R.ahead([near], LAT0, LNG0, 0, 5, 0, {}, { minKmh: R.C.STOPPED_KMH, minWarnM: 100 }));
});
test('road axis: a crossing road stays quiet, the opposite direction warns', () => {
  const east = { uuid: 'e', type: 'bump', lat: north(80), lng: LNG0, bearing: 90 };
  assert.equal(R.ahead([east], LAT0, LNG0, 0, 40, 0, {}, { minWarnM: 100 }), null);
  assert.ok(R.ahead([{ ...east, bearing: 185 }], LAT0, LNG0, 0, 40, 0, {}, { minWarnM: 100 }));
  assert.ok(R.ahead([{ ...east, bearing: null }], LAT0, LNG0, 0, 40, 0, {}, { minWarnM: 100 }));
});
test('test mode (inside the flat): 20 m, no direction, again after 30 s', () => {
  const t = { uuid: 't', type: 'bump', lat: north(12), lng: LNG0, bearing: 90 };
  assert.ok(R.ahead([t], LAT0, LNG0, null, 0, 0, {}, { test: true }));
  assert.equal(R.ahead([{ ...t, lat: north(30) }], LAT0, LNG0, null, 0, 0, {}, { test: true }), null);
  assert.equal(R.ahead([t], LAT0, LNG0, null, 0, 10000, { t: 0 }, { test: true }), null);
  assert.ok(R.ahead([t], LAT0, LNG0, null, 0, 40000, { t: 0 }, { test: true }));
});
test('phone voice: needs the name, understands bump / pothole / screenshot', () => {
  assert.equal(R.parseVoice('أوسكار سجّل مطب هنا'), 'bump');
  assert.equal(R.parseVoice('يا اسكار سجل حفرة'), 'pothole');
  assert.equal(R.parseVoice('اوسكار خد اسكرين شوت'), 'shot');
  assert.equal(R.parseVoice('وسكار صور الطريق'), 'shot');
  assert.equal(R.parseVoice('سجل مطب هنا'), null);          // من غير الاسم ⇒ ولا حاجة
  assert.equal(R.parseVoice('أوسكار الجو عامل ايه'), 'unknown');
});
