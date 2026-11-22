// الموبايلات كمصادر GPS إضافية للشاشة (المرحلة ٢ — docs/OSCAR_DRIVE_PHASES_2_3.md): صفحة الموبايل المربوط (drive.oscardevs.com)
// بتبعت مكانها طول ما هى مفتوحة و«📡 شارك GPS» شغّال، والشاشة بتسأل. **آخر قراءة بس لكل موبايل، فى الذاكرة، وبتتمسح بعد دقيقتين** —
// مفيش تاريخ ولا جدول. الشاشة هى اللى بتقرّر الموبايل ده فى العربية ولا لأ (logic/Companions.kt).
'use strict';

const TTL_MS = 2 * 60000;
const byCar = new Map();   // carId -> Map(ownerId -> fix)

const num = (v, lo, hi) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < lo || n > hi ? null : n;
};

/** قراءة من الموبايل ⇒ نضيفة أو null. السرعة م/ث والاتجاه بالدرجات (زى Geolocation API). */
function parseFix(body, now = Date.now()) {
  const b = body || {};
  const lat = num(b.lat, -90, 90), lng = num(b.lng, -180, 180), acc = num(b.acc, 0, 5000);
  if (lat === null || lng === null || acc === null) return null;
  let t = num(b.t, 1500000000000, 4102444800000);
  if (t === null || t > now + 5000) t = now;   // ساعة الموبايل غلط ⇒ وقت الاستلام
  return { lat, lng, acc, speed: num(b.speed, 0, 120), heading: num(b.heading, 0, 360), t,
    label: String(b.label || '').replace(/[^\w؀-ۿ .-]/g, '').slice(0, 24) || 'موبايل' };
}

function put(carId, ownerId, fix, now = Date.now()) {
  if (!byCar.has(carId)) byCar.set(carId, new Map());
  byCar.get(carId).set(ownerId, { ...fix, recv: now });
}

/** آخر قراءة لكل موبايل نشط (أحدث من دقيقتين). */
function list(carId, now = Date.now()) {
  const m = byCar.get(carId);
  if (!m) return [];
  const out = [];
  for (const [id, f] of m) {
    if (now - f.recv > TTL_MS) { m.delete(id); continue; }
    out.push({ id, label: f.label, lat: f.lat, lng: f.lng, acc: f.acc, speed: f.speed, heading: f.heading, t: f.t, ageMs: now - f.t });
  }
  if (!m.size) byCar.delete(carId);
  return out;
}

function stop(carId, ownerId) { const m = byCar.get(carId); if (m) m.delete(ownerId); }

module.exports = { parseFix, put, list, stop, TTL_MS, _reset: () => byCar.clear() };
