/* Competition page: no offline cache, only satisfies the app's SW registration.
   Keeps the single-file build self-contained; avoids a 404 in the console. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
