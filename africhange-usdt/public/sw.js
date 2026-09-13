const CACHE_NAME = 'africhange-v3'; // <-- C'est ce changement qui force la mise à jour sur mobile !
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
      .then(() => self.skipWaiting()) // Force l'activation immédiate
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Supprime TOUS les anciens caches (v1, v2, etc.)
          if (cacheName !== CACHE_NAME) {
            console.log('Suppression ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Prend le contrôle immédiat de tous les onglets
  );
});

self.addEventListener('fetch', event => {
  // Ignore les requêtes des extensions Chrome ou autres origines
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !url.protocol.startsWith('http') || url.origin !== self.location.origin) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        // Renvoie le cache immédiatement, mais met à jour en arrière-plan pour la prochaine fois
        fetch(event.request).then(newResponse => {
          if (newResponse && newResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, newResponse);
            });
          }
        });
        return response;
      }
      
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      });
    })
  );
});
