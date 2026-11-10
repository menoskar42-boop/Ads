// Oscar Security — كل كلام القاعدة. كل دالة بتاخد الـpool عشان الاختبارات تشتغل على قاعدة محلية.
'use strict';

const L = require('./logic');

async function registerCar(pool, appVersion) {
  const token = L.newToken();
  const { rows } = await pool.query(
    'INSERT INTO od_cars (token_hash, app_version) VALUES ($1, $2) RETURNING id', [L.hashToken(token), String(appVersion || '').slice(0, 30)]);
  return { token, carId: rows[0].id };
}

async function carByToken(pool, token) {
  if (!token) return null;
  const { rows } = await pool.query('SELECT * FROM od_cars WHERE token_hash = $1', [L.hashToken(token)]);
  return rows[0] || null;
}

async function ownerByToken(pool, token) {
  if (!token) return null;
  const { rows } = await pool.query(
    `UPDATE od_owners SET last_used = now() WHERE token_hash = $1
     RETURNING id AS owner_id, car_id`, [L.hashToken(token)]);
  return rows[0] || null;
}

/** دفعة من الشاشة: أماكن + أحداث + بيانات تسجيلات + طلب تغيير الحماية. بترجع الحالة والأحداث الجديدة (للإشعارات). */
async function sync(pool, car, body, now = Date.now()) {
  const points = (Array.isArray(body.points) ? body.points : []).slice(0, 2000).map((p) => L.cleanPoint(p, now)).filter(Boolean);
  const events = (Array.isArray(body.events) ? body.events : []).slice(0, 200).map((e) => L.cleanEvent(e, now)).filter(Boolean);
  const clips = (Array.isArray(body.clips) ? body.clips : []).slice(0, 100).map((c) => L.cleanClip(c, now)).filter(Boolean);
  const client = await pool.connect();
  const fresh = [];
  try {
    await client.query('BEGIN');
    if (points.length) {
      await client.query(
        `INSERT INTO od_points (car_id, at, lat, lng, speed, heading, acc)
         SELECT $1::int, * FROM unnest($2::timestamptz[], $3::float8[], $4::float8[], $5::real[], $6::real[], $7::real[])
         ON CONFLICT (car_id, at) DO NOTHING`,
        [car.id, points.map((p) => p.at), points.map((p) => p.lat), points.map((p) => p.lng),
          points.map((p) => p.speed), points.map((p) => p.heading), points.map((p) => p.acc)]);
    }
    for (const e of events) {
      const r = await client.query(
        `INSERT INTO od_events (car_id, uuid, kind, at, lat, lng, detail) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (uuid) DO NOTHING RETURNING id`,
        [car.id, e.uuid, e.kind, e.at, e.lat, e.lng, JSON.stringify(e.detail)]);
      if (r.rows.length) fresh.push(e);
    }
    for (const c of clips) {
      await client.query(
        `INSERT INTO od_clips (car_id, uuid, at, seconds, bytes, reason) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (uuid) DO NOTHING`,
        [car.id, c.uuid, c.at, c.seconds, c.bytes, c.reason]);
    }
    // ملخّص العربية (الركنات · الصيانة · البنزين · الشهور) — بيتكتب فوق اللى قبله (صف واحد لكل عربية)
    const report = L.cleanReport(body.report, now);
    if (report) await client.query('UPDATE od_cars SET report = $2, report_at = now() WHERE id = $1', [car.id, JSON.stringify(report)]);
    // آخر مكان = أحدث نقطة وصلت (مش آخر نقطة فى الدفعة — الدفعات القديمة ممكن توصل متأخر)
    const latest = points.reduce((a, p) => (!a || p.at > a.at ? p : a), null);
    const { rows } = await client.query(
      `UPDATE od_cars SET last_seen = now(), lost_alerted = false,
         app_version = COALESCE($6, app_version),
         last_lat = CASE WHEN $2::timestamptz IS NOT NULL AND (last_fix_at IS NULL OR $2 >= last_fix_at) THEN $3 ELSE last_lat END,
         last_lng = CASE WHEN $2::timestamptz IS NOT NULL AND (last_fix_at IS NULL OR $2 >= last_fix_at) THEN $4 ELSE last_lng END,
         last_speed = CASE WHEN $2::timestamptz IS NOT NULL AND (last_fix_at IS NULL OR $2 >= last_fix_at) THEN $5 ELSE last_speed END,
         last_heading = CASE WHEN $2::timestamptz IS NOT NULL AND (last_fix_at IS NULL OR $2 >= last_fix_at) THEN $7 ELSE last_heading END,
         last_fix_at = CASE WHEN $2::timestamptz IS NOT NULL AND (last_fix_at IS NULL OR $2 >= last_fix_at) THEN $2 ELSE last_fix_at END
       WHERE id = $1 RETURNING *`,
      [car.id, latest ? latest.at : null, latest ? latest.lat : null, latest ? latest.lng : null,
        latest ? latest.speed : null, body.app ? String(body.app).slice(0, 30) : null, latest ? latest.heading : null]);
    let cur = rows[0];
    const change = L.applyCarArm(cur, body.arm);
    if (change) {
      const r2 = await client.query(
        `UPDATE od_cars SET armed = $2, armed_ver = $3, armed_at = now(), armed_by = 'car' WHERE id = $1 AND armed_ver = $4 RETURNING *`,
        [car.id, change.armed, change.ver, cur.armed_ver]);
      if (r2.rows[0]) cur = r2.rows[0];
    }
    await client.query('COMMIT');
    return { car: cur, fresh, counts: { points: points.length, events: events.length, clips: clips.length, report: report ? 1 : 0 } };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** كود ربط جديد (٦ أرقام، ١٠ دقايق، مرة واحدة). */
async function newPairCode(pool, carId) {
  for (let i = 0; i < 5; i++) {
    const code = L.newPairCode();
    try {
      await pool.query(`UPDATE od_cars SET pair_code = $2, pair_expires = now() + interval '10 minutes' WHERE id = $1`, [carId, code]);
      return code;
    } catch (e) { if (e.code !== '23505') throw e; }   // نفس الكود عند عربية تانية — جرّب غيره
  }
  throw new Error('pair code collision');
}

/** الموبايل كتب الكود ⇒ توكن جديد للموبايل ده. الكود بيتلغى فوراً (مرة واحدة). */
async function pairOwner(pool, code) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const { rows } = await pool.query(
    `UPDATE od_cars SET pair_code = NULL, pair_expires = NULL WHERE pair_code = $1 AND pair_expires > now() RETURNING id`, [String(code)]);
  if (!rows[0]) return null;
  const token = L.newToken();
  await pool.query('INSERT INTO od_owners (car_id, token_hash) VALUES ($1, $2)', [rows[0].id, L.hashToken(token)]);
  return { token, carId: rows[0].id };
}

async function state(pool, carId, now = Date.now()) {
  const [c, ev, cl] = await Promise.all([
    pool.query('SELECT * FROM od_cars WHERE id = $1', [carId]),
    pool.query('SELECT kind, at, lat, lng, detail FROM od_events WHERE car_id = $1 ORDER BY at DESC LIMIT 30', [carId]),
    pool.query('SELECT at, seconds, bytes, reason FROM od_clips WHERE car_id = $1 ORDER BY at DESC LIMIT 20', [carId]),
  ]);
  const car = c.rows[0];
  if (!car) return null;
  return {
    name: car.name, armed: car.armed, armedAt: car.armed_at, armedBy: car.armed_by,
    online: L.isOnline(car, now), lastSeen: car.last_seen,
    last: car.last_fix_at ? { lat: car.last_lat, lng: car.last_lng, speed: car.last_speed, heading: car.last_heading, at: car.last_fix_at } : null,
    events: ev.rows, clips: cl.rows, appVersion: car.app_version,
    report: car.report || null, reportAt: car.report_at || null,
  };
}

async function track(pool, carId, hours = 24) {
  const h = Math.min(Math.max(Number(hours) || 24, 1), 24 * 30);
  const { rows } = await pool.query(
    `SELECT EXTRACT(EPOCH FROM at) * 1000 AS t, lat, lng, speed FROM od_points
     WHERE car_id = $1 AND at > now() - make_interval(hours => $2) ORDER BY at`, [carId, h]);
  return L.downsample(rows.map((r) => ({ t: Math.round(+r.t), lat: r.lat, lng: r.lng, s: r.speed })));
}

async function setArmed(pool, carId, armed) {
  const { rows } = await pool.query(
    `UPDATE od_cars SET armed = $2, armed_ver = armed_ver + 1, armed_at = now(), armed_by = 'web' WHERE id = $1 RETURNING armed, armed_ver`,
    [carId, !!armed]);
  return rows[0] || null;
}

async function rename(pool, carId, name) {
  const n = String(name || '').trim().slice(0, 40);
  if (!n) return false;
  await pool.query('UPDATE od_cars SET name = $2 WHERE id = $1', [carId, n]);
  return true;
}

async function saveSub(pool, ownerId, sub) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  await pool.query(
    `INSERT INTO od_push_subs (endpoint, owner_id, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET owner_id = EXCLUDED.owner_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [String(sub.endpoint).slice(0, 500), ownerId, String(sub.keys.p256dh).slice(0, 200), String(sub.keys.auth).slice(0, 100)]);
  return true;
}

async function subsForCar(pool, carId) {
  const { rows } = await pool.query(
    'SELECT s.endpoint, s.p256dh, s.auth FROM od_push_subs s JOIN od_owners o ON o.id = s.owner_id WHERE o.car_id = $1', [carId]);
  return rows;
}

async function removeSub(pool, endpoint) {
  await pool.query('DELETE FROM od_push_subs WHERE endpoint = $1', [endpoint]).catch(() => {});
}

async function logoutOwner(pool, ownerId) {
  await pool.query('DELETE FROM od_owners WHERE id = $1', [ownerId]);
}

/** عربيات كانت ماشية وسكتت فجأة — بتتعلّم إنها اتنبّهت فى نفس الجملة (مايتبعتش مرتين لو فيه نسختين من السيرفر). */
async function claimLostCars(pool) {
  const { rows } = await pool.query(
    `UPDATE od_cars SET lost_alerted = true
     WHERE lost_alerted = false AND last_seen IS NOT NULL AND COALESCE(last_speed, 0) >= 10
       AND last_seen < now() - interval '3 minutes' AND last_seen > now() - interval '60 minutes'
     RETURNING id, name, last_lat, last_lng, last_seen`);
  return rows;
}

async function prune(pool) {
  await pool.query(`DELETE FROM od_points WHERE at < now() - interval '${L.KEEP_DAYS} days'`);
  await pool.query(`DELETE FROM od_events WHERE at < now() - interval '180 days'`);
}

module.exports = { registerCar, carByToken, ownerByToken, sync, newPairCode, pairOwner, state, track, setArmed, rename,
  saveSub, subsForCar, removeSub, logoutOwner, claimLostCars, prune };
