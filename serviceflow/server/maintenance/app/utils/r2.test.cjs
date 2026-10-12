const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Readable } = require('node:stream');
const r2 = require('./r2');

test('R2 video file upload streams bytes and supports byte-range playback', async (t) => {
  let object = Buffer.alloc(0);
  const server = http.createServer(async (req, res) => {
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      object = Buffer.concat(chunks);
      res.writeHead(200).end();
      return;
    }
    if (req.method === 'GET') {
      const range = req.headers.range;
      res.setHeader('content-type', 'video/mp4');
      res.setHeader('accept-ranges', 'bytes');
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        const start = Number(match[1]);
        const end = Math.min(match[2] ? Number(match[2]) : object.length - 1, object.length - 1);
        const body = object.subarray(start, end + 1);
        res.writeHead(206, { 'content-range': `bytes ${start}-${end}/${object.length}`, 'content-length': body.length }).end(body);
      } else {
        res.writeHead(200, { 'content-length': object.length }).end(object);
      }
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serviceflow-r2-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const file = path.join(tempDir, 'video.mp4');
  const expected = Buffer.from('video bytes that should never be buffered by the upload helper');
  fs.writeFileSync(file, expected);
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-access',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET: 'test-bucket',
    R2_ENDPOINT: `http://127.0.0.1:${server.address().port}`,
  });

  const uploaded = await r2.putFile('maintenance/videos/test.mp4', file, 'video/mp4');
  assert.equal(uploaded.size, expected.length);
  assert.equal(object.toString(), expected.toString());
  const result = await r2.openObject('maintenance/videos/test.mp4', { range: 'bytes=2-6' });
  assert.equal(result.status, 206);
  assert.equal(result.contentRange, `bytes 2-6/${expected.length}`);
  const chunks = [];
  for await (const chunk of Readable.fromWeb(result.body)) chunks.push(chunk);
  assert.equal(Buffer.concat(chunks).toString(), expected.subarray(2, 7).toString());
});

test('R2 video upload failure is explicit and returns no storage key', async (t) => {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(503).end('temporarily unavailable');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serviceflow-r2-fail-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const file = path.join(tempDir, 'video.mp4');
  fs.writeFileSync(file, Buffer.from('video payload'));
  Object.assign(process.env, {
    R2_ACCOUNT_ID: 'test-account',
    R2_ACCESS_KEY_ID: 'test-access',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET: 'test-bucket',
    R2_ENDPOINT: 'http://127.0.0.1:' + server.address().port,
  });

  await assert.rejects(r2.putFile('maintenance/videos/failure.mp4', file, 'video/mp4'), /R2 PUT .*503/);
});
