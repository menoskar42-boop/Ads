// «🩺 فحص الجهاز» + «وضع المقارنة» (المرحلة ٣ بنود ٣ و٤ — ٢٠٢٦-١١-١٩): الشاشة والموبايل كل واحد بيبعت تقرير فحصه (سطور «اسم: قيمة»)
// وجودة الـGPS فى آخر دقيقة، والسيرفر بيحتفظ بآخر تقرير بس لكل جهاز — وصفحة الموبايل بتعرضهم جنب بعض. مفيش بيانات شخصية: نوع الجهاز
// والنسخ والقدرات بس (الفحص نفسه مابيقراش أرقام ولا حسابات).
'use strict';

const num = (v, lo, hi) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < lo || n > hi ? null : n;
};
const txt = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** { rows: [{l, v}], gps: {fixes, perSec, avgAcc, p90Acc} } ⇒ نضيف أو null. */
function clean(body) {
  const b = body || {};
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 40)
    .map((r) => (r && txt(r.l, 40) ? { l: txt(r.l, 40), v: txt(r.v, 160) } : null)).filter(Boolean);
  const g = b.gps && typeof b.gps === 'object' ? b.gps : {};
  const gps = { fixes: num(g.fixes, 0, 100000), perSec: num(g.perSec, 0, 100), avgAcc: num(g.avgAcc, 0, 100000), p90Acc: num(g.p90Acc, 0, 100000) };
  if (!rows.length && gps.fixes === null) return null;
  return { rows, gps, app: txt(b.app, 30) };
}

async function saveCar(pool, carId, d) { await pool.query('UPDATE od_cars SET diag = $2, diag_at = now() WHERE id = $1', [carId, d]); }
async function saveOwner(pool, ownerId, d) { await pool.query('UPDATE od_owners SET diag = $2, diag_at = now() WHERE id = $1', [ownerId, d]); }

/** الشاشة + الموبايلات المربوطة بنفس العربية (آخر تقرير لكل واحد). */
async function compare(pool, carId, meOwnerId) {
  const [{ rows: [c] }, { rows: phones }] = await Promise.all([
    pool.query('SELECT diag, diag_at, solo FROM od_cars WHERE id = $1', [carId]),
    pool.query('SELECT id, diag, diag_at FROM od_owners WHERE car_id = $1 AND diag IS NOT NULL ORDER BY diag_at DESC LIMIT 5', [carId]),
  ]);
  return {
    car: c && c.diag && !c.solo ? { ...c.diag, at: c.diag_at } : null,
    phones: phones.map((p) => ({ ...p.diag, at: p.diag_at, me: p.id === meOwnerId })),
  };
}

module.exports = { clean, saveCar, saveOwner, compare };
