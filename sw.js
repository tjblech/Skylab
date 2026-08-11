const CACHE = 'skylab-shell-v15';

const SHELL = [
  './', './index.html', './app.css?v=15', './app.js?v=15', './manifest.webmanifest',
  './assets/card-space.jpg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/iss-obj.png',
  './assets/meteor-obj.png',
  './assets/moon-obj.png',
  './assets/moon-photo.jpg',
  './assets/moon-cutout.png',
  './assets/panel-tonight.jpg',
  './assets/saturn-obj.png',
  './assets/sky-obj.jpg',
  './assets/venus-obj.png',
  './assets/jupiter-obj.png',
  './assets/mars-obj.png',
  './assets/mercury-obj.png',
  './assets/sun-obj.png',
  './assets/eclipse-obj.png',
  './assets/light-pollution-atlas-2025.png'
];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE)
    .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
    .then(() => self.skipWaiting())
));

self.addEventListener('activate', e => e.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;          // never cache live API traffic
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
