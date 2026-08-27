'use strict';

// ── النداء: سوكرو بيرنّلك ────────────────────────────────────────────────────
//
// «شوف أنا ممكن أتعشى إيه النهارده، **واتصل بيا** بعد ما تعرف» — الجملة دي
// من طلب المالك نفسه، ودي الوحدة اللي بتنفّذها.
//
// ── النداء مش إشعار ─────────────────────────────────────────────────────────
//
// الإشعار بيتقري وخلاص. النداء **بيتردّ عليه أو بيتفوّت**، وليه وقت
// بيخلص فيه. الفرق ده مش تسمية: رن على حاجة عدّت من ساعتين أسوأ من إنه
// مايرنّش — المستخدم بيسيب اللي في إيده ويرد على حاجة بايظة.
//
// عشان كده كل نداء ليه `expires_at`، والمنتهي بيتحوّل لإشعار عادي في
// الصندوق بدل ما يفضل «مستني» للأبد.
const { Pool } = require('pg');
const push = require('../push');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// المهلة الافتراضية. أقصر من كده بيضيّع نداء المستخدم كان هيرد عليه،
// وأطول بيخلّي الرن يوصل على حاجة بقت قديمة.
const TTL_SECONDS = 15 * 60;

/* نداء واحد مستني لكل مستخدم.
 *
 * لو مهمتين خلصوا ورا بعض، رنّتين ورا بعض بتبقى إزعاج مش خدمة —
 * والتانية بتلغي الأولى من على الشاشة قبل ما المستخدم يقراها. القديم
 * بيتقفل كـ`superseded` (مش `missed`): ده مش نداء اتفوّت، ده نداء
 * اتبدّل، والتفرقة دي بتخلّي عدّاد «اتفوّت» يفضل صادق.
 */
async function create(userId, { reason, brief, meta = {}, ttlSeconds = TTL_SECONDS }) {
  const text = String(brief || '').trim();
  if (!text) return { ok: false, error: 'brief مطلوب — النداء من غيره بيفتح مكالمة فاضية' };
  await pool.query(
    `UPDATE sokro_rings SET status = 'superseded'
      WHERE user_id = $1 AND status = 'pending'`, [userId]
  );
  const row = (await pool.query(
    `INSERT INTO sokro_rings (user_id, reason, brief, meta, expires_at)
     VALUES ($1,$2,$3,$4::jsonb, now() + ($5 || ' seconds')::interval)
     RETURNING id, reason, brief, meta, status, expires_at, created_at`,
    [userId, String(reason || 'task').slice(0, 40), text.slice(0, 2000),
     JSON.stringify(meta || {}), String(Math.max(60, Math.min(3600, ttlSeconds)))]
  )).rows[0];

  /* الرن بيتبعت **بعد** ما الصف يتكتب.
   *
   * لو اتبعت الأول والكتابة فشلت، المستخدم بيفتح التطبيق على نداء مش
   * موجود — «سوكرو رنّ وملقتش حاجة» بيهدّ الثقة أكتر من إنه مارنّش. */
  const delivered = await push.sendTo(userId, {
    kind: 'ring',
    ringId: row.id,
    title: 'سوكرو بيتصل بيك',
    body: text.slice(0, 120),
    url: '/app?ring=' + row.id,
  }).catch((e) => ({ ok: false, error: e.message, sent: 0 }));

  return { ok: true, ring: row, push: delivered };
}

/* النداء المستني — والمنتهي بيتقفل وقت القراءة مش بمهمة دورية.
 *
 * كرون بيقفل المنتهي كان هيبقى قطعة تانية تتعطّل وتسيب نداءات «مستنية»
 * للأبد. الحالة محسوبة من الوقت، والقراءة هي اللي بتثبّتها. */
async function pending(userId) {
  await pool.query(
    `UPDATE sokro_rings SET status = 'missed'
      WHERE user_id = $1 AND status = 'pending' AND expires_at <= now()`, [userId]
  );
  return (await pool.query(
    `SELECT id, reason, brief, meta, expires_at, created_at
       FROM sokro_rings
      WHERE user_id = $1 AND status = 'pending' AND expires_at > now()
      ORDER BY id DESC LIMIT 1`, [userId]
  )).rows[0] || null;
}

/* الرد على النداء. بيرجّع `brief` عشان المكالمة تبدأ بيه.
 *
 * `answered` حالة نهائية: الرد التاني على نفس النداء بيرجّع `null` مش
 * نفس الـbrief تاني. من غير ده، إعادة تحميل الصفحة بتبدأ المكالمة من
 * الأول والمساعد بيعيد نفس الكلام. */
async function answer(userId, ringId) {
  const row = (await pool.query(
    `UPDATE sokro_rings SET status = 'answered', answered_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'pending' AND expires_at > now()
      RETURNING id, reason, brief, meta`,
    [Number(ringId), userId]
  )).rows[0];
  return row || null;
}

async function decline(userId, ringId) {
  const r = await pool.query(
    `UPDATE sokro_rings SET status = 'declined', answered_at = now()
      WHERE id = $1 AND user_id = $2 AND status = 'pending'`,
    [Number(ringId), userId]
  );
  return r.rowCount > 0;
}

module.exports = { create, pending, answer, decline, TTL_SECONDS };
