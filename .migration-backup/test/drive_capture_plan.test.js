'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../drive-web/road.js');

test('capture marks include the onset, 50 m buckets, and near marks with gaps', () => {
  assert.deepEqual(R.captureMarks(150), [150, 100, 75, 50, 25]);
  assert.deepEqual(R.captureMarks(212), [212, 150, 100, 75, 50, 25]);
  assert.deepEqual(R.captureMarks(410), [410, 350, 300, 250, 200, 150, 100, 75, 50, 25]);
  assert.deepEqual(R.captureMarks(160), [160, 100, 75, 50, 25]);
});

test('capture plan fires at the onset distance', () => {
  const plan = R.capturePlan(150, 1000);
  assert.equal(plan.onDistance(149, 1000, 5), 150);
});

test('GPS jitter fires the 100 m mark only once', () => {
  const plan = R.capturePlan(150, 0);
  assert.equal(plan.onDistance(149, 0, 5), 150);
  const fired = [101, 99, 101, 99].map((d, i) => plan.onDistance(d, i + 1, 5)).filter((mark) => mark === 100);
  assert.deepEqual(fired, [100]);
});

test('a large distance jump gives one shot at 50 m, then continues to 25 m', () => {
  const plan = R.capturePlan(160, 0);
  assert.equal(plan.onDistance(160, 0, 5), 160);
  assert.equal(plan.onDistance(40, 1000, 5), 50);
  assert.equal(plan.onDistance(24, 2000, 5), 25);
});

test('poor GPS accuracy consumes the mark without a late retry', () => {
  const plan = R.capturePlan(100, 0);
  assert.equal(plan.onDistance(100, 0, 5), 100);
  assert.equal(plan.onDistance(75, 1000, 40), null);
  assert.equal(plan.onDistance(75, 2000, 5), null);
});

test('moving more than 20 m away from the closest distance ends the plan', () => {
  const plan = R.capturePlan(100, 0);
  assert.equal(plan.onDistance(100, 0, 5), 100);
  assert.equal(plan.onDistance(125, 1000, 5), null);
  assert.equal(plan.done, true);
});

test('capture plan times out after 180 seconds', () => {
  const plan = R.capturePlan(100, 1000);
  assert.equal(plan.onDistance(100, 1000, 5), 100);
  assert.equal(plan.onDistance(99, 181001, 5), null);
  assert.equal(plan.done, true);
});
