// صور الطريق من Oscar Drive لتدريب موديل المطبات (المالك ٢٠٢٦-١١-١٨). الشاشة بتبعت JPEG + بيانات (المكان · السرعة · المطب والمسافة)،
// وصاحب العربية بينزّلهم zip من drive.oscardevs.com (الإكستنشن بيرفعه على GitHub وكلود بيراجعه قبل التدريب).
'use strict';

const MAX_BYTES = 600 * 1024;
const MAX_PER_CAR = 1500;
const ZIP_MAX_BYTES = 20 * 1024 * 1024;   // GitHub بيقبل لحد ٢٥ ميجا للملف من المتصفح
const REASONS = new Set(['voice', 'button', 'bump_approach']);

function isJpeg(buf) { return Buffer.isBuffer(buf) && buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff; }

/** بيتأكد من الطلب ويرجّع { meta, buf } أو { error }. */
function parse(body) {
  if (!body || typeof body !== 'object') return { error: 'empty' };
  const meta = body.meta && typeof body.meta === 'object' ? body.meta : null;
  if (!meta || typeof meta.uuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(meta.uuid)) return { error: 'bad meta' };
  let buf;
  try { buf = Buffer.from(String(body.jpg || ''), 'base64'); } catch (e) { return { error: 'bad image' }; }
  if (!isJpeg(buf)) return { error: 'not a jpeg' };
  if (buf.length > MAX_BYTES) return { error: 'too big' };
  const t = Number(meta.t);
  const at = Number.isFinite(t) && t > 1.6e12 && t < Date.now() + 86400000 ? new Date(t) : new Date();
  const clean = {};
  for (const k of ['lat', 'lng', 'kmh', 'heading', 'acc', 'distanceM', 'orientation']) if (Number.isFinite(Number(meta[k]))) clean[k] = Number(meta[k]);
  if (meta.hazard && typeof meta.hazard === 'object') {
    clean.hazard = { type: String(meta.hazard.type || '').slice(0, 20), lat: Number(meta.hazard.lat) || null, lng: Number(meta.hazard.lng) || null };
  }
  clean.app = String(meta.app || '').slice(0, 30);
  return {
    buf, meta: clean, uuid: meta.uuid.toLowerCase(), at,
    reason: REASONS.has(meta.reason) ? meta.reason : 'button',
    hazardType: clean.hazard ? clean.hazard.type : null,
    distanceM: Number.isFinite(clean.distanceM) ? Math.round(clean.distanceM) : null,
    test: meta.test === true,
  };
}

/*
 * Cloudflare R2 (نفس كود صور الصيانة — serviceflow/server/maintenance/app/utils/r2.js، من غير مكتبات): لو الأسرار الأربعة موجودة
 * الصورة بتتحفظ هناك (oscar-drive/shots/<عربية>/<uuid>.jpg) والقاعدة فيها البيانات بس. لو R2 مش متظبّط أو فشل ⇒ القاعدة زى الأول.
 */
let r2 = null;
try { r2 = require('../../serviceflow/server/maintenance/app/utils/r2'); } catch (e) { r2 = null; }
const r2On = () => !!(r2 && r2.isConfigured());

async function save(pool, carId, p, store = r2On() ? r2 : null) {
  let key = null;
  if (store) {
    const k = `oscar-drive/${p.test ? 'shots-test' : 'shots'}/${carId}/${p.uuid}.jpg`;   // التجربة فى فولدر لوحدها
    try { await store.putObject(k, p.buf, 'image/jpeg'); key = k; } catch (e) { key = null; }   // فشل ⇒ القاعدة
  }
  await pool.query(
    `INSERT INTO od_shots (car_id, uuid, at, reason, hazard_type, distance_m, meta, bytes, jpg, r2_key, test)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (uuid) DO NOTHING`,
    [carId, p.uuid, p.at, p.reason, p.hazardType, p.distanceM, p.meta, p.buf.length, key ? null : p.buf, key, !!p.test]);
  // الحد: اللى اتنزّل قبل كده يتمسح الأول، وبعدين الأقدم (ومعاه ملفه على R2)
  const { rows } = await pool.query(
    `DELETE FROM od_shots WHERE id IN (
       SELECT id FROM od_shots WHERE car_id = $1 ORDER BY (exported_at IS NULL), at DESC OFFSET $2) RETURNING r2_key`,
    [carId, MAX_PER_CAR]);
  for (const r of rows) if (r.r2_key && store) await store.deleteObject(r.r2_key).catch(() => {});
}

/** الصورة نفسها: من R2 لو اتحفظت هناك، وإلا من القاعدة. */
async function bytesOf(row, store = r2) {
  if (row.jpg) return row.jpg;
  if (row.r2_key && store) { const o = await store.getObject(row.r2_key).catch(() => null); return o ? o.body : null; }
  return null;
}

async function list(pool, carId) {
  const { rows } = await pool.query(
    `SELECT id, at, reason, hazard_type, distance_m, bytes, exported_at IS NOT NULL AS exported, test
       FROM od_shots WHERE car_id = $1 ORDER BY at DESC LIMIT 60`, [carId]);
  const { rows: [c] } = await pool.query(
    `SELECT count(*) FILTER (WHERE NOT test)::int AS total, count(*) FILTER (WHERE exported_at IS NULL AND NOT test)::int AS fresh,
            count(*) FILTER (WHERE reason = 'bump_approach' AND NOT test)::int AS bumps,
            count(*) FILTER (WHERE test)::int AS test FROM od_shots WHERE car_id = $1`, [carId]);
  return { shots: rows, counts: c };
}

async function jpg(pool, carId, id, store = r2) {
  const { rows } = await pool.query(`SELECT jpg, r2_key FROM od_shots WHERE car_id = $1 AND id = $2`, [carId, id]);
  return rows[0] ? bytesOf(rows[0], store) : null;
}

/* ───────── zip (STORE — الـJPEG مضغوط أصلاً) ───────── */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

function zip(files) {
  const parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(f.data.length, 18); local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, name, f.data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(0, 10);
    cen.writeUInt32LE(0, 12); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(f.data.length, 20); cen.writeUInt32LE(f.data.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(off, 42);
    central.push(cen, name);
    off += 30 + name.length + f.data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

/** الصور اللى لسه ماتنزّلتش (أو كلها) لحد ٢٠ ميجا — كل صورة جنبها json ببياناتها. بيعلّمهم «اتنزّلت». */
async function exportZip(pool, carId, all, store = r2, test = false) {
  const { rows } = await pool.query(
    `SELECT id, uuid, at, reason, hazard_type, distance_m, meta, jpg, r2_key, bytes FROM od_shots
      WHERE car_id = $1 AND test = $2 ${all ? '' : 'AND exported_at IS NULL'} ORDER BY at`, [carId, !!test]);
  const files = [], ids = [];
  let size = 0;
  for (const r of rows) {
    if (size + (r.bytes || 0) > ZIP_MAX_BYTES) break;
    r.jpg = await bytesOf(r, store);
    if (!r.jpg) continue;   // الملف مش موجود على R2 — نعدّيه
    const stamp = new Date(r.at).toISOString().replace(/[-:]/g, '').slice(0, 15);
    const base = `${stamp}_${r.reason}${r.hazard_type ? '_' + r.hazard_type : ''}${r.distance_m != null ? '_' + r.distance_m + 'm' : ''}_${r.uuid.slice(0, 8)}`;
    files.push({ name: `shots/${base}.jpg`, data: r.jpg });
    files.push({ name: `shots/${base}.json`, data: Buffer.from(JSON.stringify({ at: r.at, reason: r.reason, ...r.meta }, null, 1)) });
    size += r.jpg.length; ids.push(r.id);
  }
  if (ids.length) await pool.query(`UPDATE od_shots SET exported_at = now() WHERE id = ANY($1) AND exported_at IS NULL`, [ids]);
  return { buf: zip(files), count: ids.length, more: rows.length > ids.length };
}

/** «🧹 امسح صور التجربة»: الصفوف وملفاتها على R2. */
async function clearTest(pool, carId, store = r2) {
  const { rows } = await pool.query('DELETE FROM od_shots WHERE car_id = $1 AND test RETURNING r2_key', [carId]);
  for (const r of rows) if (r.r2_key && store) await store.deleteObject(r.r2_key).catch(() => {});
  return rows.length;
}

/** المالك بيراجع صور التدريب ويمسح اللى مش عايزها — صورة صورة (٢٠٢٦-١١-٢٠). بيرجّع ١ لو اتمسحت. */
async function remove(pool, carId, id, store = r2) {
  const { rows } = await pool.query('DELETE FROM od_shots WHERE car_id = $1 AND id = $2 RETURNING r2_key', [carId, id]);
  for (const r of rows) if (r.r2_key && store) await store.deleteObject(r.r2_key).catch(() => {});
  return rows.length;
}

module.exports = { parse, save, list, jpg, exportZip, clearTest, remove, zip, crc32, isJpeg, MAX_BYTES, MAX_PER_CAR };
