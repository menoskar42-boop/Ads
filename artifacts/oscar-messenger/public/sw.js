const CACHE_NAME = "oscar-messenger-shell-v1";
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
