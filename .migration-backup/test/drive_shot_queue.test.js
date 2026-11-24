'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const queueApi = require('../drive-web/shotqueue');

function memoryStore() {
  const items = new Map();
  return {
    async open() {},
    async get(uuid) { return items.get(uuid) || null; },
    async list() { return [...items.values()]; },
    async put(item) { items.set(item.uuid, item); },
    async remove(uuid) { items.delete(uuid); },
  };
}

test('canUpload follows the selected network policy and rejects unknown wifi type', () => {
  assert.equal(queueApi.canUpload(null, 'any'), true);
  assert.equal(queueApi.canUpload({ type: 'wifi' }, 'wifi'), true);
  assert.equal(queueApi.canUpload({ type: 'cellular' }, 'wifi'), false);
  assert.equal(queueApi.canUpload(null, 'wifi'), false);
  assert.equal(queueApi.canUpload({}, 'wifi'), false);
  assert.equal(queueApi.canUpload({ type: 'ethernet' }, 'wifi'), true);
});

test('queue caps at 200 items and drops the oldest', async () => {
  const queue = queueApi.createQueue(memoryStore());
  let result;
  for (let i = 0; i < 201; i++) {
    result = await queue.add({ uuid: String(i), jpg: 'x', meta: {}, addedAt: i });
  }
  assert.equal(result.dropped, 1);
  assert.equal(await queue.count(), 200);
  assert.equal((await queue.list(1))[0].uuid, '1');
});

test('duplicate uuid is ignored without replacing the queued item', async () => {
  const queue = queueApi.createQueue(memoryStore());
  await queue.add({ uuid: 'same', jpg: 'first', meta: {}, addedAt: 1 });
  const result = await queue.add({ uuid: 'same', jpg: 'second', meta: {}, addedAt: 2 });
  assert.equal(result.dropped, 0);
  assert.equal(await queue.count(), 1);
  assert.equal((await queue.list())[0].jpg, 'first');
});

test('purgeOlderThan removes entries beyond the retention age', async () => {
  const queue = queueApi.createQueue(memoryStore());
  const now = Date.now();
  await queue.add({ uuid: 'old', jpg: 'x', meta: {}, addedAt: now - 10000 });
  await queue.add({ uuid: 'new', jpg: 'x', meta: {}, addedAt: now });
  assert.equal(await queue.purgeOlderThan(5000), 1);
  assert.deepEqual((await queue.list()).map((item) => item.uuid), ['new']);
});

test('automatic capture queues the image and then attempts a flush', () => {
  const app = fs.readFileSync(path.join(__dirname, '../drive-web/app.js'), 'utf8');
  const capture = app.slice(app.indexOf('function captureOnFix('), app.indexOf('async function updateShotQueueInfo('));
  assert.match(capture, /OscarShotQueue\.add\(/);
  assert.match(capture, /flushShotQueue\(\)/);
});

test('queue flush skips an empty queue and reloads server shots only after an upload', () => {
  const app = fs.readFileSync(path.join(__dirname, '../drive-web/app.js'), 'utf8');
  const flush = app.slice(app.indexOf('async function flushShotQueue('), app.indexOf('async function initShotQueue('));
  assert.match(flush, /await OscarShotQueue\.count\(\) === 0/);
  assert.match(flush, /let uploaded = 0/);
  assert.match(flush, /uploaded\+\+/);
  assert.match(flush, /if \(uploaded > 0\) loadShots\(\)/);
});

test('shot queue script loads before the app', () => {
  const html = fs.readFileSync(path.join(__dirname, '../drive-web/index.html'), 'utf8');
  assert.ok(html.indexOf('/shotqueue.js') < html.indexOf('/app.js'));
});
