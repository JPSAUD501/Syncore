const CACHE_NAME = "syncore-next-example-v1";
const APP_ASSETS = ["/", "/sw.js", "/sql-wasm.wasm"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key)))
      );
      await self.clients.claim();
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      try {
        const networkResponse = await fetch(event.request);
        if (
          networkResponse.ok &&
          event.request.url.startsWith(self.location.origin)
        ) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return caches.match("/") ?? Response.error();
      }
    })
  );
});
