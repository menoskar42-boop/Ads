// «🩺 فحص الجهاز» + «وضع المقارنة» (٢٠٢٦-١١-١٩): الشاشة والموبايل بيبعتوا آخر فحص، وصفحة الموبايل بتشوفهم جنب بعض.
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/drive/diag');

describe('diag: validation', () => {
  it('keeps known fields only, in range', () => {
    assert.equal(D.clean({}), null);
    const d = D.clean({ rows: [{ l: 'الجهاز', v: 'x'.repeat(500) }, { l: '' }, null], gps: { fixes: 60, perSec: 1.02, avgAcc: 9.5, p90Acc: 'bad' }, evil: 1 });
    assert.equal(d.rows.length, 1); assert.equal(d.rows[0].v.length, 160);
    assert.equal(d.gps.p90Acc, null); assert.equal(d.evil, undefined);
  });
});

const URL_ = process.env.DRIVE_TEST_DATABASE_URL;
describe('diag: database + http', { skip: !URL_ && 'DRIVE_TEST_DATABASE_URL not set' }, () => {
  let pool, server, base;
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: URL_ });
    await pool.query('DROP TABLE IF EXISTS od_inbox, od_hazards, od_shots, od_push_subs, od_clips, od_events, od_points, od_owners, od_cars CASCADE');
    await require('../src/drive/schema').ensureDriveSchema(pool);
    const app = require('express')();
    app.use(require('../src/routes/drive_site').createDriveSite({ pool, push: null }).router);
    server = app.listen(0); base = 'http://127.0.0.1:' + server.address().port;
  });
  after(async () => { server && server.close(); pool && (await pool.end()); });
  const call = async (p, body, token, method = 'POST') => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  it('screen and phone reports side by side; another car sees nothing', async () => {
    const car = (await call('/api/car/register', { app: 't' })).json.token;
    const owner = (await call('/api/web/pair', { code: (await call('/api/car/pair', {}, car)).json.code })).json.token;
    const other = (await call('/api/web/solo')).json.token;
    assert.equal((await call('/api/car/diag', { rows: [{ l: 'الجهاز', v: 'CT-850' }], gps: { fixes: 58, perSec: 0.98, avgAcc: 6 } }, car)).status, 200);
    assert.equal((await call('/api/web/diag', { rows: [{ l: 'المتصفح', v: 'Chrome 140' }], gps: { fixes: 15, perSec: 1, avgAcc: 12 } }, owner)).status, 200);
    assert.equal((await call('/api/web/diag', {}, owner)).status, 400);
    const r = (await call('/api/web/diag', null, owner, 'GET')).json;
    assert.equal(r.car.rows[0].v, 'CT-850'); assert.equal(r.car.gps.avgAcc, 6);
    assert.equal(r.phones.length, 1); assert.equal(r.phones[0].me, true); assert.equal(r.phones[0].gps.avgAcc, 12);
    const o = (await call('/api/web/diag', null, other, 'GET')).json;
    assert.equal(o.car, null); assert.equal(o.phones.length, 0);
  });
});
