const CACHE_NAME = 'mybible-v2';
const STATIC_CACHE = 'mybible-static-v2';

// App shell resources to pre-cache on install
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// ─── Install: pre-cache app shell ───────────────────────────────────────────
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(function(cache) {
      return cache.addAll(APP_SHELL).catch(function() {
        // Don't fail install if some shell resources are unavailable
      });
    })
  );
});

// ─── Activate: delete old caches ────────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys
          .filter(function(key) { return key !== CACHE_NAME && key !== STATIC_CACHE; })
          .map(function(key) { return caches.delete(key); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// ─── Fetch strategy ─────────────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Skip non-GET and cross-origin requests
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Group config (autoReadingConfig, etc.): network-first, fall back to cache
  if (/^\/api\/groups\/[^/]+$/.test(url.pathname)) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(c) { return c || Response.error(); });
      })
    );
    return;
  }

  // Bible verses & tafsir & single verse: cache-first (static content, never changes)
  if (
    url.pathname.startsWith('/api/verses/') ||
    url.pathname.startsWith('/api/verse/') ||
    url.pathname.startsWith('/api/tafsir/') ||
    url.pathname.startsWith('/api/books') ||
    url.pathname.startsWith('/api/reading-text') ||
    url.pathname.startsWith('/api/emotions') ||
    url.pathname.startsWith('/api/topics')
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(function(cache) {
        return cache.match(event.request).then(function(cached) {
          if (cached) return cached;
          return fetch(event.request).then(function(response) {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // Semi-static data: network-first + cache fallback (changes occasionally)
  if (
    url.pathname === '/api/daily-readings' ||
    url.pathname === '/api/metrics/trending' ||
    url.pathname.startsWith('/api/reading-plans') ||
    url.pathname.startsWith('/api/user/highlights')
  ) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function() {
        return caches.match(event.request).then(function(c) { return c || Response.error(); });
      })
    );
    return;
  }

  // All other API calls: network only
  if (url.pathname.startsWith('/api/')) return;

  // Sitemap / robots / llms: network only
  if (url.pathname.endsWith('.xml') || url.pathname === '/robots.txt' || url.pathname === '/llms.txt') return;

  // Static assets (hashed filenames from Vite): cache-first
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/audio/')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var copy = response.clone();
            caches.open(STATIC_CACHE).then(function(cache) { cache.put(event.request, copy); });
          }
          return response;
        });
      })
    );
    return;
  }

  // Icons / images / manifest: cache-first
  if (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname === '/manifest.json'
  ) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response.ok) {
            var copy = response.clone();
            caches.open(STATIC_CACHE).then(function(cache) { cache.put(event.request, copy); });
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation & HTML pages: network-first, fall back to cached shell
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response.ok) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
      }
      return response;
    }).catch(function() {
      return caches.match(event.request).then(function(cached) {
        // Fall back to cached page, or to root index as last resort
        return cached || caches.match('/');
      });
    })
  );
});

// ─── Push notifications ──────────────────────────────────────────────────────
self.addEventListener('push', function(event) {
  // Returning without showing anything (or throwing on a bad payload) makes the
  // browser fall back to its own generic notice — on iOS that renders as just
  // the app name with no verse. Always end up calling showNotification.
  event.waitUntil((async function () {
    var data = null;

    if (event.data) {
      try {
        data = event.data.json();
      } catch (e) {
        try {
          var raw = event.data.text();
          if (raw) data = { body: raw };
        } catch (e2) { /* unreadable payload — handled below */ }
      }
    }

    // Payload missing or unreadable: fetch today's verse so the member still
    // gets the actual content instead of a bare app name.
    if (!data || (!data.title && !data.body)) {
      try {
        var res = await fetch('/api/daily-verse', { cache: 'no-store' });
        var dv = res.ok ? await res.json() : null;
        if (dv && dv.verse && dv.verse.text) {
          var ref = (dv.book && dv.book.name ? dv.book.name + ' ' : '') + dv.verse.chapter + ':' + dv.verse.verse;
          var text = dv.verse.text;
          data = {
            title: 'آية اليوم 📖',
            body: (text.length > 120 ? text.slice(0, 117) + '…' : text) + '\n— ' + ref,
            url: '/',
          };
        }
      } catch (e) { /* offline — fall through to the generic copy */ }
    }

    if (!data) data = { title: 'آية اليوم 📖', body: 'افتح لقراءة آية النهاردة', url: '/' };

    return self.registration.showNotification(data.title || 'الكتاب المقدس رفيقي', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      dir: 'rtl',
      lang: 'ar',
    });
  })());
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === event.notification.data.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
