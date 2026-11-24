// صور الطريق من Oscar Drive لتدريب موديل المطبات (٢٠٢٦-١١-١٨): التحقق من الصورة · الـzip · والمسار كامل على Postgres لو موجود.
//   node --test test/drive_shots.test.js   (DRIVE_TEST_DATABASE_URL=postgres://… للجزء التانى)
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const zlib = require('zlib');
const shots = require('../src/drive/shots');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])]);
const meta = (extra = {}) => ({ uuid: '3f2b8c1e-1111-4222-8333-944455556666', t: Date.now() - 1000, reason: 'bump_approach', lat: 27.18, lng: 31.18,
  kmh: 42, hazard: { id: 5, type: 'bump', lat: 27.181, lng: 31.18 }, distanceM: 49.6, ...extra });

describe('shots: validation + zip', () => {
  it('accepts a jpeg with clean metadata', () => {
    const p = shots.parse({ meta: meta(), jpg: JPG.toString('base64') });
    assert.equal(p.error, undefined);
    assert.equal(p.reason, 'bump_approach'); assert.equal(p.hazardType, 'bump'); assert.equal(p.distanceM, 50);
    assert.equal(p.meta.kmh, 42);
  });
  it('rejects non-jpeg, oversize, bad uuid, and unknown reasons fall back to button', () => {
    assert.equal(shots.parse({ meta: meta(), jpg: Buffer.from('<svg/>').toString('base64') }).error, 'not a jpeg');
    const big = Buffer.concat([JPG, Buffer.alloc(shots.MAX_BYTES)]);
    assert.equal(shots.parse({ meta: meta(), jpg: big.toString('base64') }).error, 'too big');
    assert.equal(shots.parse({ meta: meta({ uuid: '../x' }), jpg: JPG.toString('base64') }).error, 'bad meta');
    assert.equal(shots.parse({ meta: meta({ reason: 'hack' }), jpg: JPG.toString('base64') }).reason, 'button');
  });
  it('keeps whitelisted automatic bump capture metadata within its limits', () => {
    const p = shots.parse({ meta: meta({
      markM: 50, onsetM: 150, source: 'phone-extra',
      hazard: { id: 'hazard-123', type: 'bump', lat: 27.181, lng: 31.18, oneway: true },
      camera: { label: 'rear camera '.repeat(8), w: 1280, h: 720 }, ua: 'x'.repeat(140),
    }), jpg: JPG.toString('base64') });
    assert.equal(p.error, undefined);
    assert.equal(p.reason, 'bump_approach');
    assert.equal(p.meta.markM, 50); assert.equal(p.meta.onsetM, 150);
    assert.equal(p.meta.source, 'phone-extr');
    assert.equal(p.meta.hazard.id, 'hazard-123'); assert.equal(p.meta.hazard.oneway, true);
    assert.equal(p.meta.camera.label.length, 60); assert.equal(p.meta.camera.w, 1280); assert.equal(p.meta.camera.h, 720);
    assert.equal(p.meta.ua.length, 120);
  });
  it('zip is a valid STORE archive (crc + sizes) — local headers parse back', () => {
    const z = shots.zip([{ name: 'shots/a.jpg', data: JPG }, { name: 'shots/a.json', data: Buffer.from('{"x":1}') }]);
    assert.equal(z.readUInt32LE(0), 0x04034b50);
    assert.equal(z.readUInt32LE(14), shots.crc32(JPG));
    assert.equal(z.readUInt32LE(z.length - 22), 0x06054b50);
    assert.equal(z.readUInt16LE(z.length - 12), 2);
    assert.equal(shots.crc32(Buffer.from('123456789')), 0xcbf43926);
    assert.ok(zlib);
  });
});

const URL_ = process.env.DRIVE_TEST_DATABASE_URL;
describe('shots: database + http', { skip: !URL_ && 'DRIVE_TEST_DATABASE_URL not set' }, () => {
  let pool, server, base;
  before(async () => {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: URL_ });
    await pool.query('DROP TABLE IF EXISTS od_inbox, od_hazards, od_shots, od_push_subs, od_clips, od_events, od_points, od_owners, od_cars CASCADE');
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
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => { const b = Buffer.concat(chunks); let j = null; try { j = JSON.parse(b); } catch (e) {} resolve({ status: res.statusCode, json: j, buf: b, headers: res.headers }); });
    });
    req.on('error', reject); if (data) req.write(data); req.end();
  });

  it('R2: the photo goes to R2 (DB keeps only the metadata) and is read back for viewing and zip; R2 failure falls back to the DB', async () => {
    const mem = new Map();
    const store = { putObject: async (k, b) => { mem.set(k, Buffer.from(b)); return k; }, getObject: async (k) => (mem.has(k) ? { body: mem.get(k) } : null),
      deleteObject: async (k) => { mem.delete(k); return true; } };
    const { rows: [c] } = await pool.query(`INSERT INTO od_cars (token_hash) VALUES ('r2test') RETURNING id`);
    const p = shots.parse({ meta: meta({ uuid: '7a2b8c1e-1111-4222-8333-944455556666' }), jpg: JPG.toString('base64') });
    await shots.save(pool, c.id, p, store);
    const { rows: [r] } = await pool.query(`SELECT jpg, r2_key FROM od_shots WHERE uuid = $1`, [p.uuid]);
    assert.equal(r.jpg, null); assert.equal(r.r2_key, `oscar-drive/shots/${c.id}/${p.uuid}.jpg`);
    const { rows: [row] } = await pool.query(`SELECT id FROM od_shots WHERE uuid = $1`, [p.uuid]);
    assert.ok((await shots.jpg(pool, c.id, row.id, store)).equals(JPG));
    const z = await shots.exportZip(pool, c.id, true, store);
    assert.equal(z.count, 1);
    // وضع تجربة: فولدر لوحده على R2، ومش فى العدّاد ولا الـzip العادى، وبيتمسح بزرار
    const pt = shots.parse({ meta: meta({ uuid: '9a2b8c1e-1111-4222-8333-944455556666', test: true }), jpg: JPG.toString('base64') });
    await shots.save(pool, c.id, pt, store);
    assert.ok(mem.has(`oscar-drive/shots-test/${c.id}/${pt.uuid}.jpg`));
    const l = await shots.list(pool, c.id);
    assert.equal(l.counts.test, 1); assert.equal(l.counts.total, 1);
    assert.equal((await shots.exportZip(pool, c.id, true, store)).count, 1);           // العادى من غير التجربة
    assert.equal((await shots.exportZip(pool, c.id, true, store, true)).count, 1);     // التجربة لوحدها
    assert.equal(await shots.clearTest(pool, c.id, store), 1);
    assert.ok(!mem.has(`oscar-drive/shots-test/${c.id}/${pt.uuid}.jpg`));
    // المالك بيمسح صورة صورة (من R2 ومن القاعدة) — ومايقدرش يمسح صورة عربية تانية
    assert.equal(await shots.remove(pool, c.id + 999, row.id, store), 0);
    assert.equal(await shots.remove(pool, c.id, row.id, store), 1);
    assert.ok(!mem.has(`oscar-drive/shots/${c.id}/${p.uuid}.jpg`));
    assert.equal(await shots.remove(pool, c.id, row.id, store), 0);
    const bad = { putObject: async () => { throw new Error('down'); } };
    const p2 = shots.parse({ meta: meta({ uuid: '8a2b8c1e-1111-4222-8333-944455556666' }), jpg: JPG.toString('base64') });
    await shots.save(pool, c.id, p2, bad);
    const { rows: [r2] } = await pool.query(`SELECT jpg IS NOT NULL AS has, r2_key FROM od_shots WHERE uuid = $1`, [p2.uuid]);
    assert.equal(r2.has, true); assert.equal(r2.r2_key, null);
  });

  it('car uploads → owner lists, views and downloads a zip once', async () => {
    const car = (await call('POST', '/api/car/register', { app: '1.0.9' })).json.token;
    assert.equal((await call('POST', '/api/car/shot', { meta: meta(), jpg: JPG.toString('base64') }, 'wrong')).status, 401);
    assert.equal((await call('POST', '/api/car/shot', { meta: meta(), jpg: 'AAAA' }, car)).status, 400);
    assert.equal((await call('POST', '/api/car/shot', { meta: meta(), jpg: JPG.toString('base64') }, car)).status, 200);
    assert.equal((await call('POST', '/api/car/shot', { meta: meta(), jpg: JPG.toString('base64') }, car)).status, 200);   // نفس الـuuid = مرة واحدة
    const code = (await call('POST', '/api/car/pair', {}, car)).json.code;
    const owner = (await call('POST', '/api/web/pair', { code })).json.token;
    assert.equal((await call('GET', '/api/web/shots')).status, 401);
    const l = await call('GET', '/api/web/shots', null, owner);
    assert.equal(l.json.counts.total, 1); assert.equal(l.json.counts.fresh, 1); assert.equal(l.json.counts.bumps, 1);
    const img = await call('GET', `/api/web/shots/${l.json.shots[0].id}/jpg`, null, owner);
    assert.equal(img.status, 200); assert.ok(img.buf.equals(JPG));
    const z = await call('GET', '/api/web/shots.zip', null, owner);
    assert.equal(z.status, 200); assert.equal(z.headers['x-shots'], '1'); assert.equal(z.buf.readUInt32LE(0), 0x04034b50);
    assert.ok(z.buf.includes(Buffer.from('_bump_approach_bump_50m_')));
    assert.equal((await call('GET', '/api/web/shots.zip', null, owner)).status, 404);   // اتنزّلت خلاص
    assert.equal((await call('GET', '/api/web/shots.zip?all=1', null, owner)).status, 200);
  });
});
