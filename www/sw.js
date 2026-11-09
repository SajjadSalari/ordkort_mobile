// Offline cache for the web/PWA version (the native apps bundle these files and do not use it).
const CACHE = "ordkort-v1.0.0";
const SHELL = ["./", "index.html", "css/app.css", "manifest.webmanifest", "icons/icon.svg", "icons/icon-180.png",
  "js/main.js", "js/platform.js", "js/core/textutil.js", "js/core/srs.js", "js/core/settings.js", "js/core/library.js",
  "js/core/session.js", "js/core/stats.js", "js/core/store.js", "js/ui/dom.js", "js/ui/common.js", "js/ui/charts.js",
  "js/ui/home.js", "js/ui/study.js", "js/ui/library.js", "js/ui/stats.js", "js/ui/settings.js"];

self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first (so updates arrive), cache as the offline fallback
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))));
});
