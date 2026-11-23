const CACHE_NAME = "oscar-messenger-shell-v2";
const APP_BASE = "/oscar-messenger/";
const APP_SHELL = `${APP_BASE}`;
const STATIC_ASSET = /\.(?:css|js|png|jpe?g|svg|webp|woff2?|ttf|otf|webmanifest)$/i;

function isApiRequest(url) {
  return (
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/") ||
    url.pathname.includes("/api/") ||
    url.pathname.startsWith("/messenger/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("oscar-messenger-shell-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    !url.pathname.startsWith(APP_BASE) ||
    isApiRequest(url) ||
    url.pathname === `${APP_BASE}sw.js`
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(APP_SHELL)) || Response.error();
      }),
    );
    return;
  }

  if (!STATIC_ASSET.test(url.pathname)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && !response.headers.get("content-type")?.includes("json")) {
        await cache.put(request, response.clone());
      }
      return response;
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" ? payload.title : "Oscar Messaging";
  const body = typeof payload.body === "string" ? payload.body : "رسالة جديدة";
  const url =
    typeof payload.url === "string" && payload.url.startsWith(APP_BASE)
      ? payload.url
      : APP_BASE;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: typeof payload.tag === "string" ? payload.tag : undefined,
      icon: `${APP_BASE}icons/icon-192.png`,
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl =
    typeof event.notification.data?.url === "string"
      ? event.notification.data.url
      : APP_BASE;
  const target = new URL(requestedUrl, self.location.origin);
  if (target.origin !== self.location.origin || !target.pathname.startsWith(APP_BASE)) {
    target.href = new URL(APP_BASE, self.location.origin).href;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        if (!client.url.startsWith(self.location.origin + APP_BASE)) continue;
        try {
          await client.navigate(target.href);
          await client.focus();
          return;
        } catch {
          // Fall back to opening a new app window if an existing one cannot navigate.
        }
      }
      await self.clients.openWindow(target.href);
    }),
  );
});
