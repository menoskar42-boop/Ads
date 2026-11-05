// إشعارات Oscar Security على موبايل المالك (Web Push) — نفس مفاتيح VAPID بتاعة الموقع (src/lib/push.js).
// من غير المفاتيح: مفيش إشعارات، وكل حاجة تانية شغّالة (الصفحة بتقول كده).
'use strict';

let webpush = null;
let configured = false;
try {
  webpush = require('web-push');
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@oscardevs.com',
      process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    configured = true;
  }
} catch (e) { /* web-push مش متركّب */ }

module.exports = {
  isEnabled: () => configured,
  publicKey: () => process.env.VAPID_PUBLIC_KEY || '',
  // urgency high: التنبيه بيوصل حتى والموبايل فى وضع توفير البطارية
  send: (sub, payload) => webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 6 * 3600, urgency: 'high' }),
};
