/// <reference lib="webworker" />

import { Serwist, NetworkFirst, ExpirationPlugin, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

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

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // API caching for Nexus
    {
      matcher: ({ url }) => /^https:\/\/nexus\..*\.pubky\.app\/.*$/i.test(url.href),
      handler: new NetworkFirst({
        cacheName: 'api-cache',
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 60 * 5, // 5 minutes
          }),
        ],
      }),
    },
    // Do not use `defaultCache` to prevent other origin services such as pkarr, homeserver and httprelay from being cached
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
