/**
 * Brük — Service Worker v1.1
 *
 * Cache strategy:
 *   App shell   → cache-first  (APP_CACHE)
 *   AI models   → cache-first  (MODEL_CACHE) — large, never changes once cached
 *   CDN scripts → network-first with cache fallback (APP_CACHE)
 */

const APP_CACHE   = 'bruk-app-v1.6.0';
const MODEL_CACHE = 'bruk-models-v1';

const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/main.js',
  './js/config.js',
  './js/loader.js',
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

// Hosts that serve multi-hundred-MB model weight files
const MODEL_HOSTS = [
  'huggingface.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
];

// CDN JS libraries (Transformers.js, Tesseract, es-module-shims)
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── INSTALL ───────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(APP_CACHE)
      .then(c => c.addAll(PRECACHE).catch(err => console.warn('[SW] Precache miss:', err)))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== APP_CACHE && k !== MODEL_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  if (!url.protocol.startsWith('http')) return;

  // Model weights → aggressive cache (never expire)
  if (MODEL_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    e.respondWith(cacheFirst(req, MODEL_CACHE));
    return;
  }

  // CDN libraries → network-first (update when online, fall back offline)
  if (CDN_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h))) {
    e.respondWith(networkFirst(req, APP_CACHE));
    return;
  }

  // Own origin → cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(req, APP_CACHE));
    return;
  }
});

async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(cacheName);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('Offline — resource not in cache.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

async function networkFirst(req, cacheName) {
  try {
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(cacheName); c.put(req, res.clone()); }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached ?? new Response('Offline — resource not in cache.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

// ── MESSAGES ─────────────────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLEAR_MODELS') {
    caches.delete(MODEL_CACHE).then(() => e.ports?.[0]?.postMessage({ ok: true }));
  }
  if (e.data?.type === 'VERSION') {
    e.ports?.[0]?.postMessage({ version: APP_CACHE });
  }
});
