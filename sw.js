/* TeeTales service worker — 15.1 PWA
   Caches the app shell (HTML/CSS/JS/icons) so the site loads instantly on
   repeat visits and partially works offline. Product data, images from
   Google Sheets/Drive, and any other GViz/googleusercontent request is
   NEVER cached here — stock, prices, and photos must always be live. */

const CACHE_NAME = 'teetales-v1';
const PRECACHE_URLS = [
  '/', '/index.html', '/shop.html', '/product.html', '/cart.html',
  '/policy.html', '/custom.html', '/bulk.html', '/order-sent.html', '/404.html',
  '/css/style.css', '/js/main.js', '/manifest.json',
  '/img/icons/icon-192.png', '/img/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {}) // don't block install if one asset 404s
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch live data/images — Sheets, Drive thumbnails, GA4, WhatsApp, fonts CDN
  if (
    url.hostname.includes('docs.google.com') ||
    url.hostname.includes('googleusercontent.com') ||
    url.hostname.includes('google-analytics.com') ||
    url.hostname.includes('googletagmanager.com') ||
    url.hostname.includes('wa.me') ||
    url.origin !== self.location.origin
  ) return;

  // Stale-while-revalidate for the app shell — instant load from cache,
  // silently refreshed in the background for next time.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
