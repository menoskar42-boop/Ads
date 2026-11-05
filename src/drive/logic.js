// Oscar Drive + Oscar Security — المنطق الصافى للسيرفر (من غير قاعدة بيانات، متختبر فى test/oscar_drive_logic.test.js).
//
// الفكرة (المالك ٢٠٢٦-١١-٠٥): الشاشة بتسجّل المكان على طول من الـGPS حتى من غير نت، وأول ما أى نت يتوصل
// (هوت سبوت الموبايل · أو نت السارق نفسه) بتبعت كل اللى اتسجّل، وصفحة الويب على موبايل المالك بتعرضه وبتنبّهه.
'use strict';

const crypto = require('crypto');

const ONLINE_MS = 2 * 60 * 1000;            // آخر تواصل من أقل من دقيقتين = «متصلة»
const LOST_AFTER_MS = 3 * 60 * 1000;        // كانت ماشية وسكتت ٣ دقايق = «انقطع الاتصال»
const LOST_WINDOW_MS = 60 * 60 * 1000;      // مابننبّهش على انقطاع أقدم من ساعة (أول تشغيل للسيرفر)
const PAIR_TTL_MS = 10 * 60 * 1000;         // كود الربط صالح ١٠ دقايق ولمرة واحدة
const KEEP_DAYS = 30;                       // سجل الأماكن بيتمسح بعد ٣٠ يوم

const EVENT_KINDS = new Set([
  'started_armed',   // العربية اشتغلت ووضع الحماية شغّال
  'armed_move',      // العربية اتحركت ووضع الحماية شغّال ومحدش كتب الرقم السرى
  'pin_ok',          // الرقم السرى اتكتب صح
  'pin_wrong',       // ٣ مرات رقم غلط
  'armed',           // الحماية اتفعّلت من الشاشة
  'disarmed',        // الحماية اتقفلت من الشاشة
  'clip',            // تسجيل كاميرا جديد
  'camera_error',    // الكاميرا ماسجّلتش
  'power_on',        // الشاشة اشتغلت
]);

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t || '')).digest('hex');
const newPairCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : null));

/** نقطة من الشاشة ⇒ صف نضيف أو null. t = وقت الـGPS بالملّى ثانية. */
function cleanPoint(p, now = Date.now()) {
  if (!p || typeof p !== 'object') return null;
  const t = num(p.t), lat = num(p.lat), lng = num(p.lng);
  if (t == null || lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return null;
  if (t < now - KEEP_DAYS * 86400000 || t > now + 86400000) return null;
  const s = num(p.s), h = num(p.h), a = num(p.a);
  return {
    at: new Date(Math.round(t)), lat, lng,
    speed: s != null && s >= 0 && s < 400 ? s : null,
    heading: h != null && h >= 0 && h < 360 ? h : null,
    acc: a != null && a >= 0 && a < 10000 ? a : null,
  };
}

function cleanEvent(e, now = Date.now()) {
  if (!e || typeof e !== 'object' || !EVENT_KINDS.has(e.kind)) return null;
  const uuid = String(e.uuid || '');
  if (!/^[0-9a-f-]{16,64}$/i.test(uuid)) return null;
  const t = num(e.t);
  if (t == null || t < now - KEEP_DAYS * 86400000 || t > now + 86400000) return null;
  const lat = num(e.lat), lng = num(e.lng);
  const okPos = lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  let detail = e.detail && typeof e.detail === 'object' ? e.detail : {};
  if (JSON.stringify(detail).length > 2000) detail = {};
  return { uuid, kind: e.kind, at: new Date(Math.round(t)), lat: okPos ? lat : null, lng: okPos ? lng : null, detail };
}

function cleanClip(c, now = Date.now()) {
  if (!c || typeof c !== 'object') return null;
  const uuid = String(c.uuid || '');
  if (!/^[0-9a-f-]{16,64}$/i.test(uuid)) return null;
  const t = num(c.t), sec = num(c.sec), bytes = num(c.bytes);
  if (t == null || t > now + 86400000) return null;
  return { uuid, at: new Date(Math.round(t)), seconds: sec != null ? Math.max(0, Math.round(sec)) : null,
    bytes: bytes != null ? Math.max(0, Math.round(bytes)) : null, reason: String(c.reason || '').slice(0, 30) };
}

/** خط سير مخفّف لأقصى عدد نقط — بنحتفظ بالأولى والأخيرة. */
function downsample(points, max = 1500) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

/**
 * تغيير وضع الحماية من الشاشة: بيتطبّق بس لو الشاشة كانت شايفة آخر نسخة (baseVer = armed_ver).
 * لو المالك غيّره من الويب فى النص، تغيير الويب هو اللى بيكسب والشاشة بتاخده فى الرد.
 */
function applyCarArm(car, req) {
  if (!req || typeof req.armed !== 'boolean') return null;
  if (num(req.baseVer) !== car.armed_ver) return null;
  if (req.armed === car.armed) return null;
  return { armed: req.armed, ver: car.armed_ver + 1 };
}

/** إشعار الموبايل لحدث جاى من الشاشة — null = مابيتبعتش إشعار. */
function pushFor(ev, carName = 'عربيتك') {
  const where = ev.lat != null ? ` — ${ev.lat.toFixed(5)}, ${ev.lng.toFixed(5)}` : '';
  switch (ev.kind) {
    case 'armed_move': return { title: '🚨 العربية بتتحرك', body: `${carName} بتتحرك ووضع الحماية شغّال ومحدش كتب الرقم السرى${where}`, urgent: true };
    case 'started_armed': return { title: '⚠️ العربية اشتغلت', body: `${carName} اشتغلت ووضع الحماية شغّال — مستنى الرقم السرى` };
    case 'pin_wrong': return { title: '⚠️ رقم سرى غلط', body: `حد كتب الرقم السرى غلط ٣ مرات فى ${carName}` };
    case 'clip': return { title: '📹 تسجيل جديد', body: `اتسجّل فيديو من كاميرا ${carName}` };
    default: return null;
  }
}

/** العربية كانت ماشية ووقفت تتواصل فجأة (مش اتركنت وطفت عادى) ⇒ تنبيه مرة واحدة. */
function connectionLostDue(car, now = Date.now()) {
  if (!car || !car.last_seen || car.lost_alerted) return false;
  const gap = now - new Date(car.last_seen).getTime();
  return gap >= LOST_AFTER_MS && gap <= LOST_WINDOW_MS && (car.last_speed || 0) >= 10;
}

function isOnline(car, now = Date.now()) {
  return !!(car && car.last_seen && now - new Date(car.last_seen).getTime() < ONLINE_MS);
}

module.exports = {
  ONLINE_MS, LOST_AFTER_MS, PAIR_TTL_MS, KEEP_DAYS, EVENT_KINDS,
  newToken, hashToken, newPairCode, cleanPoint, cleanEvent, cleanClip, downsample, applyCarArm, pushFor,
  connectionLostDue, isOnline,
};
