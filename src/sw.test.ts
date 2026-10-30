import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { asOpaque } from '@/test-utils/type-assertions';

/**
 * `src/sw.ts` runs inside a service worker; here it is evaluated in jsdom with the
 * `serwist` runtime mocked so the test can assert the configuration that matters:
 * no data caching, a NetworkOnly navigation route with the static offline fallback, the
 * one-release forced takeover of the social v1 cut-over (ADR-0021 amendment), and the
 * share-target / legacy-cache listeners.
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

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'clients');
    Reflect.deleteProperty(globalThis, 'registration');
  });

  it('builds a worker that activates as soon as it installs (social v1 cut-over, one release)', () => {
    expect(mocks.options).toMatchObject({
      skipWaiting: true,
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
    for (const path of [
      '/shop-embed',
      '/shop-embed/marketplace',
      '/shop-embed/api/auth/session',
      '/shop-embed/_next/static/chunk.js',
    ]) {
      expect(route.matcher(navigationContext(`https://pubky.app${path}`))).toBe(true);
      expect(route.matcher(navigationContext(`https://pubky.app${path}`, { mode: 'cors' }))).toBe(false);
    }
    expect(route.matcher(navigationContext('https://pubky.app/shop/marketplace'))).toBe(true);
  });

  it('serves the static offline page as the navigation fallback', () => {
    const { fallbacks } = mocks.options!;
    expect(fallbacks?.entries).toHaveLength(1);
    expect(fallbacks!.entries[0].url).toBe('/offline.html');
    // Serwist's fallback plugin passes only { request, event } here, never url/sameOrigin.
    const fallbackContext = (mode: RequestMode) => ({
      request: asOpaque<Request>({ mode, url: 'https://pubky.app/home' }),
    });
    expect(fallbacks!.entries[0].matcher(asOpaque<FallbackContext>(fallbackContext('navigate')))).toBe(true);
    expect(fallbacks!.entries[0].matcher(asOpaque<FallbackContext>(fallbackContext('cors')))).toBe(false);
    for (const path of ['/shop-embed', '/shop-embed/marketplace', '/shop-embed/api/auth/session', '/api/feedback']) {
      expect(fallbacks!.entries[0].matcher(navigationContext(`https://pubky.app${path}`))).toBe(false);
    }
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

  describe('social v1 cut-over takeover', () => {
    const order: string[] = [];
    const windowClient = (url: string, outcome: 'ok' | 'rejected' | 'pending') => ({
      url,
      navigate: vi.fn((target: string) => {
        order.push(`navigate:${target}`);
        if (outcome === 'rejected') return Promise.reject(new TypeError('The client is not controlled by this worker'));
        // A navigation is a fetch served by this worker, which the browser holds until activation ends.
        if (outcome === 'pending') return new Promise<null>(() => {});
        return Promise.resolve(null);
      }),
    });
    const claim = vi.fn(async () => {
      order.push('claim');
    });
    let windows: ReturnType<typeof windowClient>[];
    let matchAll: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      order.length = 0;
      claim.mockClear();
      windows = [
        windowClient('https://pubky.app/home', 'ok'),
        windowClient('https://pubky.app/settings', 'rejected'),
        windowClient('https://pubky.app/post/alice:0123', 'pending'),
      ];
      matchAll = vi.fn().mockResolvedValue(windows);
      Object.defineProperty(globalThis, 'clients', { configurable: true, value: { claim, matchAll } });
    });

    // Runs the worker's own install then activate listeners (Serwist's are mocked away) the way the
    // browser would: `registration.active` is the worker being replaced, or null on a first install.
    const installThenActivate = async (active: object | null) => {
      Object.defineProperty(globalThis, 'registration', { configurable: true, value: { active } });
      for (const onInstall of listeners.get('install') ?? []) onInstall({ waitUntil: vi.fn() });
      // The takeover listener is registered after the legacy-cache one.
      const [, onTakeover] = listeners.get('activate') ?? [];
      expect(onTakeover).toBeDefined();
      const waitUntil = vi.fn();
      onTakeover({ waitUntil });
      // Activation must settle on its own: a rejected navigate or claim must not reject it, and a
      // navigation still in flight must not hold it open (its fetch waits for this very activation).
      await expect(waitUntil.mock.calls[0][0]).resolves.toBeUndefined();
    };

    it('claims then navigates every window client without waiting for the navigations', async () => {
      await installThenActivate({ scriptURL: 'https://pubky.app/sw.js' });

      expect(claim).toHaveBeenCalledTimes(1);
      expect(matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
      expect(order[0]).toBe('claim');
      for (const client of windows) {
        expect(client.navigate).toHaveBeenCalledWith(client.url);
      }
    });

    it('still navigates when claiming fails', async () => {
      claim.mockRejectedValueOnce(new DOMException('claim failed', 'InvalidStateError'));

      await installThenActivate({ scriptURL: 'https://pubky.app/sw.js' });

      expect(windows.map((client) => client.navigate.mock.calls.length)).toEqual([1, 1, 1]);
    });

    it('leaves a first install to clientsClaim: no reload of a first-time visitor', async () => {
      await installThenActivate(null);

      expect(claim).not.toHaveBeenCalled();
      expect(matchAll).not.toHaveBeenCalled();
      for (const client of windows) {
        expect(client.navigate).not.toHaveBeenCalled();
      }
    });
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
