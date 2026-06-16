const CACHE_NAME = 'zatpat-v19';
const STATIC_URLS = [
  './',
  './index.html',
  './admin.html',
  './guide-en.html',
  './guide-mr.html',
  './css/style.css',
  './js/firebase-config.js',
  './js/creds.js',
  './js/select.js',
  './js/store.js',
  './js/auth.js',
  './js/locations.js',
  './js/products.js',
  './js/inventory.js',
  './js/orders.js',
  './js/shop.js',
  './js/pos.js',
  './js/khata.js',
  './js/reports.js',
  './js/dashboard.js',
  './js/export.js',
  './js/parties.js',
  './js/team.js',
  './js/field-orders.js',
  './js/onboarding.js',
  './js/admin.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.url.startsWith(self.location.origin) && e.request.method === 'GET') {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((res) => {
        const clone = res.clone();
        if (res.ok && (e.request.destination === 'document' || e.request.destination === 'script' || e.request.destination === 'style'))
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return res;
      }))
    );
  }
});
