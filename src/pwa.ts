/**
 * PWA installability (Phase 5.4) — registers the offline-shell service worker
 * in PRODUCTION builds only. The Vite dev server (and its HMR websockets)
 * must never be intercepted by a service worker, so dev is left untouched.
 */
export const registerServiceWorker = (): void => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  // Fire-and-forget: a failed registration must never block app startup.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[pwa] service worker registration failed:', error);
    });
  });
};
