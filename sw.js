const CACHE = 'survei-lapangan-v18';
const FILES = [
  './',
  './index.html',
  './udara.html',
  './air.html',
  './logo.png',
  './mobile-home.css',
  './mobile-adapter.css',
  './mobile-adapter.js',
  './cloud-sync.css',
  './cloud-sync.js',
  './pwa-install.css',
  './pwa-install.js',
  './ai-assistant.css',
  './ai-assistant.js',
  './manifest.webmanifest',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => {
      return Promise.allSettled(
        FILES.map((url) =>
          fetch(url, { cache: 'reload' })
            .then((res) => {
              if (res.ok) return c.put(url, res);
            })
            .catch(() => {})
        )
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first strategy so mobile updates on GitHub Pages take effect immediately
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});