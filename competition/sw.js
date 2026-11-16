/* MotorLab competition sub-site — network-first shell cache.
   Bump CACHE_NAME on every release so returning visitors get the new build. */
const CACHE_NAME = 'motorlab-competition-v30-field-overhaul';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME && key.indexOf('motorlab') === 0).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')).then((hit) => hit || new Response('Offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })))
  );
});
