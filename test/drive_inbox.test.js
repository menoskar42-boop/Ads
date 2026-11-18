// «📲 ابعت للشاشة» (٢٠٢٦-١١-١٨): الموبايل بيبعت مكان/مهمة/تذكير/تفويلة ⇒ الشاشة بتسحب وبتأكّد ⇒ النص بيتمسح من السيرفر.
//   node --test test/drive_inbox.test.js   (DRIVE_TEST_DATABASE_URL=postgres://… للجزء التانى)
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const ib = require('../src/drive/inbox');
const U = (n) => '11111111-2222-4333-8444-' + String(n).padStart(12, '0');

describe('inbox: validation', () => {
  it('cleans each kind and refuses bad ones', () => {
    assert.equal(ib.parse({ uuid: 'x', kind: 'note', payload: { text: 'a' } }).error, 'bad uuid');
    assert.equal(ib.parse({ uuid: U(1), kind: 'hack', payload: {} }).error, 'bad kind');
    assert.ok(ib.parse({ uuid: U(1), kind: 'place', payload: { name: 'البيت' } }).error);
    const pl = ib.parse({ uuid: U(1), kind: 'place', payload: { name: ' البيت\n', lat: 27.1, lng: 31.2, acc: 9 } });
    assert.deepEqual(pl.payload, { name: 'البيت', lat: 27.1, lng: 31.2, acc: 9 }); assert.equal(pl.label, '📍 البيت');
    const f = ib.parse({ uuid: U(2), kind: 'fill', payload: { liters: 30, paid: 600, full: true, grade: '92', odo: 'x' } });
    assert.equal(f.payload.grade, '92'); assert.equal(f.payload.odo, null); assert.equal(f.label, '⛽ 30 لتر · 600 جنيه');
    assert.ok(ib.parse({ uuid: U(2), kind: 'fill', payload: { liters: 900 } }).error);
    const r = ib.parse({ uuid: U(3), kind: 'remind', payload: { text: 'x'.repeat(500), dueMs: Date.now() + 3600e3, place: 'الشغل' } });
    assert.equal(r.payload.text.length, 300); assert.equal(r.payload.place, 'الشغل'); assert.equal(r.label.length, 40);
    assert.equal(ib.parse({ uuid: U(4), kind: 'task', payload: { text: '  ' } }).error, 'اكتب النص');
  });
});

const URL_ = process.env.DRIVE_TEST_DATABASE_URL;
describe('inbox: database + http', { skip: !URL_ && 'DRIVE_TEST_DATABASE_URL not set' }, () => {
  let pool, server, base;
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: URL_ });
    await pool.query('DROP TABLE IF EXISTS od_inbox, od_hazards, od_shots, od_push_subs, od_clips, od_events, od_points, od_owners, od_cars CASCADE');
    await require('../src/drive/schema').ensureDriveSchema(pool);
    const app = require('express')();
    app.use(require('../src/routes/drive_site').createDriveSite({ pool, push: null }).router);
    server = app.listen(0); base = 'http://127.0.0.1:' + server.address().port;
    ib._reset();
  });
  after(async () => { server && server.close(); pool && (await pool.end()); });
  const call = async (p, body, token, method = 'POST') => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };

  it('phone sends → screen takes → ack wipes the text · another car sees nothing', async () => {
    const car = (await call('/api/car/register', { app: 't' })).json.token;
    const owner = (await call('/api/web/pair', { code: (await call('/api/car/pair', {}, car)).json.code })).json.token;
    const other = (await call('/api/car/register', { app: 't' })).json.token;
    assert.equal((await call('/api/car/companions', {}, car)).json.inbox, false);
    assert.equal((await call('/api/web/inbox', { uuid: U(1), kind: 'task', payload: { text: 'أغيّر الزيت' } }, owner)).status, 200);
    await call('/api/web/inbox', { uuid: U(1), kind: 'task', payload: { text: 'أغيّر الزيت' } }, owner);   // نفس الـuuid = مرة واحدة
    await call('/api/web/inbox', { uuid: U(2), kind: 'place', payload: { name: 'النادى', lat: 27, lng: 31 } }, owner);
    assert.equal((await call('/api/web/inbox', { uuid: U(3), kind: 'fill', payload: {} }, owner)).status, 400);
    assert.equal((await call('/api/car/companions', {}, car)).json.inbox, true);
    assert.equal((await call('/api/car/inbox', {}, other)).json.items.length, 0);
    let r = await call('/api/car/inbox', {}, car);
    assert.deepEqual(r.json.items.map((x) => x.kind), ['task', 'place']);
    assert.equal(r.json.items[0].payload.text, 'أغيّر الزيت');
    r = await call('/api/car/inbox', { ack: [U(1), U(2)] }, car);
    assert.equal(r.json.items.length, 0);
    assert.equal((await call('/api/car/companions', {}, car)).json.inbox, false);
    const { rows } = await pool.query('SELECT payload FROM od_inbox ORDER BY id');
    assert.deepEqual(rows.map((x) => x.payload), [{}, {}]);   // النص اتمسح بعد الاستلام
    const list = (await call('/api/web/inbox', null, owner, 'GET')).json.items;
    assert.equal(list.length, 2); assert.ok(list.every((x) => x.delivered_at));
    assert.equal((await call('/api/web/inbox', null, 'bad', 'GET')).status, 401);
  });
});
