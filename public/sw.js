// Minimal PWA service worker for GYSM.IO. Deliberately conservative: it
// only precaches the app shell (offline fallback + icons) and otherwise
// gets out of the way with network-first for everything else, so it never
// serves stale HTML/JS for a fast-moving Next.js app or interferes with
// the streaming NDJSON /api/generate response.
const CACHE_NAME = "gysm-shell-v1";
const SHELL_ASSETS = ["/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first, falling back to cache only for the precached shell
  // assets (icons/manifest) when fully offline. Everything else (pages,
  // API routes) always goes to the network -- this app is not meant to
  // work offline, just to be installable.
  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
