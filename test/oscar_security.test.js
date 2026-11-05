'use strict';
// Oscar Security (drive.oscardevs.com): المنطق الصافى دايماً، والقاعدة + الـHTTP لو فيه Postgres محلى:
//   DRIVE_TEST_DATABASE_URL='postgresql://postgres@localhost/drivetest?host=/var/lib/postgresql/sftest&port=55433' node --test test/oscar_security.test.js
const assert = require('node:assert/strict');
const { describe, it, before, after } = require('node:test');
const http = require('node:http');
const L = require('../src/drive/logic');

describe('logic', () => {
  const now = Date.UTC(2026, 10, 5, 12);
  it('cleans points and rejects junk', () => {
    assert.deepEqual(L.cleanPoint({ t: now, lat: 27.18, lng: 31.18, s: 40, h: 90, a: 5 }, now).lat, 27.18);
    assert.equal(L.cleanPoint({ t: now, lat: 0, lng: 0 }, now), null);
    assert.equal(L.cleanPoint({ t: now, lat: 95, lng: 31 }, now), null);
    assert.equal(L.cleanPoint({ t: now - 40 * 86400000, lat: 27, lng: 31 }, now), null);
    assert.equal(L.cleanPoint({ t: now, lat: 27, lng: 31, s: 999 }, now).speed, null);
  });
  it('accepts only known events with a uuid', () => {
    const u = '0123456789abcdef0123';
    assert.equal(L.cleanEvent({ uuid: u, kind: 'armed_move', t: now }, now).kind, 'armed_move');
    assert.equal(L.cleanEvent({ uuid: u, kind: 'rm -rf', t: now }, now), null);
    assert.equal(L.cleanEvent({ uuid: 'x', kind: 'armed', t: now }, now), null);
  });
  it('car arm change applies only on the latest version', () => {
    const car = { armed: false, armed_ver: 3 };
    assert.deepEqual(L.applyCarArm(car, { armed: true, baseVer: 3 }), { armed: true, ver: 4 });
    assert.equal(L.applyCarArm(car, { armed: true, baseVer: 2 }), null);   // الويب غيّر فى النص — الويب يكسب
    assert.equal(L.applyCarArm(car, { armed: false, baseVer: 3 }), null);
  });
  it('alerts', () => {
    assert.match(L.pushFor({ kind: 'armed_move', lat: 27.1, lng: 31.2 }, 'الفيرنا').body, /الفيرنا بتتحرك/);
    assert.equal(L.pushFor({ kind: 'pin_ok' }), null);
  });
  it('connection lost only when it was moving and went silent', () => {
    const t = (min) => new Date(now - min * 60000);
    assert.equal(L.connectionLostDue({ last_seen: t(5), last_speed: 50 }, now), true);
    assert.equal(L.connectionLostDue({ last_seen: t(5), last_speed: 0 }, now), false);   // اتركنت وطفت
    assert.equal(L.connectionLostDue({ last_seen: t(1), last_speed: 50 }, now), false);
    assert.equal(L.connectionLostDue({ last_seen: t(5), last_speed: 50, lost_alerted: true }, now), false);
  });
  it('downsample keeps ends', () => {
    const pts = Array.from({ length: 5000 }, (_, i) => i);
    const d = L.downsample(pts, 100);
    assert.equal(d.length, 100); assert.equal(d[0], 0); assert.equal(d[99], 4999);
  });
});

const URL_ = process.env.DRIVE_TEST_DATABASE_URL;
describe('database + http', { skip: !URL_ && 'DRIVE_TEST_DATABASE_URL not set' }, () => {
  let pool, server, base, pushes = [];
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: URL_ });
    await pool.query('DROP TABLE IF EXISTS od_push_subs, od_clips, od_events, od_points, od_owners, od_cars CASCADE');
    await require('../src/drive/schema').ensureDriveSchema(pool);
    await require('../src/drive/schema').ensureDriveSchema(pool);   // مرتين = ماتكسرش
    const push = { isEnabled: () => true, publicKey: () => 'k', send: async (sub, p) => { pushes.push(p); } };
    const express = require('express');
    const app = express();
    app.use(require('../src/routes/drive_site').createDriveSite({ pool, push }).router);
    server = app.listen(0);
    base = 'http://127.0.0.1:' + server.address().port;
  });
  after(async () => { server && server.close(); pool && (await pool.end()); });

  const call = (method, p, body, token) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) } }, (res) => {
      let s = ''; res.on('data', (c) => (s += c)); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch (e) {} resolve({ status: res.statusCode, json: j, text: s, headers: res.headers }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });

  it('full flow: register → offline points → pair → state → arm → alarm push', async () => {
    const reg = await call('POST', '/api/car/register', { app: '1.0.5' });
    assert.equal(reg.status, 200); const car = reg.json.token; assert.ok(car.length > 30);
    assert.equal((await call('POST', '/api/car/sync', {}, 'wrong')).status, 401);

    // ساعة من غير نت: نقط اتسجّلت على الشاشة ووصلت مرة واحدة — ومرتين = مفيش تكرار
    const t0 = Date.now() - 3600000;
    const points = Array.from({ length: 360 }, (_, i) => ({ t: t0 + i * 10000, lat: 27.18 + i * 0.0001, lng: 31.18, s: 40, h: 0, a: 5 }));
    let r = await call('POST', '/api/car/sync', { points, app: '1.0.5' }, car);
    assert.equal(r.status, 200); assert.equal(r.json.saved.points, 360); assert.equal(r.json.armed, false);
    await call('POST', '/api/car/sync', { points }, car);
    assert.equal(+(await pool.query('SELECT count(*) FROM od_points')).rows[0].count, 360);

    // ربط الموبايل: الكود مرة واحدة بس
    const code = (await call('POST', '/api/car/pair', {}, car)).json.code;
    assert.match(code, /^\d{6}$/);
    assert.equal((await call('POST', '/api/web/pair', { code: '000000' === code ? '111111' : '000000' })).status, 400);
    const own = (await call('POST', '/api/web/pair', { code })).json.token;
    assert.ok(own);
    assert.equal((await call('POST', '/api/web/pair', { code })).status, 400);

    let st = (await call('GET', '/api/web/state', null, own)).json;
    assert.equal(st.online, true);
    assert.ok(Math.abs(st.last.lat - (27.18 + 359 * 0.0001)) < 1e-9, 'آخر مكان = أحدث نقطة');
    const tr = (await call('GET', '/api/web/track?hours=2', null, own)).json.points;
    assert.equal(tr.length, 360);

    // المالك فعّل الحماية من الموبايل ⇒ الشاشة تعرف فى الدفعة الجاية
    assert.equal((await call('POST', '/api/web/arm', { armed: true }, own)).json.armed, true);
    r = await call('POST', '/api/car/sync', { arm: { armed: false, baseVer: 0 } }, car);   // الشاشة كانت شايفة نسخة قديمة
    assert.equal(r.json.armed, true, 'تغيير الويب يكسب');
    const ver = r.json.armedVer;

    // اشتراك الإشعارات + حدث سرقة ⇒ إشعار، ونفس الحدث تانى ⇒ مفيش إشعار تانى
    assert.equal((await call('POST', '/api/web/push', { subscription: { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' } } }, own)).json.ok, true);
    const ev = { uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', kind: 'armed_move', t: Date.now(), lat: 27.2, lng: 31.2 };
    await call('POST', '/api/car/sync', { events: [ev] }, car);
    await call('POST', '/api/car/sync', { events: [ev] }, car);
    await new Promise((x) => setTimeout(x, 50));
    assert.equal(pushes.filter((p) => p.tag === 'od-armed_move').length, 1);

    // الشاشة تقفل الحماية بالرقم السرى (نسختها حديثة)
    r = await call('POST', '/api/car/sync', { arm: { armed: false, baseVer: ver } }, car);
    assert.equal(r.json.armed, false);
    st = (await call('GET', '/api/web/state', null, own)).json;
    assert.equal(st.armedBy, 'car');
    assert.equal(st.events[0].kind, 'armed_move');
  });

  it('connection lost is claimed once', async () => {
    await pool.query(`UPDATE od_cars SET last_seen = now() - interval '5 minutes', last_speed = 60, lost_alerted = false`);
    const store = require('../src/drive/store');
    assert.equal((await store.claimLostCars(pool)).length, 1);
    assert.equal((await store.claimLostCars(pool)).length, 0);
  });

  it('serves the owner page noindex and 404s the rest', async () => {
    const page = await call('GET', '/');
    assert.equal(page.status, 200); assert.match(page.headers['x-robots-tag'], /noindex/);
    assert.match(page.text, /Oscar Security|Oscar Drive/);
    assert.equal((await call('GET', '/nope')).status, 404);
    assert.equal((await call('GET', '/sw.js')).status, 200);
    assert.equal((await call('GET', '/manifest.webmanifest')).status, 200);
  });
});
