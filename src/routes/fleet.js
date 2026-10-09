// «مراقب السرعة» للأساطيل — صفحات صاحب الشركة + API تطبيق الأندرويد (src/fleet/schema.js).
//
//   صاحب الشركة:  /fleet (إنشاء حساب / دخول) → /fleet/dashboard (الحد + السواقين + المخالفات)
//   التطبيق:      POST /fleet/api/join · GET /fleet/api/config · POST /fleet/api/violations
//   التحميل:      /fleet/app (لينك الـAPK المباشر)
//
// ⚠️ لحد ما المالك يقول «كويس» (٢٠٢٦-١٠-٠٩): كل الصفحات noindex، من غير إعلانات، ومش فى
// السايت‌ماب ولا llms.txt ولا متلينكة من أى صفحة عامة. الحارس: scripts/check-fleet.js.
'use strict';

const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { BCRYPT_COST } = require('../lib/password_cost');
const { rateLimit, clientIp } = require('../middleware/rateLimit');
const { pool } = require('../fleet/schema');

const router = express.Router();

const LIMIT_MIN = 20;
const LIMIT_MAX = 200;
// حروف من غير اللى بتتلخبط مع بعض (O/0 · I/1/L) — السواق بيكتبه على شاشة العربية
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// الـAPK بيتبنى على GitHub (.github/workflows/speedguard-apk.yml) وبيتنشر كـ release على
// تاج ثابت — نفس طريقة NeuroPilot. pre-release عشان مايبقاش «latest» ويكسر لينك NeuroPilot.
const APK_URL = process.env.SPEEDGUARD_APK_URL
  || 'https://github.com/menoskar42-boop/Ads/releases/download/speedguard-latest/speed-guard.apk';
const DUMMY_HASH = bcrypt.hashSync('oscardevs-no-such-fleet', BCRYPT_COST);

const newCode = () => Array.from(crypto.randomBytes(6), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
const newToken = () => crypto.randomBytes(24).toString('hex');
const cairoDay = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

// كل حاجة هنا خاصة (أداة شركة / API) — مش محتوى: noindex ومن غير إعلانات.
router.use((req, res, next) => {
  res.locals.showAds = false;
  res.set('X-Robots-Tag', 'noindex, nofollow');
  next();
});

const createLimiter = rateLimit({ name: 'fleet-create', windowMs: 60 * 60000, max: 10, keyFn: (req) => clientIp(req) });
const loginByIp = rateLimit({ name: 'fleet-login-ip', windowMs: 10 * 60000, max: 30, keyFn: (req) => clientIp(req) });
const loginByCode = rateLimit({
  name: 'fleet-login-code', windowMs: 10 * 60000, max: 12,
  keyFn: (req) => String((req.body && req.body.code) || '').trim().toUpperCase().slice(0, 12),
});
const apiLimiter = rateLimit({ name: 'fleet-api', windowMs: 60000, max: 120, keyFn: (req) => clientIp(req) });

const requireFleet = (req, res, next) => {
  if (req.session && req.session.fleetId) return next();
  return res.redirect('/fleet');
};

async function fleetOf(id) {
  return (await pool.query('SELECT id, name, join_code, speed_limit FROM fleet_accounts WHERE id = $1', [id])).rows[0] || null;
}

/* ───────────────────────── صاحب الشركة ───────────────────────── */

router.get('/', (req, res) => {
  if (req.session && req.session.fleetId) return res.redirect('/fleet/dashboard');
  res.render('fleet/home', { error: req.query.e || '', noindex: true, layout: false });
});

router.post('/create', createLimiter, async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const password = String(req.body.password || '');
  if (name.length < 2) return res.redirect('/fleet?e=name');
  if (password.length < 6) return res.redirect('/fleet?e=password');
  const hash = await bcrypt.hash(password, BCRYPT_COST);
  // الكود عشوائى — تكرار نادر جداً، فبنعيد المحاولة كام مرة بدل ما نقع
  for (let i = 0; i < 6; i++) {
    try {
      const r = await pool.query(
        'INSERT INTO fleet_accounts (name, join_code, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [name, newCode(), hash]);
      req.session.fleetId = r.rows[0].id;
      return req.session.save(() => res.redirect('/fleet/dashboard?new=1'));
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  return res.redirect('/fleet?e=retry');
});

router.post('/login', loginByIp, loginByCode, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const password = String(req.body.password || '');
  const f = (await pool.query('SELECT id, password_hash FROM fleet_accounts WHERE join_code = $1', [code])).rows[0];
  // نفس الوقت للكود الغلط والكود الصح بكلمة سر غلط — مايتعرفش الكود من التوقيت
  const ok = await bcrypt.compare(password, f ? f.password_hash : DUMMY_HASH);
  if (!f || !ok) return res.redirect('/fleet?e=login');
  req.session.fleetId = f.id;
  return req.session.save(() => res.redirect('/fleet/dashboard'));
});

router.post('/logout', (req, res) => {
  if (req.session) delete req.session.fleetId;
  res.redirect('/fleet');
});

function periodOf(q) {
  const to = isDay(q.to) ? q.to : cairoDay();
  const from = isDay(q.from) ? q.from : cairoDay(new Date(Date.now() - 6 * 86400000));
  return { from, to };
}

// المخالفات فى الفترة (بيوم القاهرة) — للشاشة وللتصدير
async function violationsOf(fleetId, from, to, driverId) {
  const params = [fleetId, from, to];
  let driverCond = '';
  if (driverId) { params.push(driverId); driverCond = `AND v.driver_id = $${params.length}`; }
  return (await pool.query(
    `SELECT v.id, v.driver_id, d.name AS driver_name, v.started_at, v.ended_at, v.max_speed::float AS max_speed,
            v.speed_limit, v.duration_s, v.lat, v.lng
       FROM fleet_violations v JOIN fleet_drivers d ON d.id = v.driver_id
      WHERE v.fleet_id = $1
        AND (v.started_at AT TIME ZONE 'Africa/Cairo')::date BETWEEN $2::date AND $3::date
        ${driverCond}
      ORDER BY v.started_at DESC
      LIMIT 2000`, params)).rows;
}

router.get('/dashboard', requireFleet, async (req, res) => {
  const fleet = await fleetOf(req.session.fleetId);
  if (!fleet) { delete req.session.fleetId; return res.redirect('/fleet'); }
  const { from, to } = periodOf(req.query);
  const driverId = Number(req.query.driver) || null;
  const [drivers, rows] = await Promise.all([
    pool.query(
      `SELECT d.id, d.name, d.active, d.created_at, d.last_seen_at,
              count(v.id)::int AS n, max(v.max_speed)::float AS top, COALESCE(sum(v.duration_s), 0)::int AS secs
         FROM fleet_drivers d
         LEFT JOIN fleet_violations v ON v.driver_id = d.id
              AND (v.started_at AT TIME ZONE 'Africa/Cairo')::date BETWEEN $2::date AND $3::date
        WHERE d.fleet_id = $1
        GROUP BY d.id ORDER BY count(v.id) DESC, d.name`, [fleet.id, from, to]),
    violationsOf(fleet.id, from, to, driverId),
  ]);
  res.render('fleet/dashboard', {
    fleet, drivers: drivers.rows, rows, from, to, driverId,
    isNew: req.query.new === '1', saved: req.query.saved === '1',
    LIMIT_MIN, LIMIT_MAX, noindex: true, layout: false,
  });
});

router.post('/limit', requireFleet, async (req, res) => {
  const v = Math.round(Number(req.body.speed_limit));
  if (!Number.isFinite(v) || v < LIMIT_MIN || v > LIMIT_MAX) return res.redirect('/fleet/dashboard');
  await pool.query('UPDATE fleet_accounts SET speed_limit = $2 WHERE id = $1', [req.session.fleetId, v]);
  res.redirect('/fleet/dashboard?saved=1');
});

// إيقاف/تشغيل جهاز سواق (سابنا الشغل أو الجهاز ضاع) — الإيقاف بيرفض تبليغاته الجاية
router.post('/drivers/:id/toggle', requireFleet, async (req, res) => {
  await pool.query('UPDATE fleet_drivers SET active = NOT active WHERE id = $1 AND fleet_id = $2',
    [Number(req.params.id) || 0, req.session.fleetId]);
  res.redirect('/fleet/dashboard');
});

// تصدير المخالفات (CSV يفتح فى Excel بالعربى — BOM)
router.get('/dashboard.csv', requireFleet, async (req, res) => {
  const { from, to } = periodOf(req.query);
  const rows = await violationsOf(req.session.fleetId, from, to, Number(req.query.driver) || null);
  const fmt = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Cairo', hour12: false });
  const esc = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const lines = [['السواق', 'البداية', 'النهاية', 'أقصى سرعة (كم/س)', 'الحد', 'المدة (ثانية)', 'المكان'].map(esc).join(',')];
  for (const r of rows) {
    const where = r.lat != null ? `https://maps.google.com/?q=${r.lat},${r.lng}` : '';
    lines.push([r.driver_name, fmt(r.started_at), fmt(r.ended_at), r.max_speed, r.speed_limit, r.duration_s, where].map(esc).join(','));
  }
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="speed-violations-${from}_${to}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
});

// صفحة التحميل — لينك مباشر للـAPK (لسه تجربة)
router.get('/app', (req, res) => {
  res.render('fleet/app', { notReady: req.query.e === 'notready', noindex: true, layout: false });
});

// لينكنا الثابت قدّام ملف GitHub: HEAD الأول — نسخة لسه ماتنشرتش ترجع بشرح مش بصفحة 404 بتاعة GitHub.
router.get('/app/download', async (req, res) => {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 4000);
  try {
    const r = await fetch(APK_URL, { method: 'HEAD', redirect: 'follow', signal: ac.signal });
    if (!r.ok) return res.redirect('/fleet/app?e=notready');
    return res.redirect(302, APK_URL);
  } catch (e) {
    // GitHub بطىء/مش بيرد — نحاول نوديه على الملف مباشرة بدل ما نقفل الطريق
    return res.redirect(302, APK_URL);
  } finally {
    clearTimeout(timer);
  }
});

/* ───────────────────────── API التطبيق ───────────────────────── */

const bearer = (req) => {
  const m = /^Bearer\s+([a-f0-9]{48})$/i.exec(String(req.headers.authorization || ''));
  return m ? m[1].toLowerCase() : '';
};

async function driverOf(req) {
  const t = bearer(req);
  if (!t) return null;
  return (await pool.query(
    `SELECT d.id, d.name, d.active, d.fleet_id, f.name AS fleet_name, f.speed_limit
       FROM fleet_drivers d JOIN fleet_accounts f ON f.id = d.fleet_id WHERE d.token = $1`, [t])).rows[0] || null;
}

router.post('/api/join', apiLimiter, async (req, res) => {
  const b = req.body || {};
  const code = String(b.code || '').trim().toUpperCase();
  const name = String(b.name || '').trim().slice(0, 60);
  const deviceId = String(b.deviceId || '').trim().slice(0, 80);
  if (!code || name.length < 2 || deviceId.length < 8) return res.status(400).json({ ok: false, error: 'بيانات ناقصة: الكود واسم السواق' });
  const f = (await pool.query('SELECT id, name, speed_limit FROM fleet_accounts WHERE join_code = $1', [code])).rows[0];
  if (!f) return res.status(404).json({ ok: false, error: 'الكود ده مش موجود — اتأكد منه من صاحب الشركة' });
  // نفس الجهاز بيرجع بنفس التوكن (إعادة تثبيت/تغيير الاسم)، وجهاز موقوف بيرجع شغّال بانضمام جديد
  const r = await pool.query(
    `INSERT INTO fleet_drivers (fleet_id, name, device_id, token) VALUES ($1, $2, $3, $4)
     ON CONFLICT (fleet_id, device_id) DO UPDATE SET name = EXCLUDED.name, active = true, last_seen_at = now()
     RETURNING token`, [f.id, name, deviceId, newToken()]);
  res.json({ ok: true, token: r.rows[0].token, fleetName: f.name, speedLimit: f.speed_limit });
});

router.get('/api/config', apiLimiter, async (req, res) => {
  const d = await driverOf(req);
  if (!d) return res.status(401).json({ ok: false, error: 'الجهاز مش منضم لأسطول' });
  await pool.query('UPDATE fleet_drivers SET last_seen_at = now() WHERE id = $1', [d.id]);
  res.json({ ok: true, fleetName: d.fleet_name, driverName: d.name, speedLimit: d.speed_limit, active: d.active });
});

router.post('/api/violations', apiLimiter, async (req, res) => {
  const d = await driverOf(req);
  if (!d) return res.status(401).json({ ok: false, error: 'الجهاز مش منضم لأسطول' });
  if (!d.active) return res.status(403).json({ ok: false, error: 'الجهاز ده موقوف من صاحب الشركة' });
  const items = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, 200) : [];
  let accepted = 0;
  for (const it of items) {
    const uuid = String(it.uuid || '').slice(0, 64);
    const start = new Date(it.startedAt), end = new Date(it.endedAt);
    const max = Number(it.maxSpeed), lim = Math.round(Number(it.speedLimit)), dur = Math.round(Number(it.durationS));
    const lat = Number(it.lat), lng = Number(it.lng);
    // تبليغ مش منطقى بيتشال بهدوء (مابيوقّفش الباقى)
    if (!uuid || isNaN(start) || isNaN(end) || end < start || !(max > 0 && max < 400)
        || !(lim >= LIMIT_MIN && lim <= LIMIT_MAX) || !(dur >= 0 && dur < 86400)
        || start > new Date(Date.now() + 10 * 60000)) continue;
    const hasPos = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng);
    const r = await pool.query(
      `INSERT INTO fleet_violations (fleet_id, driver_id, client_uuid, started_at, ended_at, max_speed, speed_limit, duration_s, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (driver_id, client_uuid) DO NOTHING`,
      [d.fleet_id, d.id, uuid, start, end, Math.round(max * 10) / 10, lim, dur, hasPos ? lat : null, hasPos ? lng : null]);
    accepted += r.rowCount || 0;
  }
  await pool.query('UPDATE fleet_drivers SET last_seen_at = now() WHERE id = $1', [d.id]);
  // received = اللى السيرفر استلمه (حتى المكرر) — التطبيق بيمسحه من الطابور
  res.json({ ok: true, accepted, received: items.length, speedLimit: d.speed_limit });
});

module.exports = router;
