// ذاكرة الطريق على السيرفر (المالك ٢٠٢٦-١١-١٨) — docs/OSCAR_DRIVE_AUDIT_REPORT.md البند C1.
//
// الشاشة بترفع المطبات/الحفر/الرادارات اللى السواق سجّلها (ومسحها كمان) بـuuid، فالدفعة اللى بتتبعت مرتين مابتتكررش، والمسح
// بيبقى deleted_at مش DELETE. ولما يتسطّب التطبيق من جديد: صفحة الموبايل بتطلّع كود «ربط شاشة جديدة»، والشاشة الجديدة
// بتكتبه ⇒ بتاخد نفس العربية (relink) وبتنزّل الذاكرة. مفيش حاجة بتتمسح من العربية القديمة.
'use strict';

const L = require('./logic');

const TYPES = new Set(['bump', 'pothole', 'radar', 'danger', 'sign', 'signal']);
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
    const bearing = num(it.bearing, 0, 360);
    if ((type === 'sign' || type === 'signal') && bearing === null) continue;
    const t = num(it.t, 1500000000000, 4102444800000);
    out.push({
      uuid: String(it.uuid).toLowerCase(), type, lat, lng,
      bearing, accuracy: num(it.acc, 0, 10000), altitude: num(it.alt, -1000, 10000),
      note: String(it.note || '').slice(0, 200),
      createdAt: new Date(t || Date.now()).toISOString(),
      deleted: it.deleted === true,
      test: it.test === true,
      // «اتجاه واحد»: null = الشاشة القديمة مابعتتهوش ⇒ مايتغيّرش اللى على السيرفر
      oneway: type === 'sign' || type === 'signal' ? true : it.oneway === true ? true : it.oneway === false ? false : null,
    });
  }
  return out;
}

/** بيحفظ الدفعة. نفس الـuuid عند عربية تانية بيتساب (مابنكتبش فوق بيانات حد تانى). */
async function save(pool, carId, items) {
  let saved = 0;
  for (const h of items) {
    const { rowCount } = await pool.query(
      `INSERT INTO od_hazards (car_id, uuid, type, lat, lng, bearing, accuracy, altitude, note, created_at, deleted_at, test, oneway)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, CASE WHEN $11 THEN now() END, $12, COALESCE($13::boolean, false))
       ON CONFLICT (uuid) DO UPDATE SET
         oneway = COALESCE($13::boolean, od_hazards.oneway),
         deleted_at = CASE WHEN $11 THEN COALESCE(od_hazards.deleted_at, now()) ELSE od_hazards.deleted_at END,
         bearing = COALESCE(EXCLUDED.bearing, od_hazards.bearing),
         accuracy = COALESCE(EXCLUDED.accuracy, od_hazards.accuracy),
         altitude = COALESCE(EXCLUDED.altitude, od_hazards.altitude)
       WHERE od_hazards.car_id = EXCLUDED.car_id`,
      [carId, h.uuid, h.type, h.lat, h.lng, h.bearing, h.accuracy, h.altitude, h.note, h.createdAt, h.deleted, h.test, h.oneway]);
    saved += rowCount;
  }
  return saved;
}

/** ذاكرة العربية كلها (من غير الممسوح). الشاشة مابتشوفش مطبات التجربة (withTest للموبايل بس). */
async function list(pool, carId, withTest = false, forCar = false) {
  const { rows } = await pool.query(
    `SELECT uuid, type, lat, lng, bearing, accuracy, altitude, note, created_at, test, oneway FROM od_hazards
      WHERE car_id = $1 AND deleted_at IS NULL AND ($2 OR NOT test)
        AND (NOT $3 OR type NOT IN ('sign', 'signal')) ORDER BY created_at LIMIT 5000`, [carId, !!withTest, !!forCar]);
  return rows.map((r) => ({
    uuid: r.uuid, type: r.type, lat: r.lat, lng: r.lng, bearing: r.bearing, acc: r.accuracy, alt: r.altitude,
    note: r.note, t: new Date(r.created_at).getTime(), oneway: !!r.oneway, ...(withTest ? { test: r.test } : {}),
  }));
}

/** «امسح كل مطبات التجربة» (علامة مسح زى أى مطب). */
async function clearTest(pool, carId) {
  const { rowCount } = await pool.query(
    'UPDATE od_hazards SET deleted_at = now() WHERE car_id = $1 AND test AND deleted_at IS NULL', [carId]);
  return rowCount;
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
  return inTx(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE od_cars SET relink_code = NULL, relink_expires = NULL
        WHERE relink_code = $1 AND relink_expires > now() RETURNING id, name`, [String(code)]);
    if (!rows[0]) return null;
    await mergeInto(client, newCar, rows[0].id);
    return { carId: rows[0].id, name: rows[0].name };
  });
}

async function inTx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query(out ? 'COMMIT' : 'ROLLBACK');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally { client.release(); }
}

/** الشاشة الجديدة (newCar) بتبقى العربية القديمة (oldId): بياناتها بتتنقل، وتوكنها بيتحط على الصف القديم، وصفها الفاضى بيتشال. */
async function mergeInto(client, newCar, oldId) {
  if (oldId !== newCar.id) {
    for (const t of ['od_hazards', 'od_events', 'od_clips', 'od_shots', 'od_owners']) {
      await client.query(`UPDATE ${t} SET car_id = $1 WHERE car_id = $2`, [oldId, newCar.id]);
    }
    await client.query(
      `UPDATE od_points p SET car_id = $1 WHERE car_id = $2
         AND NOT EXISTS (SELECT 1 FROM od_points q WHERE q.car_id = $1 AND q.at = p.at)`, [oldId, newCar.id]);
    await client.query(`UPDATE od_cars SET token_hash = 'relinked-' || id WHERE id = $1`, [newCar.id]);
    await client.query(`UPDATE od_cars SET token_hash = $2, app_version = $3, last_seen = now() WHERE id = $1`,
      [oldId, newCar.token_hash, newCar.app_version]);
    await client.query('DELETE FROM od_cars WHERE id = $1', [newCar.id]);
  }
  // شاشة حقيقية اتربطت بعربية الموبايل اللى كان لوحده (QR) ⇒ بقت عربية عادية
  await client.query('UPDATE od_cars SET relinked_at = now(), solo = false WHERE id = $1', [oldId]);
}

/*
 * الربط بـQR (المالك ٢٠٢٦-١١-١٨: «بدل الربط بالكود فقط خليها ايضا QR code اسهل»): كاميرات الشاشة ماتقدرش تمسح كود، فالعكس —
 * الشاشة بتعرض QR فيه رقم ٨ أرقام (١٠ دقايق، مرة واحدة)، والموبايل المربوط بيمسحه ويأكّد ⇒ الشاشة بتبقى نفس العربية.
 * الشاشة بتسأل كل كام ثانية (claimStatus) لحد ما تتربط. ولو الموبايل فتح الرابط فى متصفح مش مربوط (الآيفون: التطبيق المتثبّت
 * ليه تخزين لوحده)، الصفحة بتقوله يكتب الرقم جوه التطبيق.
 */
const newClaimCode = () => String(require('crypto').randomInt(0, 100000000)).padStart(8, '0');

async function newClaim(pool, carId) {
  for (let i = 0; i < 5; i++) {
    const code = newClaimCode();
    try {
      await pool.query(`UPDATE od_cars SET claim_code = $2, claim_expires = now() + interval '10 minutes' WHERE id = $1`, [carId, code]);
      return code;
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  throw new Error('claim code collision');
}

/** الشاشة اتربطت؟ (الصف اللى توكنها عليه اتربط فى آخر ١٥ دقيقة ومفيش طلب ربط مستنى عليه) */
function claimStatus(car) {
  const fresh = car.relinked_at && Date.now() - new Date(car.relinked_at).getTime() < 15 * 60000;
  return { linked: !!fresh && !car.claim_code, name: car.name };
}

/** الموبايل المربوط بعربية (ownerCarId) أكّد رقم الشاشة الجديدة. */
async function claim(pool, ownerCarId, code) {
  if (!/^\d{8}$/.test(String(code || ''))) return null;
  return inTx(pool, async (client) => {
    const { rows } = await client.query(
      `UPDATE od_cars SET claim_code = NULL, claim_expires = NULL
        WHERE claim_code = $1 AND claim_expires > now() RETURNING id, token_hash, app_version`, [String(code)]);
    if (!rows[0]) return null;
    await mergeInto(client, rows[0], ownerCarId);
    const { rows: n } = await client.query('SELECT name FROM od_cars WHERE id = $1', [ownerCarId]);
    return { carId: ownerCarId, name: n[0] && n[0].name };
  });
}

/** الـuuids الممسوحة (عشان الشاشة تمسحها عندها كمان — المزامنة فى الاتجاهين). */
async function deletedUuids(pool, carId) {
  const { rows } = await pool.query(
    `SELECT uuid FROM od_hazards WHERE car_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 5000`, [carId]);
  return rows.map((r) => r.uuid);
}

module.exports = { parseItems, save, list, clearTest, deletedUuids, newRelinkCode, relink, newClaim, claimStatus, claim, MAX_ITEMS };
