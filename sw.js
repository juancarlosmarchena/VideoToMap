// Service worker: red primero, caché como respaldo (funciona sin conexión).
const CACHE = 'videotomap-v1';
const ASSETS = ['./', 'index.html', 'css/styles.css', 'js/app.js', 'js/geometry.js', 'js/sensors.js', 'js/camera.js', 'js/ar.js', 'js/plan.js', 'manifest.webmanifest', 'icons/icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request)));
});
