// Clawtask Service Worker
// Cache-first for static assets, network-first for API routes

const CACHE_NAME = 'clawtask-v1';
const STATIC_PATTERNS = [
  /\/_next\/static\//,
  /\/icon-\d+\.png$/,
  /\/manifest\.json$/,
  /\.(?:js|css|woff2?|ttf|eot)$/,
];
const API_PATTERN = /^\/api\//;

self.addEventListener('install', (event) => {
  // Skip waiting so the new SW takes over immediately
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  // Take control of all clients immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname;

  // API routes → network-first
  if (API_PATTERN.test(pathname)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache API responses
          return response;
        })
        .catch(() => {
          // If network fails for API, return a simple offline response
          return new Response(
            JSON.stringify({ ok: false, error: 'Offline' }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        })
    );
    return;
  }

  // Static assets → cache-first
  const isStatic = STATIC_PATTERNS.some((pattern) => pattern.test(pathname));
  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests (HTML pages) → network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
