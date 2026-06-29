/**
 * Brük — Service Worker
 * Offline-first caching strategy.
 * App shell: cache-first. AI models: cache-first (large, rarely change).
 * External scripts: network-first with cache fallback.
 */

const APP_CACHE = 'bruk-app-v1.0.0';
const MODEL_CACHE = 'bruk-models-v1';

// App shell files to precache
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/config.js',
  './js/ui.js',
  './js/translation.js',
  './js/speech-input.js',
  './js/speech-output.js',
  './js/camera.js',
  './js/diet.js',
  './js/timer.js',
  './data/diet-keywords.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Hosts that serve AI model weights — cache aggressively
const MODEL_HOSTS = [
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
];

// CDN scripts — network-first
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── INSTALL ───────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Precache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== APP_CACHE && k !== MODEL_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and browser-extension requests
  if (event.request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // AI Model files → cache-first (very large, stable)
  if (MODEL_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(cacheFirst(event.request, MODEL_CACHE));
    return;
  }

  // CDN scripts → network-first with cache fallback
  if (CDN_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(networkFirst(event.request, APP_CACHE));
    return;
  }

  // App shell → cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, APP_CACHE));
    return;
  }

  // Everything else → network only
  event.respondWith(fetch(event.request));
});

// ── STRATEGIES ────────────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline — resource not cached.', {
      status: 503, headers: { 'Content-Type': 'text/plain' },
    });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline — resource not cached.', {
      status: 503, headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// ── MESSAGE HANDLER ───────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_MODEL_CACHE') {
    caches.delete(MODEL_CACHE).then(() => {
      event.ports?.[0]?.postMessage({ success: true });
    });
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ version: APP_CACHE });
  }
});
