const CACHE_NAME = 'spark-app-offline-v1';

// CDN Whitelist
const CDN_DOMAINS = [
  'cdn.staticfile.org',
  'cdn.jsdelivr.net',
  'cdn.tailwindcss.com',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Cache App Pages & Next.js Resources
  // - Pages: /p/xxx, /run/xxx
  // - Next.js Static: /_next/static/xxx
  // - Public Assets: /icons/xxx, /logo.png
  if (
    url.pathname.startsWith('/p/') || 
    url.pathname.startsWith('/run/') ||
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.png'
  ) {
     event.respondWith(
       fetch(event.request)
         .then(response => {
           // Cache valid responses
           if (response.status === 200) {
             const responseClone = response.clone();
             caches.open(CACHE_NAME).then(cache => {
               cache.put(event.request, responseClone);
             });
           }
           return response;
         })
         .catch(() => {
           // If offline, try to return cached response
           return caches.match(event.request).then(cachedResponse => {
             if (cachedResponse) return cachedResponse;
             
             // Fallback for HTML pages: return a generic offline page if available
             // or just let it fail if not cached
             return Promise.reject('no-cache');
           });
         })
     );
     return;
  }

  // 2. Cache CDN Resources
  if (CDN_DOMAINS.includes(url.hostname)) {
      event.respondWith(
        caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          
          return fetch(event.request).then(response => {
            if (response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          });
        })
      );
      return;
  }
});