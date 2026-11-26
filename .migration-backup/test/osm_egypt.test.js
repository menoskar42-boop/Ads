'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createOsmEgypt,
  parseOverpassResponse,
  RETRY_MS,
} = require('../src/lib/osm_egypt');

describe('OSM Egypt layer', () => {
  it('converts only supported nodes and rounds coordinates', () => {
    const generatedAt = Date.parse('2026-11-26T12:00:00.000Z');
    const result = parseOverpassResponse({
      elements: [
        { type: 'node', lat: 0.1234567, lon: -0.7654321, tags: { traffic_calming: 'hump' } },
        { type: 'node', lat: 10.1234567, lon: 20.7654321, tags: { highway: 'traffic_signals' } },
        { type: 'node', lat: -10.1234567, lon: 40.7654321, tags: { highway: 'speed_camera' } },
        { type: 'node', lon: 1, tags: { traffic_calming: 'bump' } },
        { type: 'node', lat: 0, lon: 0, tags: { highway: 'residential' } },
      ],
    }, generatedAt);

    assert.deepEqual(result.items, [
      [0.12346, -0.76543, 'bump'],
      [10.12346, 20.76543, 'signal'],
      [-10.12346, 40.76543, 'camera'],
    ]);
    assert.equal(result.v, 20261126);
    assert.equal(result.source, 'OpenStreetMap');
    assert.equal(result.license, 'ODbL-1.0');
    assert.equal(result.attribution, '© OpenStreetMap contributors');
  });

  it('keeps the cached copy after an Overpass failure and schedules a retry', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osm-egypt-'));
    const filePath = path.join(dir, 'egypt.json');
    const old = {
      v: 20200101,
      generatedAt: '2020-01-01T00:00:00.000Z',
      source: 'OpenStreetMap',
      license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors',
      items: [],
    };
    await fs.writeFile(filePath, JSON.stringify(old));
    const timers = [];
    const service = createOsmEgypt({
      filePath,
      now: () => Date.parse('2026-11-26T12:00:00.000Z'),
      fetcher: async (url, options) => {
        assert.equal(url, 'https://overpass-api.de/api/interpreter');
        assert.equal(options.headers['User-Agent'], 'OscarDrive-osm-layer');
        return { ok: false, status: 502 };
      },
      setIntervalFn: () => ({ unref() {} }),
      clearIntervalFn: () => {},
      setTimeoutFn: (_callback, delay) => {
        const timer = { delay, unref() {} };
        timers.push(timer);
        return timer;
      },
      clearTimeoutFn: () => {},
    });
    try {
      await service.start();
      assert.deepEqual(service.getSnapshot(), old);
      assert.ok(timers.some((timer) => timer.delay === RETRY_MS));
    } finally {
      service.stop();
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
