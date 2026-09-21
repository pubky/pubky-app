/// <reference lib="webworker" />

import { NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Cache name used to pass shared files from the service worker to the share page
const SHARE_TARGET_CACHE = 'share-target-files';

/**
 * Handle incoming Web Share Target POST requests.
 *
 * When the OS shares content to this PWA, the browser POSTs multipart/form-data
 * to /share. The service worker intercepts it, extracts text params and files,
 * stores files in the Cache API, and redirects to a GET page that the app can render.
 */
async function handleShareTarget(request: Request): Promise<Response> {
  const formData = await request.formData();

  const title = formData.get('title')?.toString() ?? '';
  const text = formData.get('text')?.toString() ?? '';
  const url = formData.get('url')?.toString() ?? '';

  // Store shared files in cache so the client page can retrieve them
  const files = formData.getAll('media');
  const hasFiles = files.length > 0;

  if (hasFiles) {
    const cache = await caches.open(SHARE_TARGET_CACHE);
    // Clear any previously cached share files
    const existingKeys = await cache.keys();
    for (const key of existingKeys) {
      await cache.delete(key);
    }
    // Store each file with an indexed key
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file instanceof File) {
        const response = new Response(file, {
          headers: {
            'Content-Type': file.type,
            'X-Share-Filename': file.name,
          },
        });
        await cache.put(`/share-target-file/${i}`, response);
      }
    }
  }

  // Build redirect URL with text params as query string
  const params = new URLSearchParams();
  if (title) params.set('title', title);
  if (text) params.set('text', text);
  if (url) params.set('url', url);
  if (hasFiles) params.set('hasFiles', 'true');

  const redirectUrl = `/share${params.toString() ? `?${params.toString()}` : ''}`;
  return Response.redirect(redirectUrl, 303);
}

// Register the share target handler before Serwist to intercept POST to /share
self.addEventListener('fetch', (event: FetchEvent) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.pathname === '/share' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
  }
});

// Precached static page served when a navigation cannot reach the network.
// It is a plain HTML file (not a Next route) so it never boots the app: booting
// offline would run the session restore, which wipes local state on failure.
const OFFLINE_FALLBACK_URL = '/offline.html';

// The previous service worker cached Nexus responses (NetworkFirst + ExpirationPlugin).
// Dexie is the app's only data cache, so its Cache entry and the expiration timestamps
// database are dropped on activation. Remove the database deletion if an ExpirationPlugin
// is ever reintroduced: every instance shares that one database.
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    Promise.all([
      caches.delete('api-cache'),
      new Promise<void>((resolve) => {
        // Best effort: IndexedDB can be unavailable to the worker (blocked site data, some WebViews).
        try {
          const request = indexedDB.deleteDatabase('serwist-expiration');
          request.onsuccess = request.onerror = request.onblocked = () => resolve();
        } catch {
          resolve();
        }
      }),
    ]),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Never activate over live clients on its own: the app shows an "Update available"
  // toast and posts SKIP_WAITING once the user opts in (useServiceWorkerUpdate).
  skipWaiting: false,
  // The first install claims open tabs immediately; updates still wait for consent.
  clientsClaim: true,
  // Consumed by the NetworkOnly navigation route below.
  navigationPreload: true,
  precacheOptions: { cleanupOutdatedCaches: true },
  runtimeCaching: [
    // Same-origin page navigations go straight to the network. `fallbacks` serves the
    // precached offline page only when the fetch itself fails (offline, DNS), never for
    // an HTTP error response. No other runtime caching on purpose: Dexie is the data
    // cache, and homeserver / pkarr / httprelay / nexus / CDN must never be cached here.
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && request.mode === 'navigate' && !url.pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_FALLBACK_URL,
        matcher: ({ request }) => request.mode === 'navigate',
      },
    ],
  },
});

serwist.addEventListeners();
