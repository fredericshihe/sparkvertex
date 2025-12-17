const CACHE_NAME = 'spark-app-offline-v3';

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
  console.log('[SW] Installing Service Worker v2');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Only GET
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Handle App Routes (HTML Pages) - Cache Strategy: Network First, falling back to Cache
  // We handle both 'navigate' (browser reload) and normal fetches (cache warmup)
  if (url.pathname.startsWith('/p/') || url.pathname.startsWith('/run/')) {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            // Cache valid responses
            if (response.status === 200) {
              // Create a copy of the response to modify headers
              // We remove the 'Vary' header to prevent cache mismatch issues
              const newHeaders = new Headers(response.headers);
              newHeaders.delete('vary');

              const responseToCache = new Response(response.clone().body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
              });

              const cacheUpdate = caches.open(CACHE_NAME).then(cache => {
                return cache.put(event.request, responseToCache);
              });
              
              // Ensure caching completes
              if (event.waitUntil) {
                event.waitUntil(cacheUpdate);
              }
            }
            return response;
          })
          .catch((err) => {
            console.log('[SW] Network failed for app route, checking cache:', event.request.url);
            
            // Only return cached HTML for navigation requests to avoid mixing data/html
            // But since these routes ARE html, it's generally safe.
            return caches.match(event.request, { ignoreSearch: true }).then(cachedResponse => {
              if (cachedResponse) {
                console.log('[SW] Cache hit for:', event.request.url);
                return cachedResponse;
              }
              console.log('[SW] Cache miss for:', event.request.url);
              return Promise.reject('no-cache');
            });
          })
      );
      return;
  }

  // 2. Cache Static Resources (Next.js, Images, etc.)
  if (
    url.pathname.startsWith('/_next/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/logo.png'
  ) {
     event.respondWith(
       caches.match(event.request).then(cachedResponse => {
         // Stale-while-revalidate strategy for static assets
         const fetchPromise = fetch(event.request).then(networkResponse => {
           if (networkResponse.status === 200) {
             const responseClone = networkResponse.clone();
             caches.open(CACHE_NAME).then(cache => {
               cache.put(event.request, responseClone);
             });
           }
           return networkResponse;
         });
         
         return cachedResponse || fetchPromise;
       })
     );
     return;
  }

  // 3. Cache CDN Resources
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