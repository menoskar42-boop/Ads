// ذاكرة الطريق على السيرفر (٢٠٢٦-١١-١٨): المطبات ماتضيعش مع مسح التطبيق — رفع بالـuuid من غير تكرار · المسح deleted_at ·
// «ربط شاشة جديدة بنفس العربية» بكود من صفحة الموبايل بينقل التوكن والبيانات ومابيمسحش حاجة من العربية القديمة.
//   node --test test/drive_hazards.test.js   (DRIVE_TEST_DATABASE_URL=postgres://… للجزء التانى)
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const hz = require('../src/drive/hazards');

const U1 = '11111111-2222-4333-8444-555555555555';
const U2 = '11111111-2222-4333-8444-666666666666';
const item = (extra = {}) => ({ uuid: U1, type: 'bump', lat: 27.18, lng: 31.18, bearing: 92.5, acc: 6, alt: 51.2, t: Date.now() - 60000, ...extra });

describe('hazards: validation', () => {
  it('keeps clean items and drops bad ones without failing the batch', () => {
    const out = hz.parseItems({ items: [item(), item({ uuid: 'x' }), item({ uuid: U2, type: 'hack' }), item({ uuid: U2, lat: 200 }),
      item({ uuid: U2, bearing: 999, acc: null })] });
    assert.equal(out.length, 2);
    assert.equal(out[0].bearing, 92.5); assert.equal(out[0].altitude, 51.2);
    assert.equal(out[1].bearing, null); assert.equal(out[1].accuracy, null);
    assert.deepEqual(hz.parseItems({}), []);
    assert.equal(hz.parseItems({ items: Array.from({ length: 900 }, () => item()) }).length, hz.MAX_ITEMS);
  });
});

const URL_ = process.env.DRIVE_TEST_DATABASE_URL;
describe('hazards: database + http', { skip: !URL_ && 'DRIVE_TEST_DATABASE_URL not set' }, () => {
  let pool, server, base;
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: URL_ });
    await pool.query('DROP TABLE IF EXISTS od_hazards, od_shots, od_push_subs, od_clips, od_events, od_points, od_owners, od_cars CASCADE');
    await require('../src/drive/schema').ensureDriveSchema(pool);
    const express = require('express');
    const app = express();
    app.use(require('../src/routes/drive_site').createDriveSite({ pool, push: null }).router);
    server = app.listen(0); base = 'http://127.0.0.1:' + server.address().port;
  });
  after(async () => { server && server.close(); pool && (await pool.end()); });
  const call = (method, p, body, token) => new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) } }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks)); } catch (e) {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });

  it('upload twice = once · delete is soft · another car cannot overwrite', async () => {
    const car = (await call('POST', '/api/car/register', { app: '1.0' })).json.token;
    assert.equal((await call('POST', '/api/car/hazards', { items: [item()] }, 'bad')).status, 401);
    assert.equal((await call('POST', '/api/car/hazards', { items: [item(), item({ uuid: U2, type: 'pothole' })] }, car)).json.saved, 2);
    await call('POST', '/api/car/hazards', { items: [item()] }, car);
    let r = await call('POST', '/api/car/hazards', { items: [], pull: true }, car);
    assert.equal(r.json.items.length, 2);
    await call('POST', '/api/car/hazards', { items: [item({ uuid: U2, type: 'pothole', deleted: true })] }, car);
    r = await call('POST', '/api/car/hazards', { pull: true }, car);
    assert.deepEqual(r.json.items.map((x) => x.uuid), [U1]);
    assert.deepEqual(r.json.deleted, [U2]);   // الشاشة بتمسحه عندها كمان
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM od_hazards');
    assert.equal(rows[0].n, 2);   // الممسوح لسه موجود (deleted_at)
    const other = (await call('POST', '/api/car/register', { app: '1.0' })).json.token;
    assert.equal((await call('POST', '/api/car/hazards', { items: [item({ deleted: true })] }, other)).json.saved, 0);
    assert.equal((await call('POST', '/api/car/hazards', { pull: true }, car)).json.items.length, 1);
  });

  it('a reinstalled screen relinks to the same car and gets its road memory back', async () => {
    const oldCar = (await call('POST', '/api/car/register', { app: '1.0' })).json.token;
    const U3 = '22222222-2222-4333-8444-555555555555', U4 = '33333333-2222-4333-8444-555555555555';
    await call('POST', '/api/car/hazards', { items: [item({ uuid: U3 })] }, oldCar);
    const owner = (await call('POST', '/api/web/pair', { code: (await call('POST', '/api/car/pair', {}, oldCar)).json.code })).json.token;
    // التطبيق اتمسح واتسطّب ⇒ شاشة جديدة سجّلت مطب قبل الربط
    const fresh = (await call('POST', '/api/car/register', { app: '1.1' })).json.token;
    await call('POST', '/api/car/hazards', { items: [item({ uuid: U4, type: 'radar' })] }, fresh);
    assert.equal((await call('POST', '/api/car/relink', { code: '000000' }, fresh)).status, 400);
    const code = (await call('POST', '/api/web/relink', {}, owner)).json.code;
    assert.match(code, /^\d{6}$/);
    assert.equal((await call('POST', '/api/car/relink', { code }, fresh)).status, 200);
    assert.equal((await call('POST', '/api/car/relink', { code }, fresh)).status, 400);   // الكود لمرة واحدة
    const got = (await call('POST', '/api/car/hazards', { pull: true }, fresh)).json.items.map((x) => x.uuid).sort();
    assert.deepEqual(got, [U3, U4].sort());
    // التوكن القديم مابقاش شغّال، والموبايل لسه مربوط بنفس العربية
    assert.equal((await call('POST', '/api/car/hazards', { pull: true }, oldCar)).status, 401);
    assert.equal((await call('GET', '/api/web/state', null, owner)).status, 200);
  });

  it('QR: the new screen shows a code, the paired phone confirms, the screen sees it is linked', async () => {
    const oldCar = (await call('POST', '/api/car/register', { app: '1.0' })).json.token;
    const U5 = '44444444-2222-4333-8444-555555555555';
    await call('POST', '/api/car/hazards', { items: [item({ uuid: U5 })] }, oldCar);
    const owner = (await call('POST', '/api/web/pair', { code: (await call('POST', '/api/car/pair', {}, oldCar)).json.code })).json.token;
    const fresh = (await call('POST', '/api/car/register', { app: '1.2' })).json.token;
    const c = (await call('POST', '/api/car/claim', {}, fresh)).json;
    assert.match(c.code, /^\d{8}$/); assert.ok(c.url.endsWith('#claim=' + c.code));
    assert.equal((await call('POST', '/api/car/claim-status', {}, fresh)).json.linked, false);
    assert.equal((await call('POST', '/api/web/claim', { code: c.code })).status, 401);          // لازم موبايل مربوط
    assert.equal((await call('POST', '/api/web/claim', { code: '12345678' }, owner)).status, 400);
    assert.equal((await call('POST', '/api/web/claim', { code: c.code }, owner)).status, 200);
    assert.equal((await call('POST', '/api/web/claim', { code: c.code }, owner)).status, 400);   // مرة واحدة
    assert.equal((await call('POST', '/api/car/claim-status', {}, fresh)).json.linked, true);
    assert.deepEqual((await call('POST', '/api/car/hazards', { pull: true }, fresh)).json.items.map((x) => x.uuid), [U5]);
    assert.equal((await call('POST', '/api/car/hazards', { pull: true }, oldCar)).status, 401);
  });
});
