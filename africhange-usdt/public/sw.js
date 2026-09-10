const CACHE_NAME = 'africhange-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/achat-step1.html',
  '/achat-step2.html',
  '/achat-step3.html',
  '/achat-step4.html',
  '/achat-step5.html',
  '/vente-step1.html',
  '/vente-step2.html',
  '/vente-step3.html',
  '/vente-step4.html',
  '/vente-step5.html'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // UNIQUEMENT les requêtes GET de NOTRE propre site (http/https)
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http') || url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) return response;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        return response;
      });
    })
  );
});
