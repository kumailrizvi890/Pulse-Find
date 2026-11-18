/* Pulse Find service worker: cache static assets only, never app data.
 *
 * Cache-first: versioned JS/CSS chunks (/_next/static/), the PWA icons,
 * the manifest, the favicon and the open-graph image. Those URLs are
 * content-hashed or change rarely, so serving them from cache is safe.
 * Everything else — pages, /api/*, and any cross-origin request
 * (Supabase included) — goes straight to the network and is never
 * cached, so sign-in, tracker data and the demo can never go stale.
 * There is no offline page fallback on purpose: a stale tracker is
 * worse than a network error, and the error panels already have a
 * "Try again" button.
 */

const CACHE = "pulse-find-static-v1";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/favicon.ico",
];
const STATIC_PREFIXES = ["/_next/static/", "/icons/"];
const STATIC_FILES = ["/manifest.webmanifest", "/favicon.ico", "/og-image.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never touch other origins (Supabase, fonts, everything remote).
  if (url.origin !== self.location.origin) return;
  // API traffic always goes to the network, uncached.
  if (url.pathname.startsWith("/api/")) return;
  const isStatic =
    STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) ||
    STATIC_FILES.includes(url.pathname);
  // Pages and anything not listed above: network only, never cached.
  if (!isStatic) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    }),
  );
});
