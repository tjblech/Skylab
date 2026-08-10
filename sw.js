const CACHE = 'skylab-shell-v7-preview';

const SHELL = [
  './', './index.html', './app.css', './app.js', './manifest.webmanifest',
  './assets/icon-192.png', './assets/icon-512.png',
  /* card panel art */
  './assets/card-tonight.png', './assets/card-space.png', './assets/card-event.png',
  './assets/panel-tonight.png', './assets/panel-space.png',
  /* floating objects */
  './assets/saturn-obj.png', './assets/moon-obj.png', './assets/meteor-obj.png',
  './assets/iss-obj.png', './assets/sky-obj.png',
  /* photography */
  './assets/moon-photo.png', './assets/saturn-photo.png',
  './assets/crescent.png', './assets/mark.png', './assets/earth-horizon.png'
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
