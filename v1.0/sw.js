/* MotorLab offline cache. Served alongside renderer/index.html. */
const CACHE_NAME = 'motorlab-shell-v5';
const SHELL = [
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-512.png',
  './core/utils.js',
  './core/performance.js',
  './core/materials.js',
  './core/stage.js',
  './core/charts.js',
  './core/experiments.js',
  './core/lab.js',
  './core/workbench.js',
  './machines/transformer.js',
  './machines/dc.js',
  './machines/induction.js',
  './machines/synchronous.js',
  './vendor/three.min.js',
  './vendor/OrbitControls.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
      return response;
    })).catch(() => caches.match('./index.html'))
  );
});
