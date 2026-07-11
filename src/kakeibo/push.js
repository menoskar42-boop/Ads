// Kakeibo web-push (reminders / budget alerts). Reuses the platform's shared
// VAPID keys. Fails open: if web-push isn't installed or VAPID isn't configured,
// nothing is sent and callers proceed normally.
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let webpush = null, configured = false;
try {
  webpush = require('web-push');
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) { webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@oscardevs.com', pub, priv); configured = true; }
} catch (e) { /* disabled */ }

function isEnabled() { return configured; }
function publicKey() { return process.env.VAPID_PUBLIC_KEY || ''; }

async function saveSub(userId, sub) {
  if (!userId || !sub || !sub.endpoint || !sub.keys) return false;
  await pool.query(
    `INSERT INTO kkb_push_subs (user_id, endpoint, p256dh, auth) VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
  return true;
}
async function removeSub(endpoint) { if (endpoint) await pool.query('DELETE FROM kkb_push_subs WHERE endpoint=$1', [endpoint]); }

// Send to all of a user's devices. Prunes dead subscriptions (404/410).
async function sendToUser(userId, payload) {
  if (!configured || !userId) return 0;
  const subs = (await pool.query('SELECT endpoint, p256dh, auth FROM kkb_push_subs WHERE user_id=$1', [userId])).rows;
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) { await removeSub(s.endpoint).catch(() => {}); }
    }
  }
  return sent;
}

// Best-effort daily reminder: once/day, only in an evening window, to opted-in
// users who haven't logged an expense today. Guarded by last_sent_on so it never
// double-sends. Never throws.
async function dailyReminders() {
  if (!configured) return;
  const hour = new Date().getHours();
  if (hour < 17 || hour > 21) return; // evening window (server local time)
  try {
    const rows = (await pool.query(
      `SELECT DISTINCT s.user_id, COALESCE(p.lang,'ar') AS lang FROM kkb_push_subs s
       LEFT JOIN kkb_profiles p ON p.user_id = s.user_id
       WHERE (s.last_sent_on IS NULL OR s.last_sent_on < CURRENT_DATE)
         AND NOT EXISTS (SELECT 1 FROM kkb_expenses e WHERE e.user_id = s.user_id AND e.spent_on = CURRENT_DATE)
       LIMIT 2000`
    )).rows;
    for (const r of rows) {
      const body = r.lang === 'en' ? "Don't forget to log today's expenses 📝" : 'متنساش تسجّل مصروف النهاردة 📝';
      const n = await sendToUser(r.user_id, { title: 'Kakeibo', body, url: '/add' });
      if (n > 0) await pool.query('UPDATE kkb_push_subs SET last_sent_on = CURRENT_DATE WHERE user_id = $1', [r.user_id]);
    }
  } catch (e) { console.error('[kkb reminders]', e.message); }
}

module.exports = { isEnabled, publicKey, saveSub, removeSub, sendToUser, dailyReminders };
