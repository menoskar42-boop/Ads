// ذاكرة الطريق على السيرفر (المالك ٢٠٢٦-١١-١٨) — docs/OSCAR_DRIVE_AUDIT_REPORT.md البند C1.
//
// الشاشة بترفع المطبات/الحفر/الرادارات اللى السواق سجّلها (ومسحها كمان) بـuuid، فالدفعة اللى بتتبعت مرتين مابتتكررش، والمسح
// بيبقى deleted_at مش DELETE. ولما يتسطّب التطبيق من جديد: صفحة الموبايل بتطلّع كود «ربط شاشة جديدة»، والشاشة الجديدة
// بتكتبه ⇒ بتاخد نفس العربية (relink) وبتنزّل الذاكرة. مفيش حاجة بتتمسح من العربية القديمة.
'use strict';

const L = require('./logic');

const TYPES = new Set(['bump', 'pothole', 'radar', 'danger']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 500;

const num = (v, lo, hi) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < lo || n > hi ? null : n;
};

/** دفعة من الشاشة ⇒ عناصر سليمة بس (الغلط بيتساب من غير ما يوقّع الدفعة كلها). */
function parseItems(body) {
  const raw = Array.isArray(body && body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const out = [];
  for (const it of raw) {
    if (!it || !UUID_RE.test(String(it.uuid || ''))) continue;
    const type = String(it.type || '');
    const lat = num(it.lat, -90, 90);
    const lng = num(it.lng, -180, 180);
    if (!TYPES.has(type) || lat === null || lng === null) continue;
    const t = num(it.t, 1500000000000, 4102444800000);
    out.push({
      uuid: String(it.uuid).toLowerCase(), type, lat, lng,
      bearing: num(it.bearing, 0, 360), accuracy: num(it.acc, 0, 10000), altitude: num(it.alt, -1000, 10000),
      note: String(it.note || '').slice(0, 200),
      createdAt: new Date(t || Date.now()).toISOString(),
      deleted: it.deleted === true,
    });
  }
  return out;
}

/** بيحفظ الدفعة. نفس الـuuid عند عربية تانية بيتساب (مابنكتبش فوق بيانات حد تانى). */
async function save(pool, carId, items) {
  let saved = 0;
  for (const h of items) {
    const { rowCount } = await pool.query(
      `INSERT INTO od_hazards (car_id, uuid, type, lat, lng, bearing, accuracy, altitude, note, created_at, deleted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $11 THEN now() END)
       ON CONFLICT (uuid) DO UPDATE SET
         deleted_at = CASE WHEN $11 THEN COALESCE(od_hazards.deleted_at, now()) ELSE od_hazards.deleted_at END,
         bearing = COALESCE(EXCLUDED.bearing, od_hazards.bearing),
         accuracy = COALESCE(EXCLUDED.accuracy, od_hazards.accuracy),
         altitude = COALESCE(EXCLUDED.altitude, od_hazards.altitude)
       WHERE od_hazards.car_id = EXCLUDED.car_id`,
      [carId, h.uuid, h.type, h.lat, h.lng, h.bearing, h.accuracy, h.altitude, h.note, h.createdAt, h.deleted]);
    saved += rowCount;
  }
  return saved;
}

/** ذاكرة العربية كلها (من غير الممسوح) — للشاشة اللى اتسطّبت من جديد. */
async function list(pool, carId) {
  const { rows } = await pool.query(
    `SELECT uuid, type, lat, lng, bearing, accuracy, altitude, note, created_at FROM od_hazards
      WHERE car_id = $1 AND deleted_at IS NULL ORDER BY created_at LIMIT 5000`, [carId]);
  return rows.map((r) => ({
    uuid: r.uuid, type: r.type, lat: r.lat, lng: r.lng, bearing: r.bearing, acc: r.accuracy, alt: r.altitude,
    note: r.note, t: new Date(r.created_at).getTime(),
  }));
}

/** صفحة الموبايل: كود لمرة واحدة (١٠ دقايق) يربط شاشة جديدة بنفس العربية. */
async function newRelinkCode(pool, carId) {
  for (let i = 0; i < 5; i++) {
    const code = L.newPairCode();
    try {
      await pool.query(`UPDATE od_cars SET relink_code = $2, relink_expires = now() + interval '10 minutes' WHERE id = $1`, [carId, code]);
      return code;
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  throw new Error('relink code collision');
}

/**
 * الشاشة الجديدة كتبت الكود ⇒ توكنها بيتنقل للعربية القديمة، وكل اللى سجّلته الشاشة الجديدة لحد دلوقتى (مطبات · أماكن · أحداث ·
 * صور · موبايلات) بيتنقل معاها. صف الشاشة الجديدة بيتشال فى الآخر وهو فاضى. الكل فى transaction واحدة.
 */
async function relink(pool, newCar, code) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE od_cars SET relink_code = NULL, relink_expires = NULL
        WHERE relink_code = $1 AND relink_expires > now() RETURNING id, name`, [String(code)]);
    const old = rows[0];
    if (!old) { await client.query('ROLLBACK'); return null; }
    if (old.id !== newCar.id) {
      for (const t of ['od_hazards', 'od_events', 'od_clips', 'od_shots', 'od_owners']) {
        await client.query(`UPDATE ${t} SET car_id = $1 WHERE car_id = $2`, [old.id, newCar.id]);
      }
      await client.query(
        `UPDATE od_points p SET car_id = $1 WHERE car_id = $2
           AND NOT EXISTS (SELECT 1 FROM od_points q WHERE q.car_id = $1 AND q.at = p.at)`, [old.id, newCar.id]);
      await client.query(`UPDATE od_cars SET token_hash = 'relinked-' || id WHERE id = $1`, [newCar.id]);
      await client.query(`UPDATE od_cars SET token_hash = $2, app_version = $3, last_seen = now() WHERE id = $1`,
        [old.id, newCar.token_hash, newCar.app_version]);
      await client.query('DELETE FROM od_cars WHERE id = $1', [newCar.id]);
    }
    await client.query('COMMIT');
    return { carId: old.id, name: old.name };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally { client.release(); }
}

/** الـuuids الممسوحة (عشان الشاشة تمسحها عندها كمان — المزامنة فى الاتجاهين). */
async function deletedUuids(pool, carId) {
  const { rows } = await pool.query(
    `SELECT uuid FROM od_hazards WHERE car_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 5000`, [carId]);
  return rows.map((r) => r.uuid);
}

module.exports = { parseItems, save, list, deletedUuids, newRelinkCode, relink, MAX_ITEMS };
