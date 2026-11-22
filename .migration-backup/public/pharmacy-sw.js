/* Pharmacy offline-POS service worker.
   Registered with scope '/pharmacy/' ONLY, so it never touches the rest of
   oscardevs.com (homepage, blog, AdSense pages…). It caches the POS shell and
   its heavy CDN assets so the point-of-sale keeps loading with no connection;
   the actual inventory + sale queue live in the page's IndexedDB. */
var CACHE = 'oscardevs-pharmacy-pos-v1';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys
      .filter(function (k) { return k.indexOf('oscardevs-pharmacy-pos') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;
  var isPosNav = req.mode === 'navigate' && url.indexOf('/pharmacy/pos') !== -1;
  var isAsset = /cdn\.tailwindcss\.com|html5-qrcode|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url);

  if (isPosNav) {
    // Network-first, fall back to the cached POS shell when offline.
    e.respondWith(
      fetch(req).then(function (resp) {
        var copy = resp.clone();
        caches.open(CACHE).then(function (ch) { ch.put(req, copy); });
        return resp;
      }).catch(function () {
        return caches.match(req).then(function (m) { return m || caches.match('/pharmacy/pos'); });
      })
    );
    return;
  }

  if (isAsset) {
    // Cache-first for the big CDN assets so the POS renders offline.
    e.respondWith(
      caches.match(req).then(function (m) {
        if (m) return m;
        return fetch(req).then(function (resp) {
          var copy = resp.clone();
          caches.open(CACHE).then(function (ch) { ch.put(req, copy); });
          return resp;
        });
      })
    );
    return;
  }
  // Anything else within scope: default network (no respondWith).
});
