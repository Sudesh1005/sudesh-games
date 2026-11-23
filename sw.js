// Service worker for the installable Games app.
// Pages, scripts and styles: network first (so updates show up straight away), cached copy when offline.
// Libraries from the CDN, fonts and the big character models: cache first (they never change).
const VERSION = 'v3';
const CACHE = 'sudesh-games-' + VERSION;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './pwa.js', './icons/icon-192.png', './icons/icon-512.png',
  './GTA-Game/', './Car-Race/', './Bike-Race/', './Target-Shooter/', './Cricket-Game/', './Carrom-Game/', './Battle-Game/',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('sudesh-games-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const CACHE_FIRST = /^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com)\//;

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(/\.(glb|fbx|jpg|png)$/i.test(url.pathname) ? cacheFirst(req) : networkFirst(req));
  } else if (CACHE_FIRST.test(req.url)) {
    e.respondWith(cacheFirst(req));
  }
  // anything else (e.g. the PeerJS server for online play) goes straight to the network
});
