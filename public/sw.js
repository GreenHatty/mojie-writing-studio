const CACHE_NAME = 'mojie-public-static-v2';
const CORE_ASSETS = ['/mojie-icon.svg?v=2', '/manifest.webmanifest?v=2'];

function isPrivateRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith('/api/') || request.mode === 'navigate' || request.destination === 'document';
}

function isVersionedPublicStatic(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isPrivateRequest(request)) return false;
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname.startsWith('/assets/')) return /-[a-z0-9]{8,}\./iu.test(url.pathname);
  return CORE_ASSETS.includes(`${url.pathname}${url.search}`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => undefined));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'MOJIE_ACTIVATE_UPDATE') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!isVersionedPublicStatic(request)) return;
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (!response.ok || response.type === 'opaque' || response.headers.get('Cache-Control')?.includes('no-store')) return response;
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
      return response;
    }))
  );
});
