// Web Push notifications to merchants' phones/browsers.
//
// Fails *open*: if web-push isn't installed or VAPID keys aren't configured,
// nothing is sent and the calling request proceeds normally.
//
// Configure with these env vars (Replit Secrets):
//   VAPID_PUBLIC_KEY   <generated public key>   (also sent to the browser)
//   VAPID_PRIVATE_KEY  <generated private key>
//   VAPID_SUBJECT      mailto:support@oscardevs.com   (optional)

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
  } else {
    console.warn('[push] VAPID keys not set — push notifications disabled.');
  }
} catch (err) {
  console.warn('[push] web-push not installed — push notifications disabled:', err.message);
}

function isEnabled() { return configured; }
function publicKey() { return process.env.VAPID_PUBLIC_KEY || ''; }

/** Persist (or refresh) a browser push subscription for a company. */
async function saveSubscription(companyId, sub) {
  if (!companyId || !sub || !sub.endpoint || !sub.keys) return false;
  await pool.query(
    `INSERT INTO push_subscriptions (company_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET company_id = EXCLUDED.company_id,
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [companyId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
  return true;
}

async function removeSubscription(endpoint) {
  if (!endpoint) return;
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

/**
 * Send a push to every device subscribed for a company. Dead subscriptions
 * (404/410) are pruned automatically. Never throws.
 *
 * @param {number} companyId
 * @param {{title:string, body:string, url?:string}} payload
 * @param {('message'|'order')} [type] - checked against the company's
 *        notify_messages / notify_orders preference; omit to always send.
 */
async function sendToCompany(companyId, payload, type) {
  if (!configured || !companyId) return;
  // Respect the merchant's per-type preference.
  if (type === 'message' || type === 'order') {
    try {
      /* `on` is a reserved word in PostgreSQL (it is the JOIN keyword), so
       * `SELECT notify_orders AS on` was a syntax error EVERY time. The catch
       * below then failed open and sent anyway — which meant the merchant who
       * turned notifications OFF kept receiving them, and no error ever reached
       * a screen. A setting that silently does the opposite of what it says is
       * worse than a setting that is missing.
       *
       * Quoted, it would work; named something that is not a keyword, it cannot
       * come back. The column name itself is a fixed literal from this file —
       * never user input — so the interpolation is safe.
       */
      const col = type === 'order' ? 'notify_orders' : 'notify_messages';
      const pref = await pool.query(`SELECT ${col} AS enabled FROM companies WHERE id = $1`, [companyId]);
      if (pref.rows.length && pref.rows[0].enabled === false) return;
    } catch (err) {
      // Fail-open on a genuine database problem: a merchant who wants alerts
      // should not lose them because a query hiccupped. But the query above no
      // longer fails by construction, so this stops hiding a permanent bug.
      console.error('[push] pref check failed:', err.message);
    }
  }
  let rows = [];
  try {
    rows = (await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE company_id = $1',
      [companyId]
    )).rows;
  } catch (err) {
    console.error('[push] load subscriptions failed:', err.message);
    return;
  }
  const data = JSON.stringify({
    title: payload.title || 'OscarDevs',
    body: payload.body || '',
    url: payload.url || '/company/dashboard',
  });
  await Promise.all(rows.map(async (r) => {
    const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
    try {
      await webpush.sendNotification(subscription, data);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await removeSubscription(r.endpoint).catch(() => {});
      } else {
        console.error('[push] send failed:', err.statusCode || err.message);
      }
    }
  }));
}

/** Persist a customer's browser subscription tied to one order (tracking). */
async function saveOrderSubscription(orderId, sub) {
  if (!orderId || !sub || !sub.endpoint || !sub.keys) return false;
  await pool.query(
    `INSERT INTO pharmacy_order_subs (order_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET order_id = EXCLUDED.order_id,
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [orderId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
  return true;
}

/** Notify the customer(s) tracking a specific order. Never throws. */
async function sendToOrder(orderId, payload) {
  if (!configured || !orderId) return;
  let rows = [];
  try {
    rows = (await pool.query(
      'SELECT endpoint, p256dh, auth FROM pharmacy_order_subs WHERE order_id = $1', [orderId]
    )).rows;
  } catch (err) { console.error('[push] load order subs failed:', err.message); return; }
  const data = JSON.stringify({
    title: payload.title || 'OscarDevs',
    body: payload.body || '',
    url: payload.url || '/',
  });
  await Promise.all(rows.map(async (r) => {
    const subscription = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
    try {
      await webpush.sendNotification(subscription, data);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM pharmacy_order_subs WHERE endpoint = $1', [r.endpoint]).catch(() => {});
      } else {
        console.error('[push] order send failed:', err.statusCode || err.message);
      }
    }
  }));
}

module.exports = { isEnabled, publicKey, saveSubscription, removeSubscription, sendToCompany, saveOrderSubscription, sendToOrder };
