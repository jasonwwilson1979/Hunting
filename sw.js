/* HuntMap service worker
   Caches the app shell so the app opens with no signal. Map tiles are cached
   by the page itself (Cache API) so it can report progress and quota errors. */

const VERSION = 'huntmap-shell-v1.7.0';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/util.js',
  './js/geo.js',
  './js/sun.js',
  './js/db.js',
  './js/tiles.js',
  './js/map.js',
  './js/gps.js',
  './js/data.js',
  './js/pdfmap.js',
  './js/sync.js',
  './js/app.js',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  './vendor/pako/pako.min.js',
  './vendor/utif/UTIF.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.all(SHELL.map((url) => cache.add(url).catch(() => null)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('huntmap-shell-') && k !== VERSION)
        .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

function isShellRequest(url) {
  if (url.origin !== self.location.origin) return false;
  // Never intercept the API, the Django admin/upload pages or map downloads.
  if (/^\/(api|admin|upload|media)\//.test(url.pathname)) return false;
  if (url.pathname.indexOf('/vendor/') >= 0) return true;
  return /\.(html|css|js|png|svg|webmanifest|ico)$/.test(url.pathname) ||
    url.pathname.endsWith('/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!isShellRequest(url)) return;      // tiles and other hosts go straight to the network

  // Cache-first with background refresh (stale-while-revalidate).
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => null);

      if (hit) { event.waitUntil(network); return hit; }

      return network.then((res) => {
        if (res) return res;
        if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
          return caches.match('./index.html').then((idx) => idx || Response.error());
        }
        return Response.error();
      });
    })
  );
});
