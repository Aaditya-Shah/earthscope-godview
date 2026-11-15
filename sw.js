/* EARTHSCOPE service worker v3.7.2
 * Runtime responses are never cloned or cached. This avoids body-used clone errors and
 * prevents stale PHP pages from being written to the offline cache during navigation.
 */
'use strict';
const CACHE_PREFIX = 'earthscope-shell-';
const CACHE_NAME = CACHE_PREFIX + '3-7-2';
const PRECACHE = [
  './',
  'docs.php',
  'assets/app.css?v=3.7.2',
  'assets/app.js?v=3.7.2',
  'assets/theme-light.css?v=3.7.2',
  'assets/theme-modes.css?v=3.7.2',
  'assets/playlab.js?v=3.7.2',
  'assets/earthscope-plus.css?v=3.7.2',
  'assets/earthscope-plus.js?v=3.7.2',
  'assets/studio-v3.css?v=3.7.2',
  'assets/studio-v3.js?v=3.7.2',
  'assets/vision-lab.js?v=3.7.2',
  'assets/live-explore.css?v=3.7.2',
  'assets/live-explore.js?v=3.7.2',
  'assets/photo-loading.svg',
  'assets/earthscope-mark.svg',
  'assets/crops/mango.svg',
  'assets/crops/banana.svg',
  'assets/crops/citrus.svg',
  'assets/crops/apple.svg',
  'assets/crops/grapes.svg',
  'assets/crops/pineapple.svg',
  'assets/crops/watermelon.svg',
  'assets/crops/tomato.svg',
  'manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Precache each resource independently so one unavailable CDN/page won't break install.
    await Promise.all(PRECACHE.map(async path => {
      try {
        const request = new Request(new URL(path, self.registration.scope).href, {cache: 'reload'});
        const response = await fetch(request);
        if (response && response.ok && response.type !== 'opaque') {
          // Fresh install-only response: no other fetch handler can have consumed its body.
          await cache.put(request, response);
        }
      } catch (error) {
        // Optional assets may be blocked or unavailable; continue installing.
        console.warn('[EARTHSCOPE SW] precache skipped:', path, error && error.message);
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api.php')) return;

  if (request.mode === 'navigate') {
    // Never clone/cache dynamic navigation responses at runtime. Network errors can fall back
    // to the precached root document if that document was successfully cached at install.
    event.respondWith((async () => {
      try { return await fetch(request, {cache: 'no-store'}); }
      catch (_) {
        const cached = await caches.match(new URL('./', self.registration.scope).href);
        if (cached) return cached;
        return new Response('EARTHSCOPE is offline. Reconnect and reload this page.', {
          status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}
        });
      }
    })());
    return;
  }

  // Cache-first only for same-origin static assets previously populated during install.
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    return fetch(request);
  })());
});

self.addEventListener('message', event => { if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting(); });
