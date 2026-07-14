/* NeuroPilot service worker.
   Purpose: enable real system notifications inside an installed (home-screen)
   PWA — iOS standalone PWAs can only show notifications via a service worker
   registration, not the `new Notification()` constructor. Also clears stale
   caches left by the previous NeuroPilot deployment so old home-screen icons
   refresh to the new app. Deliberately does NOT cache fetches (pass-through),
   so the always-online app never serves a stale shell. */

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      // Remove any caches from the old Vite/PWA build so the standalone app
      // stops serving a stale shell.
      try {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
      } catch (e) {}
      await self.clients.claim();
    })()
  );
});

// Web Push: server-sent notifications that arrive even when the app/browser is
// fully closed (delivered via the browser's push service). This is what makes
// NeuroPilot reminders reliable — client timers/geolocation die when closed.
self.addEventListener("push", function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  var title = data.title || "NeuroPilot 🧠";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: data.tag || "neuropilot-reminder",
      data: { url: data.url || "/" },
    })
  );
});

// Tapping the arrival notification focuses the open app (or opens it).
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
