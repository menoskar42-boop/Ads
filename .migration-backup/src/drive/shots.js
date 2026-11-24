// صور الطريق من Oscar Drive لتدريب موديل المطبات (المالك ٢٠٢٦-١١-١٨). الشاشة بتبعت JPEG + بيانات (المكان · السرعة · المطب والمسافة)،
// وصاحب العربية بينزّلهم zip من drive.oscardevs.com (الإكستنشن بيرفعه على GitHub وكلود بيراجعه قبل التدريب).
'use strict';

const MAX_BYTES = 600 * 1024;
const MAX_PER_CAR = 1500;
const ZIP_MAX_BYTES = 20 * 1024 * 1024;   // GitHub بيقبل لحد ٢٥ ميجا للملف من المتصفح
const REASONS = new Set(['voice', 'button', 'bump_approach']);
const LABELS = ['bump', 'pothole', 'background', 'sign', 'signal', 'other'];
const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected']);
const SIGNAL_STATES = new Set(['red', 'amber', 'green', 'off', 'unknown']);
const ARROWS = new Set(['none', 'left', 'right', 'straight']);

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
  for (const k of ['markM', 'onsetM']) if (typeof meta[k] === 'number' && Number.isFinite(meta[k])) clean[k] = meta[k];
  if (meta.hazard && typeof meta.hazard === 'object') {
    clean.hazard = { type: String(meta.hazard.type || '').slice(0, 20), lat: Number(meta.hazard.lat) || null, lng: Number(meta.hazard.lng) || null };
    if (typeof meta.hazard.id === 'string') clean.hazard.id = meta.hazard.id.slice(0, 40);
    if (typeof meta.hazard.oneway === 'boolean') clean.hazard.oneway = meta.hazard.oneway;
  }
  if (meta.target && typeof meta.target === 'object') {
    clean.target = {};
    if (typeof meta.target.id === 'string') clean.target.id = meta.target.id.slice(0, 40);
    if (typeof meta.target.type === 'string') clean.target.type = meta.target.type.slice(0, 10);
    if (typeof meta.target.category === 'string') clean.target.category = meta.target.category.slice(0, 20);
    if (typeof meta.target.heads === 'number' && Number.isFinite(meta.target.heads)) clean.target.heads = meta.target.heads;
  }
  if (typeof meta.pairOf === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(meta.pairOf)) {
    clean.pairOf = meta.pairOf.toLowerCase();
  }
  if (meta.pairIndex === 0 || meta.pairIndex === 1) clean.pairIndex = meta.pairIndex;
  clean.app = String(meta.app || '').slice(0, 30);
  if (typeof meta.source === 'string') clean.source = meta.source.slice(0, 10);
  if (meta.camera && typeof meta.camera === 'object') {
    const camera = {};
    if (typeof meta.camera.label === 'string') camera.label = meta.camera.label.slice(0, 60);
    for (const k of ['w', 'h']) if (typeof meta.camera[k] === 'number' && Number.isFinite(meta.camera[k])) camera[k] = meta.camera[k];
    clean.camera = camera;
  }
  if (typeof meta.ua === 'string') clean.ua = meta.ua.slice(0, 120);
  return {
    buf, meta: clean, uuid: meta.uuid.toLowerCase(), at,
    reason: REASONS.has(meta.reason) ? meta.reason : 'button',
    hazardType: clean.hazard ? clean.hazard.type : null,
    distanceM: Number.isFinite(clean.distanceM) ? Math.round(clean.distanceM) : null,
    test: meta.test === true,
  };
}

function parseReview(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'بيانات المراجعة غير صحيحة' };
  if (Object.keys(body).some((key) => !['status', 'label', 'boxes'].includes(key))) return { error: 'حقول مراجعة غير معروفة' };
  if (!REVIEW_STATUSES.has(body.status)) return { error: 'حالة المراجعة غير صحيحة' };
  const label = body.label == null ? null : body.label;
  if (label !== null && !LABELS.includes(label)) return { error: 'نوع الصورة غير صحيح' };
  const inputBoxes = body.boxes == null ? [] : body.boxes;
  if (!Array.isArray(inputBoxes) || inputBoxes.length > 20) return { error: 'عدد المربعات غير صحيح' };
  const boxes = [];
  for (const box of inputBoxes) {
    if (!box || typeof box !== 'object' || Array.isArray(box) ||
        Object.keys(box).some((key) => !['x', 'y', 'w', 'h', 'cls', 'state', 'arrow'].includes(key))) {
      return { error: 'بيانات المربع غير صحيحة' };
    }
    const { x, y, w, h, cls } = box;
    if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) ||
        w <= 0.01 || h <= 0.01 || x + w > 1.0001 || y + h > 1.0001 || !LABELS.includes(cls)) {
      return { error: 'إحداثيات أو نوع المربع غير صحيحة' };
    }
    const clean = { x, y, w, h, cls };
    if (box.state !== undefined) {
      if (cls !== 'signal' || !SIGNAL_STATES.has(box.state)) return { error: 'لون الإشارة غير صحيح' };
      clean.state = box.state;
    }
    if (box.arrow !== undefined) {
      if (!ARROWS.has(box.arrow)) return { error: 'اتجاه السهم غير صحيح' };
      clean.arrow = box.arrow;
    }
    boxes.push(clean);
  }
  if (body.status === 'approved') {
    if (!label) return { error: 'اختار نوع الصورة قبل اعتمادها' };
    if (['bump', 'pothole', 'sign', 'signal'].includes(label) && boxes.length === 0) {
      return { error: 'ارسم مربعاً واحداً على الأقل قبل اعتماد الصورة' };
    }
  }
  return { status: body.status, label, boxes };
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
  const { rows: expired } = await pool.query(
    `DELETE FROM od_shots WHERE car_id = $1 AND review_status = 'pending' AND NOT test
       AND at < now() - interval '90 days' RETURNING r2_key`, [carId]);
  for (const r of expired) if (r.r2_key && store) await store.deleteObject(r.r2_key).catch(() => {});
}

/** الصورة نفسها: من R2 لو اتحفظت هناك، وإلا من القاعدة. */
async function bytesOf(row, store = r2) {
  if (row.jpg) return row.jpg;
  if (row.r2_key && store) { const o = await store.getObject(row.r2_key).catch(() => null); return o ? o.body : null; }
  return null;
}

async function list(pool, carId) {
  const { rows } = await pool.query(
    `SELECT id, at, reason, hazard_type, distance_m, bytes, exported_at IS NOT NULL AS exported, test,
            review_status, review_label, review_boxes
       FROM od_shots WHERE car_id = $1 ORDER BY at DESC LIMIT 60`, [carId]);
  const { rows: [c] } = await pool.query(
    `SELECT count(*) FILTER (WHERE NOT test)::int AS total, count(*) FILTER (WHERE exported_at IS NULL AND NOT test)::int AS fresh,
            count(*) FILTER (WHERE reason = 'bump_approach' AND NOT test)::int AS bumps,
            count(*) FILTER (WHERE review_status = 'approved' AND NOT test)::int AS approved,
            count(*) FILTER (WHERE review_status = 'pending' AND NOT test)::int AS pending,
            count(*) FILTER (WHERE test)::int AS test FROM od_shots WHERE car_id = $1`, [carId]);
  return { shots: rows, counts: c };
}

async function review(pool, carId, id, r) {
  const { rows } = await pool.query(
    `UPDATE od_shots SET review_status = $3, review_label = $4, review_boxes = $5, reviewed_at = now()
      WHERE car_id = $1 AND id = $2 AND NOT test RETURNING id`,
    [carId, id, r.status, r.label, JSON.stringify(r.boxes)]);
  return !!rows[0];
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

function jpegSize(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    while (i < buf.length && buf[i] === 0xff) i++;
    if (i >= buf.length) return null;
    const marker = buf[i++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (i + 1 >= buf.length) return null;
    const length = buf.readUInt16BE(i);
    if (length < 2 || i + length > buf.length) return null;
    if (marker === 0xc0 || marker === 0xc2) {
      if (length < 7) return null;
      const height = buf.readUInt16BE(i + 3), width = buf.readUInt16BE(i + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    i += length;
  }
  return null;
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

/** COCO للصور المعتمدة فقط، بدون إحداثيات GPS — الصور ممكن تتشارك للمراجعة خارجياً. */
async function exportCoco(pool, carId, store = r2) {
  const { rows } = await pool.query(
    `SELECT id, uuid, at, reason, hazard_type, distance_m, meta, jpg, r2_key, bytes,
            review_status, review_label, review_boxes
       FROM od_shots WHERE car_id = $1 AND review_status = 'approved' AND NOT test ORDER BY at`, [carId]);
  const approved = rows.filter((row) => row.review_status === 'approved' && !row.test);
  const files = [], images = [], annotations = [];
  let size = 0, annotationId = 1;
  for (const row of approved) {
    if (size + (row.bytes || 0) > ZIP_MAX_BYTES) break;
    const jpg = await bytesOf(row, store);
    if (!jpg) continue;
    const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
    const detectedSize = jpegSize(jpg);
    const width = detectedSize ? detectedSize.width : Number(meta.camera && meta.camera.w);
    const height = detectedSize ? detectedSize.height : Number(meta.camera && meta.camera.h);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) continue;
    const imageId = Number(row.id);
    const fileName = `images/${row.uuid}.jpg`;
    images.push({
      id: imageId, file_name: fileName, width, height, at: row.at, reason: row.reason,
      distance_m: row.distance_m, markM: Number.isFinite(meta.markM) ? meta.markM : null,
      onsetM: Number.isFinite(meta.onsetM) ? meta.onsetM : null,
      hazard: { type: meta.hazard && meta.hazard.type || row.hazard_type || null, oneway: !!(meta.hazard && meta.hazard.oneway) },
      heading: Number.isFinite(meta.heading) ? meta.heading : null,
      kmh: Number.isFinite(meta.kmh) ? meta.kmh : null,
      acc: Number.isFinite(meta.acc) ? meta.acc : null,
    });
    files.push({ name: fileName, data: jpg });
    let boxes = row.review_boxes;
    if (typeof boxes === 'string') { try { boxes = JSON.parse(boxes); } catch (e) { boxes = []; } }
    if (!Array.isArray(boxes)) boxes = [];
    for (const box of boxes) {
      const categoryId = LABELS.indexOf(box.cls) + 1;
      if (categoryId < 1) continue;
      const bbox = [box.x * width, box.y * height, box.w * width, box.h * height];
      const annotation = {
        id: annotationId++, image_id: imageId, category_id: categoryId, bbox,
        area: bbox[2] * bbox[3], iscrowd: 0,
      };
      const attributes = {};
      if (box.state !== undefined) attributes.state = box.state;
      if (box.arrow !== undefined) attributes.arrow = box.arrow;
      if (Object.keys(attributes).length) annotation.attributes = attributes;
      annotations.push(annotation);
    }
    size += jpg.length;
  }
  const coco = {
    info: { description: 'Oscar Drive approved road photos (human-reviewed)', date_created: new Date().toISOString() },
    images, annotations, categories: LABELS.map((name, index) => ({ id: index + 1, name, supercategory: 'road' })),
  };
  files.push({ name: 'annotations.json', data: Buffer.from(JSON.stringify(coco)) });
  return { buf: zip(files), count: images.length, more: rows.length > images.length };
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

module.exports = { parse, parseReview, save, list, review, jpg, exportZip, exportCoco, jpegSize, LABELS, clearTest, remove, zip, crc32, isJpeg, MAX_BYTES, MAX_PER_CAR };
