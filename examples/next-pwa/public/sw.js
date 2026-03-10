const CACHE_NAME = "syncore-planner-v4";
const APP_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/planner-icon.svg",
  "/sql-wasm.wasm",
  "/sw.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.map((key) =>
          key === CACHE_NAME ? Promise.resolve() : caches.delete(key)
        )
      );
      await self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;
  const shouldCache =
    isSameOrigin &&
    (event.request.mode === "navigate" ||
      requestUrl.pathname.startsWith("/_next/static/") ||
      requestUrl.pathname === "/sql-wasm.wasm" ||
      requestUrl.pathname.endsWith(".webmanifest") ||
      requestUrl.pathname.endsWith(".svg"));

  if (!shouldCache) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        if (event.request.mode === "navigate") {
          return caches.match("/") ?? Response.error();
        }

        return Response.error();
      }
    })()
  );
});
