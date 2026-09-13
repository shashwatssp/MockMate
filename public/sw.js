/* MockMate offline shell (Phase 5.4) — deliberately minimal.
 *
 * Strategy: NETWORK-FIRST for same-origin GET navigations and static assets,
 * falling back to the last cached copy only when the network fails. This can
 * never serve stale content while online — it only makes the student
 * dashboard/last-viewed pages openable on a dead network.
 *
 * Registered ONLY in production builds (src/pwa.ts), so the Vite dev server
 * and HMR are never affected. */

const CACHE = 'mockmate-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase/APIs
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/')) return;

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok && (request.mode === 'navigate' || response.type === 'basic')) {
          const cache = await caches.open(CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Navigations offline with no cache: serve the root shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});
