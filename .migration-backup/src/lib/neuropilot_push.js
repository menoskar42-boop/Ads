// NeuroPilot (ADHD app) Web Push — server-sent daily reminders that arrive even
// when the app/browser is fully closed. NeuroPilot's other reminders (geofence,
// timers) are client-side and die on close; this is the reliable channel.
//
// Anonymous, account-less: one row per subscribed device (endpoint). No PII.
// Requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (see src/lib/push.js). Fails open.

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let webpush = null;
let configured = false;
try {
  webpush = require('web-push');
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@oscardevs.com', pub, priv);
    configured = true;
  }
} catch (err) { /* web-push missing → disabled */ }

function isEnabled() { return configured; }
function publicKey() { return process.env.VAPID_PUBLIC_KEY || ''; }

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS neuropilot_push_subs (
      endpoint   TEXT PRIMARY KEY,
      p256dh     TEXT NOT NULL,
      auth       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS neuropilot_push_state (
      id             INTEGER PRIMARY KEY DEFAULT 1,
      last_sent_date DATE,
      CONSTRAINT neuropilot_push_state_single CHECK (id = 1)
    );
  `);
}

async function saveSub(sub) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return false;
  await pool.query(
    `INSERT INTO neuropilot_push_subs (endpoint, p256dh, auth) VALUES ($1,$2,$3)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [String(sub.endpoint).slice(0, 500), String(sub.keys.p256dh).slice(0, 200), String(sub.keys.auth).slice(0, 100)]
  );
  return true;
}

async function removeSub(endpoint) {
  if (!endpoint) return;
  await pool.query('DELETE FROM neuropilot_push_subs WHERE endpoint = $1', [String(endpoint).slice(0, 500)]).catch(() => {});
}

// ADHD-friendly rotating copy — identical pings habituate fast, so vary them.
const REMINDERS = [
  { title: 'NeuroPilot 🧠', body: 'ابدأ يومك بمهمة واحدة صغيرة — افتح وحدّد أول خطوة بس.' },
  { title: 'خطوة واحدة ✨', body: 'مش لازم تخلّص كله — اعمل حاجة واحدة دلوقتي وهتكمّل لوحدها.' },
  { title: 'فكّرك بمهامك 📌', body: 'عندك مهمة مستنياك؟ افتح NeuroPilot وشوف أهم حاجة النهاردة.' },
  { title: 'ركّز دقيقتين ⏱️', body: 'جرّب تركّز دقيقتين بس على مهمة واحدة — البداية أصعب جزء.' },
  { title: 'صفّي دماغك 🌿', body: 'فرّغ اللي في دماغك في NeuroPilot عشان تركّز أحسن.' },
  { title: 'إنجاز صغير 🎯', body: 'إنجاز صغير النهاردة أحسن من خطة كبيرة بكرة. يلا نبدأ.' },
  { title: 'متأجّلش 🚀', body: 'المهمة اللي بتأجّلها — دلوقتي أحسن وقت لأول خطوة فيها.' },
];

function cairoTodayISO() {
  // Compute "today" in Cairo without relying on the process timezone.
  const now = new Date();
  const cairo = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  return cairo.toISOString().slice(0, 10);
}

function pickReminder() {
  const dayIdx = Math.floor(Date.parse(cairoTodayISO() + 'T00:00:00Z') / 86400000);
  return REMINDERS[((dayIdx % REMINDERS.length) + REMINDERS.length) % REMINDERS.length];
}

/**
 * Send the daily reminder to every subscribed device. De-duplicated by Cairo
 * date so restarts / multiple triggers can't double-send. Prunes dead subs.
 * @param {{force?: boolean}} opts - force bypasses the once-per-day guard (test).
 */
async function sendDaily(opts) {
  const force = !!(opts && opts.force);
  if (!configured) return { ok: false, reason: 'not-configured' };
  const today = cairoTodayISO();
  if (!force) {
    try {
      const st = (await pool.query('SELECT last_sent_date FROM neuropilot_push_state WHERE id = 1')).rows[0];
      if (st && st.last_sent_date) {
        const last = new Date(st.last_sent_date).toISOString().slice(0, 10);
        if (last === today) return { ok: true, skipped: true, reason: 'already-sent-today' };
      }
    } catch (e) { /* fail-open: still attempt */ }
  }
  let rows = [];
  try { rows = (await pool.query('SELECT endpoint, p256dh, auth FROM neuropilot_push_subs')).rows; }
  catch (e) { return { ok: false, reason: 'load-failed: ' + e.message }; }

  const msg = pickReminder();
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: '/', tag: 'neuropilot-daily' });
  let sent = 0, pruned = 0;
  await Promise.all(rows.map(async (r) => {
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { await removeSub(r.endpoint); pruned++; }
    }
  }));
  // Record the send date so we don't re-fire today (even across restarts).
  await pool.query(
    `INSERT INTO neuropilot_push_state (id, last_sent_date) VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET last_sent_date = EXCLUDED.last_sent_date`,
    [today]
  ).catch(() => {});
  return { ok: true, sent, pruned, total: rows.length };
}

module.exports = { isEnabled, publicKey, ensureSchema, saveSub, removeSub, sendDaily };
