// OSCARLOCATOR service worker — precache the app shell for offline use.
const CACHE = "oscarlocator-v2";

const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./vendor/react.production.min.js",
  "./vendor/react-dom.production.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never cache live element data — always go to network. Covers the AMSAT host,
  // the public CORS proxy, and any *.workers.dev proxy you deploy.
  const isLiveData =
    url.hostname.endsWith("amsat.org") ||
    url.hostname.endsWith("allorigins.win") ||
    url.hostname.endsWith("workers.dev") ||
    url.search.includes("daily-bulletin.json");

  if (isLiveData) {
    event.respondWith(
      fetch(req).catch(() => new Response("[]", {
        headers: { "Content-Type": "application/json" }
      }))
    );
    return;
  }

  // App shell + same-origin: cache-first, fall back to network and cache it.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) =>
        hit || fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match("./index.html"))
      )
    );
    return;
  }

  // Cross-origin (fonts): stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
