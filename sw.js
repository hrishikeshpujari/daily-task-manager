/* Daily Task Manager service worker — caches the app shell for instant + offline load. */
const CACHE = "dtm-v3";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Never cache the GitHub API or raw gist content — always go to network so sync data is fresh.
  if (url.hostname === "api.github.com" || url.hostname === "gist.githubusercontent.com") return;
  if (e.request.method !== "GET") return;

  // Cache-first for the app shell, with network fallback; navigations fall back to index.html offline.
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
