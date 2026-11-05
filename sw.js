/* MotorLab 2.0 protected release: no shell caching, no source files. */
self.addEventListener('install', (event) => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
