/**
 * تخزين الصور والفيديوهات على Cloudflare R2 — **من غير أى مكتبة خارجية**.
 *
 * ليه من غير `@aws-sdk/client-s3`؟ المكتبة دى ~٢٠ ميجا ومعاها عشرات الحزم
 * الفرعية، ولو فشل تثبيتها فى بناء ريبليت التطبيق كله مابيقومش. الـAPI اللى
 * إحنا محتاجينه تلاتة أفعال بس (PUT / GET / DELETE) وتوقيع AWS SigV4 —
 * وده مكتوب هنا بـ`crypto` و`fetch` المدمجين فى Node 22.
 *
 * التشغيل يتوقّف على أربع أسرار. لو أى واحد ناقص → `isConfigured()` بترجّع
 * false والتطبيق بيشتغل **بالضبط زى ما هو دلوقتى** (الصور فى عمود BYTEA).
 * يعنى إضافة الملف ده لوحدها ما بتغيّرش أى سلوك لحد ما الأسرار تتحط.
 *
 *   R2_ACCOUNT_ID         معرّف حساب Cloudflare
 *   R2_ACCESS_KEY_ID      من R2 API Token
 *   R2_SECRET_ACCESS_KEY  من R2 API Token
 *   R2_BUCKET             اسم الباكِت
 *   R2_ENDPOINT           (اختيارى) يتجاوز الـendpoint المحسوب
 */

const crypto = require('crypto');

const SERVICE = 's3';
const REGION = process.env.R2_REGION || 'auto'; // R2 بتطلب حرفياً "auto"

function cfg() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucket = process.env.R2_BUCKET || '';
  const endpoint = (process.env.R2_ENDPOINT
    || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
  return { accessKeyId, secretAccessKey, bucket, endpoint };
}

function isConfigured() {
  const c = cfg();
  return Boolean(c.accessKeyId && c.secretAccessKey && c.bucket && c.endpoint);
}

const sha256hex = (b) => crypto.createHash('sha256').update(b).digest('hex');
const hmac = (key, str) => crypto.createHmac('sha256', key).update(str, 'utf8').digest();

// ترميز كل مقطع من المسار زى ما SigV4 بيطلب (الـ'/' بتفضل فاصل).
function encodeKey(key) {
  return String(key).split('/').map(encodeURIComponent).join('/');
}

function signingKey(secret, dateStamp, region) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), SERVICE), 'aws4_request');
}

/**
 * بيبنى الـURL والهيدرز الموقّعة لطلب واحد.
 * body لازم يكون Buffer (أو فاضى لـ GET/DELETE).
 */
/**
 * قلب التوقيع — دالة نقيّة (مفيش env ولا وقت جوّاها) عشان تتاخد بالاختبار
 * مقابل المثال الرسمى المنشور من AWS. بترجّع قيمة هيدر Authorization.
 */
function buildAuth({ method, host, pathname, query, headers, payloadHash, amzDate, region, accessKeyId, secretAccessKey }) {
  const all = { host, ...headers };
  // الهيدرز الموقّعة: أسماء بحروف صغيرة، مرتّبة، والقيم متشالة منها المسافات الزايدة.
  const names = Object.keys(all).map((h) => h.toLowerCase()).sort();
  const canonicalHeaders = names
    .map((n) => {
      const orig = Object.keys(all).find((h) => h.toLowerCase() === n);
      return `${n}:${String(all[orig]).trim().replace(/\s+/g, ' ')}\n`;
    })
    .join('');
  const signedHeaders = names.join(';');

  const canonicalRequest = [
    method,
    pathname,
    query || '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256hex(Buffer.from(canonicalRequest, 'utf8')),
  ].join('\n');

  const signature = crypto
    .createHmac('sha256', signingKey(secretAccessKey, dateStamp, region))
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, `
      + `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    signature,
    canonicalRequest,
    stringToSign,
  };
}

/**
 * بيبنى الـURL والهيدرز الموقّعة لطلب واحد.
 * body لازم يكون Buffer (أو فاضى لـ GET/DELETE).
 */
function signRequest(method, key, body, extraHeaders = {}, opts = {}) {
  const c = cfg();
  if (!isConfigured()) throw new Error('R2 غير مضبوط: أسرار ناقصة');

  const url = new URL(`${c.endpoint}/${c.bucket}/${encodeKey(key)}`);
  const payload = body && body.length ? body : Buffer.alloc(0);
  const payloadHash = sha256hex(payload);

  // opts.amzDate للاختبار فقط (تثبيت التاريخ للتحقق من التوقيع مقابل مثال AWS الرسمى).
  const amzDate = opts.amzDate || new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ

  const headers = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders,
  };

  const { authorization } = buildAuth({
    method,
    host: url.host,
    pathname: url.pathname,
    query: '', // مفيش query string فى أى من الأفعال التلاتة
    headers,
    payloadHash,
    amzDate,
    region: REGION,
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
  });

  return { url: url.toString(), headers: { ...headers, host: url.host, Authorization: authorization } };
}

const TIMEOUT_MS = Number(process.env.R2_TIMEOUT_MS || 20000);

async function send(method, key, body, extraHeaders) {
  const { url, headers } = signRequest(method, key, body, extraHeaders);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { method, headers, body: body && body.length ? body : undefined, signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

/** يرفع كائن. بيرمى لو فشل — المنادى هو اللى يقرّر يرجع للقاعدة. */
async function putObject(key, body, contentType) {
  const res = await send('PUT', key, body, {
    'content-type': contentType || 'application/octet-stream',
    'content-length': String(body.length),
  });
  if (!res.ok) {
    throw new Error(`R2 PUT ${key} رجّع ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  }
  return key;
}

/** بيقرأ كائن → { body: Buffer, contentType } أو null لو مش موجود (404). */
async function getObject(key) {
  const res = await send('GET', key, null);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`R2 GET ${key} رجّع ${res.status}`);
  }
  return {
    body: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}

/** بيمسح كائن. R2 بترجّع 204 حتى لو مش موجود. */
async function deleteObject(key) {
  const res = await send('DELETE', key, null);
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 DELETE ${key} رجّع ${res.status}`);
  }
  return true;
}

/** مفتاح التخزين المشتق من اسم الملف — مجلد واحد يفصل الصور عن الفيديوهات. */
function keyFor(filename, mediaType) {
  const folder = mediaType === 'video' ? 'videos' : 'photos';
  return `maintenance/${folder}/${filename}`;
}

module.exports = { isConfigured, putObject, getObject, deleteObject, keyFor, signRequest, buildAuth, cfg };
