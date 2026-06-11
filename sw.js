/* Daily Task Manager service worker.
   Navigations are NETWORK-FIRST (new versions land on a normal reopen; cache only as
   offline fallback). Static assets are cache-first with a background refresh. */
const CACHE = "dtm-v7";
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
  // Never intercept the GitHub API, raw gist content, or the PA proxy.
  if (url.hostname === "api.github.com" || url.hostname === "gist.githubusercontent.com" ||
      url.hostname.endsWith(".workers.dev")) return;
  if (e.request.method !== "GET") return;

  if (e.request.mode === "navigate" || e.request.destination === "document") {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => { c.put(e.request, copy); });
        return res;
      }).catch(() =>
        caches.match(e.request).then(m => m || caches.match("./index.html"))
      )
    );
    return;
  }

  // Assets: serve cached immediately, refresh the cache in the background.
  e.respondWith(
    caches.match(e.request).then(cached => {
      const refresh = fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => { c.put(e.request, copy); });
        return res;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
