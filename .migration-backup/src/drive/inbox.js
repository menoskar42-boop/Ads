// «📲 ابعت للشاشة» (المالك ٢٠٢٦-١١-١٨: «أى حاجة فى التطبيق اعملها فى الويب»): من صفحة الموبايل تحفظ مكان، أو مهمة/ملاحظة/تذكير،
// أو تفويلة — والشاشة بتسحبهم مع مزامنة المطبات (أو أول ما تسأل عن الموبايلات) وبتضيفهم لقاعدتها هى. الحاجات دى متخزّنة على الشاشة
// بس، فالسيرفر صندوق بريد: بعد ما الشاشة تستلم، النص بيتمسح (بيفضل النوع وعنوان قصير ٤٠ حرف للقايمة)، واللى اتسلّم بيتمسح بعد ٧ أيام.
'use strict';

const KINDS = new Set(['place', 'task', 'note', 'remind', 'fill']);
const MAX_PENDING = 200;
const GRADES = new Set(['80', '92', '95']);
const pendingFlag = new Map();   // carId -> true: الشاشة تعرف من سؤال الموبايلات (كل ١٥ ث) إن فيه حاجة — من غير استعلام قاعدة

const num = (v, lo, hi) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < lo || n > hi ? null : n;
};
const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** طلب الموبايل ⇒ { uuid, kind, payload, label } أو { error }. */
function parse(body, now = Date.now()) {
  const b = body || {};
  if (typeof b.uuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(b.uuid)) return { error: 'bad uuid' };
  if (!KINDS.has(b.kind)) return { error: 'bad kind' };
  const p = b.payload && typeof b.payload === 'object' ? b.payload : {};
  let payload, label;
  if (b.kind === 'place') {
    const name = txt(p.name, 60), lat = num(p.lat, -90, 90), lng = num(p.lng, -180, 180);
    if (!name || lat === null || lng === null) return { error: 'اكتب اسم المكان واسمح بالموقع' };
    payload = { name, lat, lng, acc: num(p.acc, 0, 5000) }; label = '📍 ' + name;
  } else if (b.kind === 'fill') {
    const liters = num(p.liters, 0.5, 200), paid = num(p.paid, 0, 1e5);
    if (liters === null) return { error: 'اكتب عدد اللترات' };
    payload = { liters, paid: paid || 0, full: p.full === true, grade: GRADES.has(String(p.grade)) ? String(p.grade) : null,
      odo: num(p.odo, 0, 5e6), t: num(p.t, 1.6e12, now + 864e5) || now };
    label = '⛽ ' + liters + ' لتر' + (paid ? ' · ' + paid + ' جنيه' : '');
  } else {
    const text = txt(p.text, 300);
    if (!text) return { error: 'اكتب النص' };
    payload = { text };
    if (b.kind === 'remind') {
      const due = num(p.dueMs, now - 60000, now + 400 * 864e5);
      if (due !== null) payload.dueMs = due;
      const place = txt(p.place, 60); if (place) payload.place = place;
    }
    label = { task: '✅ ', note: '📝 ', remind: '🔔 ' }[b.kind] + text;
  }
  return { uuid: b.uuid.toLowerCase(), kind: b.kind, payload, label: label.slice(0, 40) };
}

async function add(pool, carId, it) {
  const { rows: [c] } = await pool.query('SELECT count(*)::int AS n FROM od_inbox WHERE car_id = $1 AND delivered_at IS NULL', [carId]);
  if (c.n >= MAX_PENDING) return { error: 'فيه ' + MAX_PENDING + ' حاجة مستنية الشاشة — شغّلها على نت الأول' };
  await pool.query(
    `INSERT INTO od_inbox (car_id, uuid, kind, payload, label) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (uuid) DO NOTHING`,
    [carId, it.uuid, it.kind, it.payload, it.label]);
  pendingFlag.set(carId, true);
  return { ok: true };
}

/** للموبايل: آخر ٣٠ (وصلت ولا لسه). */
async function recent(pool, carId) {
  await pool.query(`DELETE FROM od_inbox WHERE car_id = $1 AND delivered_at < now() - interval '7 days'`, [carId]);
  const { rows } = await pool.query(
    `SELECT uuid, kind, label, created_at, delivered_at FROM od_inbox WHERE car_id = $1 ORDER BY created_at DESC LIMIT 30`, [carId]);
  return rows;
}

/** للشاشة: بتأكّد اللى استلمته (النص بيتمسح) وبتاخد اللى لسه. */
async function take(pool, carId, ack) {
  const ids = (Array.isArray(ack) ? ack : []).filter((u) => typeof u === 'string' && /^[0-9a-f-]{36}$/i.test(u)).slice(0, 100).map((u) => u.toLowerCase());
  if (ids.length) {
    await pool.query(`UPDATE od_inbox SET delivered_at = now(), payload = '{}'::jsonb
                       WHERE car_id = $1 AND uuid = ANY($2) AND delivered_at IS NULL`, [carId, ids]);
  }
  const { rows } = await pool.query(
    `SELECT uuid, kind, payload, created_at FROM od_inbox WHERE car_id = $1 AND delivered_at IS NULL ORDER BY created_at LIMIT 50`, [carId]);
  if (!rows.length) pendingFlag.delete(carId);
  return rows.map((r) => ({ uuid: r.uuid, kind: r.kind, payload: r.payload, t: new Date(r.created_at).getTime() }));
}

const hasPending = (carId) => pendingFlag.get(carId) === true;

module.exports = { parse, add, recent, take, hasPending, KINDS, MAX_PENDING, _reset: () => pendingFlag.clear() };
