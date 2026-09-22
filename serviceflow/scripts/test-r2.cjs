const http = require('http');
const path = require('path').join(__dirname, '..', 'server', 'maintenance', 'app', 'utils') + require('path').sep;
const store = new Map();
let lastAuth = null;

const srv = http.createServer((req, res) => {
  lastAuth = req.headers.authorization;
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const key = decodeURIComponent(req.url);
    if (req.method === 'PUT')    { store.set(key, { b: Buffer.concat(chunks), ct: req.headers['content-type'] }); res.writeHead(200).end(); }
    else if (req.method === 'GET') {
      const o = store.get(key);
      if (!o) return res.writeHead(404).end();
      res.writeHead(200, { 'content-type': o.ct }).end(o.b);
    }
    else if (req.method === 'DELETE') { store.delete(key); res.writeHead(204).end(); }
    else res.writeHead(405).end();
  });
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  process.env.R2_ENDPOINT = `http://127.0.0.1:${port}`;
  process.env.R2_ACCESS_KEY_ID = 'testkey';
  process.env.R2_SECRET_ACCESS_KEY = 'testsecret';
  process.env.R2_BUCKET = 'sfbucket';
  const r2 = require(path + 'r2.js');
  const { storeMedia } = require(path + 'photo.js');
  let ok = 0, bad = 0;
  const t = (name, cond) => { if (cond) { console.log('  ✅ ' + name); ok++; } else { console.log('  ❌ ' + name); bad++; } };

  t('isConfigured مع الأسرار', r2.isConfigured() === true);

  const body = Buffer.from('fake-jpeg-bytes-٠١٢٣');
  const key = r2.keyFor('before_12_1700000000.jpg', 'photo');
  t('keyFor للصور', key === 'maintenance/photos/before_12_1700000000.jpg');
  t('keyFor للفيديو', r2.keyFor('a.mp4', 'video') === 'maintenance/videos/a.mp4');

  await r2.putObject(key, body, 'image/jpeg');
  t('PUT وصل والتوقيع اتبعت', /^AWS4-HMAC-SHA256 Credential=testkey\//.test(lastAuth || ''));
  t('المسار path-style صح', store.has('/sfbucket/maintenance/photos/before_12_1700000000.jpg'));

  const got = await r2.getObject(key);
  t('GET رجّع نفس البايتات', got && got.body.equals(body));
  t('GET رجّع الـcontent-type', got.contentType === 'image/jpeg');
  t('GET لمفتاح مش موجود = null', (await r2.getObject('maintenance/photos/nope.jpg')) === null);

  // storeMedia: النجاح
  const s1 = await storeMedia('x_1.jpg', body, 'photo');
  t('storeMedia نجح → storageKey مع data=null', s1.storageKey === 'maintenance/photos/x_1.jpg' && s1.data === null);
  t('storeMedia رفع فعلاً', store.has('/sfbucket/maintenance/photos/x_1.jpg'));

  // storeMedia: R2 واقع (بورت مقفول)
  const good = process.env.R2_ENDPOINT;
  process.env.R2_ENDPOINT = 'http://127.0.0.1:1';
  const s2 = await storeMedia('x_2.jpg', body, 'photo');
  t('R2 واقع → الصورة بترجع فى data (مابتضيعش)', s2.storageKey === null && Buffer.isBuffer(s2.data) && s2.data.equals(body));
  process.env.R2_ENDPOINT = good;

  // storeMedia: مش مضبوط أصلاً
  const savedBucket = process.env.R2_BUCKET; delete process.env.R2_BUCKET;
  const s3 = await storeMedia('x_3.jpg', body, 'photo');
  t('R2 مش مضبوط → السلوك القديم بالظبط', s3.storageKey === null && s3.data.equals(body));
  process.env.R2_BUCKET = savedBucket;

  await r2.deleteObject(key);
  t('DELETE شال الكائن', !store.has('/sfbucket/maintenance/photos/before_12_1700000000.jpg'));
  t('DELETE لمفتاح مش موجود مابيرميش', (await r2.deleteObject('maintenance/photos/nope.jpg')) === true);

  console.log(`\n${bad ? '❌' : '✅'} ${ok} نجح، ${bad} فشل`);
  srv.close(); process.exit(bad ? 1 : 0);
});
