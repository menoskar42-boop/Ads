'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_QUERY = [
  '[out:json][timeout:300];',
  'area["ISO3166-1"="EG"]["admin_level"="2"]->.eg;',
  '(',
  '  node(area.eg)[traffic_calming];',
  '  node(area.eg)[highway=traffic_signals];',
  '  node(area.eg)[highway=speed_camera];',
  ');',
  'out body;',
].join('\n');
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 300_000;
const DEFAULT_FILE = path.join(__dirname, '..', '..', 'data', 'osm', 'egypt.json');
const ATTRIBUTION = '© OpenStreetMap contributors';

function versionFor(now) {
  return Number(new Date(now).toISOString().slice(0, 10).replace(/-/g, ''));
}

function roundCoordinate(value) {
  return Math.round(value * 100_000) / 100_000;
}

function parseOverpassResponse(payload, now = Date.now()) {
  if (!payload || !Array.isArray(payload.elements)) throw new Error('Invalid Overpass response');
  const items = [];
  for (const element of payload.elements) {
    if (!Number.isFinite(element.lat) || !Number.isFinite(element.lon)
      || element.lat < -90 || element.lat > 90 || element.lon < -180 || element.lon > 180) continue;
    const tags = element.tags || {};
    let type = null;
    if (tags.highway === 'traffic_signals') type = 'signal';
    else if (tags.highway === 'speed_camera') type = 'camera';
    else if (typeof tags.traffic_calming === 'string' && tags.traffic_calming.trim()
      && tags.traffic_calming.trim().toLowerCase() !== 'no') type = 'bump';
    if (type) items.push([roundCoordinate(element.lat), roundCoordinate(element.lon), type]);
  }
  return {
    v: versionFor(now),
    generatedAt: new Date(now).toISOString(),
    source: 'OpenStreetMap',
    license: 'ODbL-1.0',
    attribution: ATTRIBUTION,
    items,
  };
}

function retryable(error) {
  return error && (error.status === 429 || error.status === 502
    || error.name === 'AbortError' || error.name === 'TimeoutError');
}

function createOsmEgypt({
  filePath = DEFAULT_FILE,
  fetcher = globalThis.fetch,
  now = Date.now,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let snapshot = null;
  let started = false;
  let refreshing = null;
  let weeklyTimer = null;
  let retryTimer = null;
  let retryCount = 0;

  async function loadCache() {
    if (snapshot) return snapshot;
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
      if (parsed && Number.isFinite(parsed.v) && typeof parsed.generatedAt === 'string'
        && Array.isArray(parsed.items)) snapshot = parsed;
    } catch (_) { /* no usable cached copy yet */ }
    return snapshot;
  }

  function isStale() {
    const generatedAt = snapshot && Date.parse(snapshot.generatedAt);
    return !Number.isFinite(generatedAt) || now() - generatedAt >= REFRESH_MS;
  }

  async function persist(next) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(next), 'utf8');
    await fs.rename(tempPath, filePath);
  }

  function scheduleRetry(error) {
    if (!retryable(error) || retryCount >= MAX_RETRIES || retryTimer) return;
    retryCount += 1;
    retryTimer = setTimeoutFn(() => {
      retryTimer = null;
      refresh().catch(() => {});
    }, RETRY_MS);
    if (retryTimer && typeof retryTimer.unref === 'function') retryTimer.unref();
  }

  async function requestSnapshot() {
    if (typeof fetcher !== 'function') throw new Error('Fetch is unavailable');
    const controller = new AbortController();
    const timeout = setTimeoutFn(() => controller.abort(), REQUEST_TIMEOUT_MS);
    if (timeout && typeof timeout.unref === 'function') timeout.unref();
    try {
      const response = await fetcher(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': 'OscarDrive-osm-layer',
        },
        body: new URLSearchParams({ data: OVERPASS_QUERY }).toString(),
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`Overpass HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      return parseOverpassResponse(await response.json(), now());
    } finally {
      clearTimeoutFn(timeout);
    }
  }

  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const next = await requestSnapshot();
        await persist(next);
        snapshot = next;
        retryCount = 0;
        if (retryTimer) clearTimeoutFn(retryTimer);
        retryTimer = null;
        return true;
      } catch (error) {
        scheduleRetry(error);
        console.error('[osm-egypt] refresh failed:', error && error.message ? error.message : 'unknown error');
        return false;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function start() {
    if (started) return snapshot;
    started = true;
    await loadCache();
    weeklyTimer = setIntervalFn(() => {
      if (isStale()) refresh().catch(() => {});
    }, REFRESH_MS);
    if (weeklyTimer && typeof weeklyTimer.unref === 'function') weeklyTimer.unref();
    if (isStale()) await refresh();
    return snapshot;
  }

  function stop() {
    if (weeklyTimer) clearIntervalFn(weeklyTimer);
    if (retryTimer) clearTimeoutFn(retryTimer);
    weeklyTimer = null;
    retryTimer = null;
    started = false;
  }

  return { start, stop, refresh, getSnapshot: () => snapshot };
}

const defaultOsmEgypt = createOsmEgypt();

module.exports = {
  ATTRIBUTION,
  OVERPASS_QUERY,
  OVERPASS_URL,
  REFRESH_MS,
  RETRY_MS,
  createOsmEgypt,
  defaultOsmEgypt,
  parseOverpassResponse,
};
