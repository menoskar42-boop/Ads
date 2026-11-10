// EGX Swing: إشعارات الترشيحات. فى أندرويد بيظهر زرار «نعم» و«لا» فى الإشعار نفسه، وفى الآيفون الضغط بيفتح صفحة الترشيح.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'EGX Swing', body: e.data ? e.data.text() : '' }; }
  var opts = {
    body: d.body || '', dir: 'rtl', lang: 'ar', tag: d.rec_id || 'egx', renotify: true, requireInteraction: !!d.rec_id,
    data: { url: d.url || '/recs', rec_id: d.rec_id || null, token: d.token || null },
  };
  if (d.rec_id) opts.actions = [{ action: 'yes', title: 'نعم' }, { action: 'no', title: 'لا' }];
  e.waitUntil(self.registration.showNotification(d.title || 'EGX Swing', opts));
});

self.addEventListener('notificationclick', function (e) {
  var data = e.notification.data || {};
  e.notification.close();
  if ((e.action === 'yes' || e.action === 'no') && data.rec_id) {
    e.waitUntil(fetch('/api/recs/' + data.rec_id + '/decide', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yes: e.action === 'yes', token: data.token }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      var msg = j.ok ? (e.action === 'yes' ? 'اتسجّل فى محفظة الديمو' : 'تمام، اترفض') : (j.error || 'ماتسجّلش');
      return self.registration.showNotification('EGX Swing', { body: msg, dir: 'rtl', lang: 'ar', tag: 'egx-result', data: { url: '/rec/' + data.rec_id } });
    }).catch(function () {
      return self.clients.openWindow('/rec/' + data.rec_id);
    }));
    return;
  }
  var url = data.url || '/recs';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ('focus' in list[i]) { list[i].navigate(url); return list[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
