// Bump this whenever the offline shell changes so an existing phone does not
// continue to use an earlier UI bundle after a verified deployment.
const CACHE = 'retailos-shell-v12';
const SHELL = ['/', '/index.html', '/app.js', '/offline-store.js', '/styles.css', '/catalog.css', '/returns.css', '/receipt.css', '/receipt-document.css', '/mobile.css', '/scanner.css', '/management.css', '/backoffice.css', '/checkout.css', '/duitnow-qr-tpg-hardware.jpeg'];

self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('retailos-shell-') && key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html'))));
});
