// Night Sky Finder offline support: keeps the app and its data on the phone so it opens with no signal.
// Bump CACHE on every release (night-sky-v5, v6, ...) so phones pick up the update.
const CACHE = "night-sky-v7";
const PHOTOS = "night-sky-photos"; // photos from Wikimedia, kept for offline use (the newest 120)
const SHELL = ["./", "index.html", "astronomy.browser.min.js", "satellite.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png", "guide.html", "screen-map.png"];
// Older versions of the app (night-sky-2, cache night-sky-v4 and earlier) live on the same github.io address
// and share this cache storage, so only clear out this version's own old caches (v5 and up).
const isMineOld = k => { const m = /^night-sky-v(\d+)$/.exec(k); return m && +m[1] >= 5 && k !== CACHE; };

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(isMineOld).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return; // another version's files: leave them alone
    if (req.mode === "navigate") {
      // try the network first so updates arrive; fall back to the saved copy offline
      e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(url.pathname.endsWith("guide.html") ? "guide.html" : "index.html", copy)); return r; })
        .catch(() => caches.match(url.pathname.endsWith("guide.html") ? "guide.html" : "index.html", { cacheName: CACHE })));
      return;
    }
    e.respondWith(caches.match(req, { cacheName: CACHE }).then(hit => hit || fetch(req).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return r; })));
    return;
  }
  if (url.hostname.endsWith("wikimedia.org") && /\.(jpe?g|png|gif|webp)$/i.test(url.pathname)) {
    e.respondWith(caches.open(PHOTOS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === "opaque") c.put(req, r.clone()).then(() => c.keys()).then(keys => Promise.all(keys.slice(0, Math.max(0, keys.length - 120)).map(k => c.delete(k)))).catch(() => {});
      return r;
    }))));
    return;
  }
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(CACHE).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(r => { c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    })));
  }
  // satellites, weather, planes and Wikipedia lookups go straight to the network; the app keeps its own saved copies
});
