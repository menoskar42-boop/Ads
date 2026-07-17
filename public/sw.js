/* OscarDevs service worker — Web Push for merchants + PWA install/offline for
   tenant storefronts. */

// Take control immediately so install works on first visit.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

// A fetch handler is required for browsers to offer "Add to Home Screen".
// Network pass-through (no page caching → always fresh content); navigations get
// a graceful offline page when the network is down.
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function () {
        return new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
          '<div style="font-family:system-ui,sans-serif;text-align:center;padding:48px 20px;color:#334155">' +
          '<div style="font-size:44px">📶</div><h2>مفيش اتصال بالإنترنت</h2>' +
          '<p style="color:#64748b">تأكّد من الشبكة وحاول تاني.</p></div>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      })
    );
  }
});

self.addEventListener('push', function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* non-JSON payload */ }
  const title = data.title || 'OscarDevs';
  const options = {
    body: data.body || '',
    icon: '/logo.png',
    badge: '/logo.png',
    dir: 'rtl',
    lang: 'ar',
    data: { url: data.url || '/company/dashboard' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/company/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const client of list) {
        if (client.url.indexOf(target) !== -1 && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
