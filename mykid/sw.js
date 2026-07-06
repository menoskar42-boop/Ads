// ===== Service Worker: تخزين مؤقت للعمل دون اتصال =====
const CACHE = "safari-kids-v221";
const ASSETS = [
  "/app",
  "/manifest.webmanifest",
  "/css/main.css",
  "/css/map.css",
  "/css/games.css",
  "/js/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      // نخزّن كل أصول الواجهة مسبقاً (من بيان الخادم) ليعمل التطبيق دون اتصال
      // من أوّل فتح. عند فشل البيان نكتفي بالأساسيات.
      try {
        const res = await fetch("/asset-manifest.json", { cache: "no-store" });
        const data = await res.json();
        const all = [...new Set([...ASSETS, ...(data.assets || [])])];
        await c.addAll(all);
      } catch (_e) {
        await c.addAll(ASSETS).catch(() => {});
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // لا نخزّن طلبات الـ API (نطق/سؤال/نسخ) — يجب أن تذهب للخادم دائماً
  if (new URL(e.request.url).pathname.startsWith("/api/")) return;

  // طلبات التنقّل (صفحات HTML مثل / و /app): الشبكة أولاً حتى تصل
  // النسخة الحديثة دائماً، مع الرجوع للكاش عند انقطاع الاتصال فقط.
  const isNavigation =
    e.request.mode === "navigate" ||
    (e.request.headers.get("accept") || "").includes("text/html");
  if (isNavigation) {
    // الشبكة أولاً، والرجوع لقشرة التطبيق المخزّنة مسبقاً عند انقطاع الاتصال.
    // لا نخزّن صفحات HTML (مثل /explore و/guides) كي لا يتضخّم الكاش بلا داعٍ.
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request).then((c) => c || caches.match("/app"))
      )
    );
    return;
  }

  // بقية الأصول (css/js/صور): الكاش أولاً للسرعة والعمل دون اتصال.
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
            return res;
          })
          .catch(() => cached)
    )
  );
});
