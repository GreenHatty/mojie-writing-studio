const CACHE_NAME = 'mojie-static-v1';
const CORE_ASSETS = ['/mojie-icon.svg', '/manifest.webmanifest'];

function isPrivateRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') || request.mode === 'navigate' || request.destination === 'document';
}

function isCacheableStatic(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivateRequest(request)) return false;
  return ['script', 'style', 'font', 'image', 'worker'].includes(request.destination) || url.pathname.startsWith('/_next/static/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (isPrivateRequest(request)) {
    event.respondWith(fetch(request));
    return;
  }
  if (!isCacheableStatic(request)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response.ok || response.type === 'opaque') return response;
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      return response;
    }))
  );
});
