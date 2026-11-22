'use strict';

// ── Web Push ────────────────────────────────────────────────────────────────
//
// اللي بيخلّي سوكرو **يرنّ** بدل ما يستنّى المستخدم يفتح التطبيق. من غيره
// «واتصل بيا بعد ما تعرف» جملة مالهاش تنفيذ — لأن التطبيق مقفول.
//
// ⚠️ **المفاتيح مشتركة مع الموقع الأساسي عن قصد** (`VAPID_*`): نفس المصدر
// نفس الهوية، ومفتاح تاني لنفس النطاق معناه إن الاشتراكات القديمة تبطّل
// تستقبل. لو اتفصلوا يوماً، لازم كل الاشتراكات تتلغي وتتعمل من الأول —
// ودي عملية مش سطر إعداد.
const webpush = require('web-push');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/* الإعداد بيتقرا **وقت النداء** مش وقت التحميل.
 *
 * أول نسخة كانت بتقرا `process.env` مرة واحدة عند تحميل الوحدة. ده بيشتغل
 * في الإنتاج (المتغيّرات موجودة قبل الإقلاع) وبيكسر في مكانين:
 * الفحص اللي بيحقن مفاتيح بعد `require`، وأي تشغيل بيقرا الإعداد متأخّر.
 * والنتيجة الأسوأ إن الفحص بيعدّي أخضر وهو شايف `configured=false` دايماً
 * — يعني بيتفرّج مش بيقيس.
 *
 * `setVapidDetails` بتتنده مرة واحدة لكل مجموعة مفاتيح (مش كل نداء). */
let applied = '';
function keys() {
  const pub = process.env.VAPID_PUBLIC_KEY || '';
  const priv = process.env.VAPID_PRIVATE_KEY || '';
  const subj = process.env.VAPID_SUBJECT || process.env.VAPID_EMAIL || 'mailto:info@oscardevs.com';
  if (!pub || !priv) return null;
  const sig = subj + '|' + pub;
  if (applied !== sig) {
    try { webpush.setVapidDetails(subj, pub, priv); applied = sig; }
    catch (e) { console.error('[sokro/push] VAPID setup failed:', e.message); return null; }
  }
  return { pub, priv, subj };
}
const configured = () => !!keys();
const publicKey = () => (keys() || { pub: '' }).pub;

async function subscribe(userId, sub, userAgent) {
  const ep = String((sub && sub.endpoint) || '').trim();
  const keys = (sub && sub.keys) || {};
  if (!/^https:\/\//.test(ep) || !keys.p256dh || !keys.auth) {
    return { ok: false, error: 'اشتراك غير صالح' };
  }
  /* نفس الجهاز لو اشترك تاني بيرجع بنفس الـendpoint. التحديث أصحّ من صف
   * جديد — ولو الجهاز بقى لمستخدم تاني (حد سجّل دخول على نفس المتصفح)،
   * الملكية بتنتقل بدل ما رن المستخدم الأول يروح لجهاز حد تاني. */
  const row = (await pool.query(
    `INSERT INTO sokro_push_subs (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent
     RETURNING id`,
    [userId, ep, String(keys.p256dh), String(keys.auth), String(userAgent || '').slice(0, 200)]
  )).rows[0];
  return { ok: true, id: row.id };
}

async function unsubscribe(userId, endpoint) {
  const r = await pool.query(
    'DELETE FROM sokro_push_subs WHERE user_id = $1 AND endpoint = $2', [userId, String(endpoint || '')]
  );
  return r.rowCount > 0;
}

async function devices(userId) {
  return (await pool.query(
    'SELECT id, user_agent, created_at, last_ok_at FROM sokro_push_subs WHERE user_id = $1 ORDER BY id DESC',
    [userId]
  )).rows;
}

/* الإرسال لكل أجهزة المستخدم.
 *
 * ── ليه الاشتراك الميّت بيتمسح ─────────────────────────────────────────
 *
 * المتصفح بيلغي الاشتراك من ناحيته من غير ما يقولنا (مسح بيانات، إلغاء
 * تثبيت، إذن اتسحب). الـendpoint ساعتها بيرد **404 أو 410** للأبد.
 * من غير مسح، كل رن بيحاول على أجهزة مافيش — بيبطّئ، وبيخلّي «اتبعت
 * لتلات أجهزة» رقم مالوش معنى.
 *
 * وأي كود تاني (فشل شبكة، ٥٠٠ من الخدمة) **مابيمسحش** — ده عطل مؤقّت،
 * ومسح اشتراك سليم بسببه معناه إن المستخدم يبطّل يستقبل خالص. */
async function sendTo(userId, payload) {
  if (!configured()) return { ok: false, error: 'push not configured', sent: 0 };
  const subs = (await pool.query(
    'SELECT id, endpoint, p256dh, auth FROM sokro_push_subs WHERE user_id = $1', [userId]
  )).rows;
  if (!subs.length) return { ok: true, sent: 0, devices: 0 };
  const body = JSON.stringify(payload || {});
  let sent = 0; const dead = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 60 }
      );
      sent += 1;
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.id);
    }
  }));
  if (dead.length) {
    await pool.query('DELETE FROM sokro_push_subs WHERE id = ANY($1)', [dead]).catch(() => {});
  }
  if (sent) {
    await pool.query(
      'UPDATE sokro_push_subs SET last_ok_at = now() WHERE user_id = $1', [userId]
    ).catch(() => {});
  }
  return { ok: true, sent, devices: subs.length, pruned: dead.length };
}

module.exports = { configured, publicKey, subscribe, unsubscribe, devices, sendTo };
