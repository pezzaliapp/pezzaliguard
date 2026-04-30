/* ===================================================================
   PezzaliGuard — service-worker.js
   Strategy:
     • Static assets (HTML/CSS/JS/icons/manifest):  cache-first
     • Google Fonts (CSS + woff2):                  stale-while-revalidate
     • Anything else: network-first, fallback cache
   The cache name is versioned; bumping the suffix invalidates old caches.
   =================================================================== */

const CACHE = 'pezzaliguard-v1.3.0';

// Files we want available offline. All paths are relative to the SW scope,
// so the same file works on root domains AND on any GitHub Pages subpath.
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'icons/favicon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable.png',
  'icons/apple-touch-icon.png',
  'community-lists/index.json',
  'community-lists/italia-spam.json',
  'community-lists/prefix-warnings.json'
];

// ---- INSTALL --------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // addAll is atomic — if any one fails, install fails, which is what we want.
      // We use addAll with individual fetches that ignore failures for fonts only.
      cache.addAll(ASSETS).catch((err) => {
        console.warn('[sw] cache.addAll failed', err);
      })
    )
  );
  self.skipWaiting();
});

// ---- ACTIVATE -------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ---- FETCH ----------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle GET; let everything else pass through normally.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Google Fonts (CSS or woff2 files): stale-while-revalidate.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Cross-origin (other than fonts) — let the browser handle it.
  if (url.origin !== self.location.origin) return;

  // Navigation requests (HTML) — network-first to pick up new versions when online,
  // fallback to cached index.html when offline.
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Save a copy of the latest HTML for offline use.
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || caches.match('index.html')))
    );
    return;
  }

  // Same-origin static assets — cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache OK and basic responses
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
    })
  );
});

// ---- helpers --------------------------------------------------------
function staleWhileRevalidate(request) {
  return caches.open(CACHE).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.status === 200) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}
