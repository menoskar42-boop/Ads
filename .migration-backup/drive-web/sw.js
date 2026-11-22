// Oscar Security — service worker: الإشعارات بس (الصفحة نفسها بتحتاج نت عشان تجيب مكان العربية).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('push', (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) { p = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(p.title || 'Oscar Security', {
    body: p.body || '', tag: p.tag || 'od', renotify: true, icon: '/icon-512.png', badge: '/icon-512.png',
    data: { url: p.url || '/' }, dir: 'rtl', lang: 'ar',
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(url).catch(() => {}); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
