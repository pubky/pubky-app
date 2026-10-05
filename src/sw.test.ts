import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';

/**
 * `src/sw.ts` runs inside a service worker; here it is evaluated in jsdom with the
 * `serwist` runtime mocked so the test can assert the configuration that matters:
 * no data caching, a NetworkOnly navigation route with the static offline fallback,
 * user-consented updates, and the share-target / legacy-cache listeners.
 */

type Matcher = (context: { request: Request; sameOrigin: boolean; url: URL; event?: unknown }) => boolean;

interface RuntimeCachingEntry {
  matcher: Matcher;
  handler: unknown;
  method?: string;
}

type FallbackContext = Parameters<Matcher>[0];

interface CapturedOptions {
  precacheEntries?: unknown;
  skipWaiting?: boolean;
  clientsClaim?: boolean;
  navigationPreload?: boolean;
  precacheOptions?: { cleanupOutdatedCaches?: boolean };
  runtimeCaching?: RuntimeCachingEntry[];
  fallbacks?: { entries: { url: string; matcher: Matcher }[] };
}

const mocks = vi.hoisted(() => ({
  options: null as CapturedOptions | null,
  addEventListeners: vi.fn(),
}));

vi.mock('serwist', () => ({
  Serwist: class {
    constructor(options: CapturedOptions) {
      mocks.options = options;
    }
    addEventListeners = mocks.addEventListeners;
  },
  NetworkOnly: class {},
}));

type WorkerListener = (event: unknown) => void;

function navigationContext(url: string, overrides: Partial<{ mode: RequestMode; sameOrigin: boolean }> = {}) {
  const parsed = new URL(url);
  return {
    request: asOpaque<Request>({ mode: overrides.mode ?? 'navigate', url }),
    sameOrigin: overrides.sameOrigin ?? true,
    url: parsed,
  };
}

describe('src/sw.ts', () => {
  const listeners = new Map<string, WorkerListener[]>();
  const cacheStore = { put: vi.fn(), keys: vi.fn().mockResolvedValue([]), delete: vi.fn() };
  const caches = { open: vi.fn().mockResolvedValue(cacheStore), delete: vi.fn().mockResolvedValue(true) };

  beforeEach(async () => {
    vi.resetModules();
    listeners.clear();
    mocks.options = null;
    mocks.addEventListeners.mockClear();
    cacheStore.put.mockClear();
    caches.open.mockClear();
    caches.delete.mockClear();
    Object.defineProperty(globalThis, 'caches', { configurable: true, value: caches });
    vi.spyOn(window, 'addEventListener').mockImplementation((type: string, listener: unknown) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener as WorkerListener]);
    });
    await import('./sw');
  });

  it('builds a worker that waits for user consent before taking over', () => {
    expect(mocks.options).toMatchObject({
      skipWaiting: false,
      clientsClaim: true,
      navigationPreload: true,
      precacheOptions: { cleanupOutdatedCaches: true },
    });
    expect(mocks.addEventListeners).toHaveBeenCalledTimes(1);
  });

  it('registers exactly one runtime route: same-origin GET navigations, network only', () => {
    const { runtimeCaching } = mocks.options!;
    expect(runtimeCaching).toHaveLength(1);
    const [route] = runtimeCaching!;
    expect(route.method).toBeUndefined();
    expect(route.handler?.constructor.name).toBe('NetworkOnly');

    expect(route.matcher(navigationContext('https://pubky.app/home'))).toBe(true);
    expect(route.matcher(navigationContext('https://pubky.app/home', { mode: 'cors' }))).toBe(false);
    expect(route.matcher(navigationContext('https://nexus.pubky.app/v0/stream', { sameOrigin: false }))).toBe(false);
    expect(route.matcher(navigationContext('https://pubky.app/api/feedback'))).toBe(false);
  });

  it('serves the static offline page as the navigation fallback', () => {
    const { fallbacks } = mocks.options!;
    expect(fallbacks?.entries).toHaveLength(1);
    expect(fallbacks!.entries[0].url).toBe('/offline.html');
    // Serwist's fallback plugin passes only { request, event } here, never url/sameOrigin.
    const fallbackContext = (mode: RequestMode) => ({ request: asOpaque<Request>({ mode }) });
    expect(fallbacks!.entries[0].matcher(asOpaque<FallbackContext>(fallbackContext('navigate')))).toBe(true);
    expect(fallbacks!.entries[0].matcher(asOpaque<FallbackContext>(fallbackContext('cors')))).toBe(false);
  });

  it('deletes the legacy Nexus runtime cache and its expiration database on activation', async () => {
    const [onActivate] = listeners.get('activate') ?? [];
    expect(onActivate).toBeDefined();
    const waitUntil = vi.fn();
    const deleteRequest: {
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      onblocked: (() => void) | null;
    } = { onsuccess: null, onerror: null, onblocked: null };
    const deleteDatabase = vi.fn(() => deleteRequest);
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: { deleteDatabase } });

    onActivate({ waitUntil });
    deleteRequest.onsuccess?.();
    await waitUntil.mock.calls[0][0];

    expect(caches.delete).toHaveBeenCalledWith('api-cache');
    expect(deleteDatabase).toHaveBeenCalledWith('serwist-expiration');
  });

  it('turns a share-target POST into a redirect to /share and stashes the files', async () => {
    const [onFetch] = listeners.get('fetch') ?? [];
    expect(onFetch).toBeDefined();
    // jsdom's File/FormData and Node's Request (undici) live in different realms, so the
    // multipart body is written by hand and the worker's `instanceof File` check is pointed
    // at Node's File for the duration of the test.
    const { File: NodeFile } = await import('node:buffer');
    const jsdomFile = globalThis.File;
    Object.defineProperty(globalThis, 'File', { configurable: true, value: NodeFile });
    try {
      const boundary = 'pubky-share-boundary';
      const body = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="title"',
        '',
        'Hello',
        `--${boundary}`,
        'Content-Disposition: form-data; name="url"',
        '',
        'https://example.com',
        `--${boundary}`,
        'Content-Disposition: form-data; name="media"; filename="pic.png"',
        'Content-Type: image/png',
        '',
        'x',
        `--${boundary}--`,
        '',
      ].join('\r\n');
      const request = new Request('https://pubky.app/share', {
        method: 'POST',
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
      const respondWith = vi.fn();
      // Inside a worker `Response.redirect` resolves relative to the script URL; Node has no base URL.
      vi.spyOn(Response, 'redirect').mockImplementation(
        (url, status) => new Response(null, { status, headers: { location: String(url) } }),
      );

      onFetch({ request, respondWith });
      const response: Response = await respondWith.mock.calls[0][0];

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/share?title=Hello&url=https%3A%2F%2Fexample.com&hasFiles=true');
      expect(caches.open).toHaveBeenCalledWith('share-target-files');
      expect(cacheStore.put).toHaveBeenCalledWith('/share-target-file/0', expect.any(Response));
      const cached: Response = cacheStore.put.mock.calls[0][1];
      expect(cached.headers.get('x-share-filename')).toBe('pic.png');
      expect(cached.headers.get('content-type')).toBe('image/png');
    } finally {
      Object.defineProperty(globalThis, 'File', { configurable: true, value: jsdomFile });
    }
  });

  it('leaves every other request to Serwist', () => {
    const [onFetch] = listeners.get('fetch') ?? [];
    const respondWith = vi.fn();

    onFetch({ request: new Request('https://pubky.app/share', { method: 'GET' }), respondWith });
    onFetch({ request: new Request('https://pubky.app/home', { method: 'POST' }), respondWith });

    expect(respondWith).not.toHaveBeenCalled();
  });
});
