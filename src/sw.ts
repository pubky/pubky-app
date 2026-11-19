/// <reference lib="webworker" />

import { NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from 'serwist';
import { SW_CLIENT_ANNOUNCE, SW_TAKEOVER_SKIPPED } from '@/config/pwa';

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
// Plain HTML keeps network-dependent App startup and session restoration out of
// the offline response. Temporary grant restore failures retain the saved session.
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

// Social v1 cut-over (ADR-0021 amendment, docs/pwa.md "Rollout note"), in force until PR-E2 reverts
// it: a page still running the previous build keeps writing the retired `/pub/pubky.app/` tree
// until it reloads, and nothing server-side reaches it. Once this worker activates over an earlier
// one it claims every window and navigates each one that did not announce itself (below) to its
// own URL, the one reload the old bundle cannot decline. A first install (no earlier worker) keeps
// the silent `clientsClaim` behaviour: reloading a first-time visitor mid-onboarding would lose
// their input for nothing. PR-E2 removes the three listeners and restores `skipWaiting: false`
// below; its timing is the team's call (D9: once Nexus shows migrated users' 0.x writes at about
// zero, or after a period the team picks), not the next release.
//
// During `install`, `self.registration.active` is still the worker being replaced; a first
// install has none. The flag lives in the worker instance, which `skipWaiting` activates right
// after installing; a worker restarted in between defaults to the harmless first-install path.
let replacesActiveWorker = false;
self.addEventListener('install', () => {
  replacesActiveWorker = self.registration.active !== null;
});

// Windows that announced themselves (useServiceWorkerUpdate; a 0.x page never does) are skipped by
// the activate loop below and answered with this build's version. The set lives in the worker
// instance like `replacesActiveWorker`. Webpack's DefinePlugin inlines the version literal into
// `public/sw.js`; `Env` is not imported here because it would pull zod and the error factories in.
const WORKER_APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION;
const announcedWindowIds = new Set<string>();

function isWindowClient(source: ExtendableMessageEvent['source']): source is WindowClient {
  return source !== null && 'type' in source && source.type === 'window';
}

self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const source = event.source;
  if (event.data?.type !== SW_CLIENT_ANNOUNCE || !isWindowClient(source)) return;
  announcedWindowIds.add(source.id);
  source.postMessage({ type: SW_TAKEOVER_SKIPPED, appVersion: WORKER_APP_VERSION });
});

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    (async () => {
      if (!replacesActiveWorker) return;
      try {
        await self.clients.claim();
      } catch {
        // Claiming is best effort: `navigate` below still reaches every window this worker controls.
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Not awaited: each navigation is a fetch this worker now serves, and the browser holds fetch
      // events until this activation has finished, so waiting for the navigations here would deadlock
      // until the event timeout. `navigate` rejects for a window the worker does not control or that
      // is mid-navigation; one such window must not keep the others on the old build.
      for (const client of windows) {
        if (announcedWindowIds.has(client.id)) continue;
        client.navigate(client.url).catch(() => undefined);
      }
    })(),
  );
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Social v1 cut-over (ADR-0021 amendment), until PR-E2 reverts it: the worker activates as soon
  // as it installs instead of waiting for the "Update available" consent (useServiceWorkerUpdate),
  // and the activate listener above reloads every open window of a build without the handshake
  // when it replaces an earlier worker. PR-E2 restores `false`, when the team decides (D9), not in
  // the next release.
  skipWaiting: true,
  // The first install claims open tabs immediately.
  clientsClaim: true,
  // Consumed by the NetworkOnly navigation route below.
  navigationPreload: true,
  precacheOptions: { cleanupOutdatedCaches: true },
  runtimeCaching: [
    // Same-origin page navigations go straight to the network. `fallbacks` serves the
    // precached offline page only when the fetch itself fails (offline, DNS), never for
    // an HTTP error response. Shop documents also consume preload, but have no App fallback.
    // No other runtime caching on purpose: Dexie is the data
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
        matcher: ({ request }) => {
          const pathname = new URL(request.url).pathname;
          return (
            request.mode === 'navigate' &&
            !pathname.startsWith('/api/') &&
            pathname !== '/shop-embed' &&
            !pathname.startsWith('/shop-embed/')
          );
        },
      },
    ],
  },
});

serwist.addEventListeners();
