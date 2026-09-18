/* ============================================================
   sw.js — LidaGid service worker (PWA / offline mode)

   Caching strategy
   ────────────────
   • App shell (HTML, CSS, JS, data/*.json, icons) — cache-first.
     All of it is precached on install, so the guide opens instantly
     and fully works with no network.
   • assets/images/* and assets/audio/* — stale-while-revalidate.
     They are heavy and grow with every new object, so they are not
     precached; the cached copy is served immediately and refreshed
     in the background on the next visit.
   • Leaflet from unpkg.com — stale-while-revalidate in its own cache,
     so the library itself survives offline.
   • Everything else cross-origin (OSM tiles, Google Fonts) — untouched.
     KNOWN LIMITATION: with no network the map tiles and the web font are
     simply not available — the map area stays empty. This is deliberate:
     a third-party host must never be able to break the whole SW.

   Deploy checklist
   ────────────────
   Bump VERSION below on every release that changes the app shell or any
   content file. The new cache name makes the SW re-download everything,
   and `activate` deletes every cache that is not part of this version.
   ============================================================ */

const VERSION = 'v26';

const SHELL_CACHE  = `lidagid-shell-${VERSION}`;
const MEDIA_CACHE  = `lidagid-media-${VERSION}`;
const VENDOR_CACHE = `lidagid-vendor-${VERSION}`;

const CURRENT_CACHES = [SHELL_CACHE, MEDIA_CACHE, VENDOR_CACHE];

/* All three languages, so switching the language works offline too. */
const DATA_FILES = [
  './data/sights.json', './data/sights.ru.json', './data/sights.en.json',
  './data/enterprises.json', './data/enterprises.ru.json', './data/enterprises.en.json',
  './data/people.json', './data/people.ru.json', './data/people.en.json',
];

const SHELL_ASSETS = [
  './',
  './index.html',
  './welcome.html',
  './manifest.json',
  './css/normalize.css',
  './css/style.css',
  './js/i18n.js',
  './js/app.js',
  './js/vendor/qrcode.js',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  ...DATA_FILES,
];

const VENDOR_ORIGINS = ['https://unpkg.com'];

/* ── install: precache the shell ── */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    /* Added one by one on purpose: cache.addAll() rejects as a unit, and a
       single missing optional asset must not abort the whole installation. */
    await Promise.all(SHELL_ASSETS.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { /* optional asset — ignore */ }
    }));
    await self.skipWaiting();
  })());
});

/* ── activate: drop caches from previous versions ── */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

/* ── fetch: route by request kind ── */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin !== self.location.origin) {
    if (VENDOR_ORIGINS.some((origin) => url.origin === origin)) {
      event.respondWith(staleWhileRevalidate(req, VENDOR_CACHE));
    }
    /* Other third-party hosts stay network-only (see header). */
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(staleWhileRevalidate(req, MEDIA_CACHE));
    return;
  }

  event.respondWith(cacheFirst(req));
});

/* ── strategies ── */

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch (e) {
    /* Offline and not cached: unknown deep links still get the app shell. */
    if (req.mode === 'navigate') {
      const shell = await caches.match('./index.html');
      if (shell) return shell;
    }
    return offlineResponse();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  /* Range requests (Safari/iOS audio) cannot be stored by the Cache API. */
  if (req.headers.has('range')) return fetch(req);

  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);

  const network = fetch(req)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);

  return cached || (await network) || offlineResponse();
}

function offlineResponse() {
  return new Response('Offline', {
    status: 504,
    statusText: 'Offline',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
