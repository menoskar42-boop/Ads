'use strict';

/*
 * IndexNow helper — notifies Bing (and partner engines like Seznam, Naver,
 * Yandex) the moment a page is published or updated, so it gets crawled and
 * indexed faster. See docs/BING_WEBMASTER_HELP.md (IndexNow section).
 *
 * The key is NOT a secret: it is published at https://<host>/<key>.txt for
 * ownership verification (served from src/routes/legal.js).
 */

const https = require('https');

const INDEXNOW_KEY = process.env.INDEXNOW_KEY || '2d5899a99defc142e0f21d1981772ebf';
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://oscardevs.com';
const INDEXNOW_HOST = SITE_ORIGIN.replace(/^https?:\/\//, '');

/**
 * Submit one or more absolute URLs to IndexNow.
 * Resolves to { status, body } and never rejects, so callers don't need
 * try/catch. status 0 = skipped (no key / no urls), -1 = network error.
 * @param {string|string[]} urls
 * @returns {Promise<{status:number, body:string}>}
 */
function submit(urls) {
  return new Promise((resolve) => {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (!INDEXNOW_KEY || !list.length) return resolve({ status: 0, body: 'skipped' });
    const body = JSON.stringify({ host: INDEXNOW_HOST, key: INDEXNOW_KEY, urlList: list });
    const req = https.request({
      method: 'POST', hostname: 'api.indexnow.org', path: '/IndexNow',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
    }, (resp) => {
      let data = '';
      resp.on('data', (c) => { data += c; });
      resp.on('end', () => resolve({ status: resp.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: -1, body: e.message }));
    req.write(body);
    req.end();
  });
}

/**
 * Fire-and-forget submit — pings IndexNow without blocking the request
 * lifecycle. Safe to call right before res.redirect(); failures only warn.
 * @param {string|string[]} urls
 */
function ping(urls) {
  submit(urls)
    .then((r) => { if (r.status && r.status >= 400) console.warn('[IndexNow] ping failed', r.status, r.body); })
    .catch(() => { /* never throws */ });
}

module.exports = { submit, ping, INDEXNOW_KEY, INDEXNOW_HOST, SITE_ORIGIN };
