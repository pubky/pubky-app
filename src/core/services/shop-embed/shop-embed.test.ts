import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkErrorCode, ServerErrorCode, TimeoutErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory, ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import * as errorReporting from '@/libs/observability/sentry';
import * as runtimeConfig from '@/libs/runtime-config/runtime-config';
import { LocalAuthService } from '@/services/local/auth/auth';
import { AUTH_PERSIST_KEY } from '@/stores/persistedKeys';
import { asOpaque } from '@/test-utils/type-assertions';
import { ShopEmbedService } from './shop-embed';

const serviceKey = 'pubky.marketplace.session.v1';
const studioKey = 'pubky.marketplace.inventory-session.v1';
const marketplaceOrigin = 'https://marketplace.example.com';
const purchaseBearer = 'P'.repeat(43);
const studioBearer = 'S'.repeat(43);
const purchaseSessionId = '6f1c2a3e-9b4d-4e5f-8a7b-0c1d2e3f4a5b';
const studioSessionId = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const pendingKey = 'pubky-messaging-keys-teardown-pending';
const signedOut = {
  generation: 'logout',
  shopCleanupEpoch: 'logout',
  currentUserPubky: null,
  sessionReference: null,
  hasProfile: null,
};
function persist(state = signedOut) {
  localStorage.setItem(AUTH_PERSIST_KEY, JSON.stringify({ version: 3, state }));
}
function open(name: string, tables: string[]) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => tables.forEach((table) => request.result.createObjectStore(table));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transaction(db: IDBDatabase, table: string, run: (store: IDBObjectStore) => void) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(table, 'readwrite');
    run(tx.objectStore(table));
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
function count(db: IDBDatabase, table: string) {
  return new Promise<number>((resolve) => {
    const request = db.transaction(table).objectStore(table).count();
    request.onsuccess = () => resolve(request.result);
  });
}
let main: IDBDatabase;
let keys: IDBDatabase;
beforeEach(async () => {
  vi.spyOn(errorReporting, 'captureAppError').mockImplementation(() => {});
  localStorage.clear();
  persist();
  LocalAuthService.read();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (_name: string, _options: LockOptions, run: () => unknown) => run(),
    },
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  main = await open('shop-franky', [
    'commerce_cart_items',
    'commerce_messaging_messages',
    'commerce_delivery_addresses',
    'commerce_listings',
    'chat_identity',
    'chat_conversations',
    'chat_messages',
    'chat_sync_state',
  ]);
  keys = await open('shop-franky-messaging-keyring', ['wrapping-key']);
  for (const table of main.objectStoreNames) await transaction(main, table, (store) => store.put('data', 'row'));
  await transaction(keys, 'wrapping-key', (store) => {
    store.put('key', 'wrapping-key');
    store.put('epoch', 'wrapping-key-epoch');
    store.put('unrelated', 'preserved');
  });
  localStorage.setItem(serviceKey, 'credential');
  localStorage.setItem('shop-auth-store', 'owned-grant-pointer');
  localStorage.setItem('shop-owned-grant-v1:pending', 'retirement');
  localStorage.setItem('unrelated', 'value');
});
afterEach(() => {
  main.close();
  keys.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
});

describe('App-owned Shop logout cleanup', () => {
  it('keeps cleanup pending without Web Locks instead of clearing an unfenced session', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(localStorage.getItem(serviceKey)).toBe('credential');
    expect(await count(main, 'commerce_cart_items')).toBe(1);
    expect(await count(keys, 'wrapping-key')).toBe(3);
    expect(LocalAuthService.read()?.shopCleanupEpoch).toBe('logout');
    expect(localStorage.getItem('shop-host-cleanup-epoch-v1')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('clears credentials without creating absent Shop databases', async () => {
    main.close();
    keys.close();
    const names = ['shop-franky', 'shop-franky-messaging-keyring'];
    for (const name of names) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect((await indexedDB.databases()).filter((db) => names.includes(db.name!))).toEqual([]);
    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('clears exact Shop credentials and private tables without an iframe, preserving owned grants, addresses and public caches', async () => {
    await ShopEmbedService.cleanupSignedOut('logout', 'logout');
    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(localStorage.getItem('shop-auth-store')).toBe('owned-grant-pointer');
    expect(localStorage.getItem('shop-owned-grant-v1:pending')).toBe('retirement');
    expect(localStorage.getItem('unrelated')).toBe('value');
    expect(await count(main, 'commerce_cart_items')).toBe(0);
    expect(await count(main, 'commerce_messaging_messages')).toBe(0);
    expect(await count(main, 'commerce_delivery_addresses')).toBe(1);
    expect(await count(main, 'commerce_listings')).toBe(1);
    expect(await count(keys, 'wrapping-key')).toBe(1);
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/shop-embed/api/marketplace/session',
      expect.objectContaining({ method: 'DELETE', credentials: 'same-origin' }),
    );
    expect(localStorage.getItem('shop-host-cleanup-epoch-v1')).toBeNull();
    expect(errorReporting.captureAppError).not.toHaveBeenCalled();
  });
  it('reports an HTTP failure once, completes local cleanup and keeps the epoch available for retry', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(ShopEmbedService.cleanupSignedOut('logout', 'logout')).resolves.toBeUndefined();

    expect(errorReporting.captureAppError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        category: ErrorCategory.Server,
        code: ServerErrorCode.SERVICE_UNAVAILABLE,
        service: ErrorService.Shop,
        operation: 'cleanupSignedOut',
        context: { endpoint: '/shop-embed/api/marketplace/session', statusCode: 503 },
      }),
    );
    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(await count(main, 'commerce_cart_items')).toBe(0);
    expect(await count(keys, 'wrapping-key')).toBe(1);
    expect(LocalAuthService.read()?.shopCleanupEpoch).toBe('logout');
    expect(localStorage.getItem('shop-host-cleanup-epoch-v1')).toBeNull();

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(errorReporting.captureAppError).toHaveBeenCalledTimes(1);
  });
  it('reports a network failure once without rejecting logout or skipping local cleanup', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(ShopEmbedService.cleanupSignedOut('logout', 'logout')).resolves.toBeUndefined();

    expect(errorReporting.captureAppError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        category: ErrorCategory.Network,
        code: NetworkErrorCode.CONNECTION_FAILED,
        service: ErrorService.Shop,
        operation: 'cleanupSignedOut',
      }),
    );
    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(await count(main, 'commerce_cart_items')).toBe(0);
    expect(await count(keys, 'wrapping-key')).toBe(1);
    expect(LocalAuthService.read()?.shopCleanupEpoch).toBe('logout');
    expect(localStorage.getItem('shop-host-cleanup-epoch-v1')).toBeNull();
  });
  it('aborts a stalled HTTP request at the cleanup deadline and preserves the retry epoch', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
            once: true,
          });
        }),
    );
    try {
      const cleanup = ShopEmbedService.cleanupSignedOut('logout', 'logout');
      await vi.advanceTimersByTimeAsync(4000);
      await expect(cleanup).resolves.toBeUndefined();

      expect(errorReporting.captureAppError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          category: ErrorCategory.Timeout,
          code: TimeoutErrorCode.REQUEST_ABORTED,
          service: ErrorService.Shop,
          operation: 'cleanupSignedOut',
          context: { url: '/shop-embed/api/marketplace/session', signalAborted: true },
        }),
      );
      expect(LocalAuthService.read()?.shopCleanupEpoch).toBe('logout');
      expect(localStorage.getItem('shop-host-cleanup-epoch-v1')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('rejects a queued cleanup after another generation has logged in', async () => {
    let run!: () => Promise<unknown>;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, _options: LockOptions, callback: () => Promise<unknown>) =>
          new Promise<void>((resolve) => {
            run = async () => {
              await callback();
              resolve();
            };
          }),
      },
    });
    const cleanup = ShopEmbedService.cleanupSignedOut('logout', 'logout');
    persist({ ...signedOut, generation: 'new-login', shopCleanupEpoch: 'new-login' });
    await run();
    await cleanup;
    expect(localStorage.getItem(serviceKey)).toBe('credential');
    expect(await count(main, 'commerce_cart_items')).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('bounds an unavailable database and prevents a late open from clearing newer credentials', async () => {
    vi.useFakeTimers();
    const request = asOpaque<IDBOpenDBRequest>({ result: main });
    const opening = vi.spyOn(indexedDB, 'open').mockReturnValueOnce(request);
    const clear = vi.spyOn(main, 'transaction');
    const cleanup = ShopEmbedService.cleanupSignedOut('logout', 'logout');
    await vi.advanceTimersByTimeAsync(4000);
    await cleanup;
    expect(localStorage.getItem(pendingKey)).toBe('1');
    localStorage.setItem(serviceKey, 'new-credential');
    persist({ ...signedOut, generation: 'new-login', shopCleanupEpoch: 'new-login' });
    request.onsuccess?.call(request, new Event('success'));
    expect(clear).not.toHaveBeenCalled();
    expect(localStorage.getItem(serviceKey)).toBe('new-credential');
    opening.mockRestore();
    vi.useRealTimers();
  });
  it('leaves a failed database cleanup pending and retries without acknowledging Shop completion', async () => {
    const opening = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Unavailable', 'UnknownError');
    });
    await ShopEmbedService.cleanupSignedOut('logout', 'logout');
    expect(localStorage.getItem(pendingKey)).toBe('1');
    expect(await count(keys, 'wrapping-key')).toBe(3);
    opening.mockRestore();
    await ShopEmbedService.cleanupSignedOut('logout', 'logout');
    expect(localStorage.getItem(pendingKey)).toBeNull();
    expect(await count(main, 'commerce_messaging_messages')).toBe(0);
    expect(await count(keys, 'wrapping-key')).toBe(1);
  });
});

it('clears the replacement Chat credentials and caches without a mounted Shop', async () => {
  localStorage.setItem('shop-chat-inbox-session:v1', 'inbox-bearer');
  await ShopEmbedService.cleanupSignedOut('logout', 'logout');
  expect(localStorage.getItem('shop-chat-inbox-session:v1')).toBeNull();
  for (const table of ['chat_identity', 'chat_conversations', 'chat_messages', 'chat_sync_state'])
    expect(await count(main, table)).toBe(0);
});
it('does not repeat cleanup once Shop acknowledges the same signed-out boundary', async () => {
  localStorage.setItem('shop-host-cleanup-epoch-v1', 'logout');
  await ShopEmbedService.cleanupSignedOut('logout', 'logout');
  expect(fetch).not.toHaveBeenCalled();
  expect(await count(main, 'commerce_cart_items')).toBe(1);
});

describe('Marketplace session revocation at sign-out', () => {
  const future = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const record = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({
      token: purchaseBearer,
      sessionId: purchaseSessionId,
      pubky: 'alice',
      capabilities: 'purchase',
      expiresAt: future(),
      ...overrides,
    });
  const revocations = () =>
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith(`${marketplaceOrigin}/v1/auth/sessions/`));

  beforeEach(() => {
    vi.spyOn(runtimeConfig, 'getMarketplaceUrl').mockReturnValue(marketplaceOrigin);
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
  });

  it('revokes the purchase and Studio bearers held only in localStorage before removing them', async () => {
    localStorage.setItem(serviceKey, record());
    localStorage.setItem(
      studioKey,
      record({ token: studioBearer, sessionId: studioSessionId, capabilities: 'inventory' }),
    );

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(localStorage.getItem(studioKey)).toBeNull();
    expect(revocations()).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      `${marketplaceOrigin}/v1/auth/sessions/${purchaseSessionId}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: { authorization: `Bearer ${purchaseBearer}` },
        keepalive: true,
        credentials: 'omit',
        cache: 'no-store',
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      `${marketplaceOrigin}/v1/auth/sessions/${studioSessionId}`,
      expect.objectContaining({
        method: 'DELETE',
        headers: { authorization: `Bearer ${studioBearer}` },
        keepalive: true,
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      '/shop-embed/api/marketplace/session',
      expect.objectContaining({ method: 'DELETE', credentials: 'same-origin' }),
    );
    expect(errorReporting.captureAppError).not.toHaveBeenCalled();
  });

  it('revokes a bearer held in both records once', async () => {
    localStorage.setItem(serviceKey, record());
    localStorage.setItem(studioKey, record());

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(revocations()).toHaveLength(1);
  });

  it('joins the origin to the path when the configured origin ends with a slash', async () => {
    vi.spyOn(runtimeConfig, 'getMarketplaceUrl').mockReturnValue(`${marketplaceOrigin}/`);
    localStorage.setItem(serviceKey, record());

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(fetch).toHaveBeenCalledWith(
      `${marketplaceOrigin}/v1/auth/sessions/${purchaseSessionId}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it.each([
    ['an expired record', record({ expiresAt: new Date(Date.now() - 1000).toISOString() })],
    ['a record without a session id', record({ sessionId: undefined })],
    ['a record with a malformed session id', record({ sessionId: '../sessions' })],
    ['a record with a malformed bearer', record({ token: 'short' })],
    ['a record that is not JSON', 'credential'],
    ['a JSON value that is not a record', '[]'],
  ])('does not call the service for %s and still removes it', async (_name, stored) => {
    localStorage.setItem(serviceKey, stored);

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(revocations()).toHaveLength(0);
    expect(errorReporting.captureAppError).not.toHaveBeenCalled();
  });

  it('revokes a record whose expiry cannot be read, since the service decides', async () => {
    localStorage.setItem(serviceKey, record({ expiresAt: 'soon' }));

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(revocations()).toHaveLength(1);
  });

  it('treats a bearer the service no longer knows as ended without reporting', async () => {
    localStorage.setItem(serviceKey, record());
    localStorage.setItem(studioKey, record({ token: studioBearer, sessionId: studioSessionId }));
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).includes(purchaseSessionId)) return new Response(null, { status: 401 });
      if (String(url).includes(studioSessionId)) return new Response(null, { status: 404 });
      return new Response(null, { status: 204 });
    });

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(revocations()).toHaveLength(2);
    expect(errorReporting.captureAppError).not.toHaveBeenCalled();
  });

  it('reports a service failure once and still completes the rest of the cleanup', async () => {
    localStorage.setItem(serviceKey, record());
    vi.mocked(fetch).mockImplementation(async (url) =>
      String(url).startsWith(marketplaceOrigin)
        ? new Response(null, { status: 503 })
        : new Response(null, { status: 204 }),
    );

    await expect(ShopEmbedService.cleanupSignedOut('logout', 'logout')).resolves.toBeUndefined();

    expect(errorReporting.captureAppError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        category: ErrorCategory.Server,
        code: ServerErrorCode.SERVICE_UNAVAILABLE,
        service: ErrorService.Shop,
        operation: 'revokeMarketplaceSession',
        context: { endpoint: `${marketplaceOrigin}/v1/auth/sessions/${purchaseSessionId}`, statusCode: 503 },
      }),
    );
    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(await count(main, 'commerce_cart_items')).toBe(0);
    expect(await count(keys, 'wrapping-key')).toBe(1);
    expect(localStorage.getItem(pendingKey)).toBeNull();
  });

  it('reports a network failure once without rejecting logout', async () => {
    localStorage.setItem(serviceKey, record());
    vi.mocked(fetch).mockImplementation(async (url) => {
      if (String(url).startsWith(marketplaceOrigin)) throw new TypeError('Failed to fetch');
      return new Response(null, { status: 204 });
    });

    await expect(ShopEmbedService.cleanupSignedOut('logout', 'logout')).resolves.toBeUndefined();

    expect(errorReporting.captureAppError).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        category: ErrorCategory.Network,
        code: NetworkErrorCode.CONNECTION_FAILED,
        service: ErrorService.Shop,
        operation: 'revokeMarketplaceSession',
      }),
    );
    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(await count(keys, 'wrapping-key')).toBe(1);
  });

  it('aborts a stalled revocation at the cleanup deadline', async () => {
    vi.useFakeTimers();
    localStorage.setItem(serviceKey, record());
    vi.mocked(fetch).mockImplementation((url, options) => {
      if (!String(url).startsWith(marketplaceOrigin)) return Promise.resolve(new Response(null, { status: 204 }));
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
          once: true,
        });
      });
    });
    try {
      const cleanup = ShopEmbedService.cleanupSignedOut('logout', 'logout');
      await vi.advanceTimersByTimeAsync(4000);
      await expect(cleanup).resolves.toBeUndefined();

      expect(errorReporting.captureAppError).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          category: ErrorCategory.Timeout,
          code: TimeoutErrorCode.REQUEST_ABORTED,
          operation: 'revokeMarketplaceSession',
        }),
      );
      expect(localStorage.getItem(serviceKey)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the local cleanup when no marketplace origin is configured', async () => {
    vi.spyOn(runtimeConfig, 'getMarketplaceUrl').mockReturnValue(undefined);
    localStorage.setItem(serviceKey, record());

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(localStorage.getItem(serviceKey)).toBeNull();
    expect(revocations()).toHaveLength(0);
    expect(Logger.warn).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      '/shop-embed/api/marketplace/session',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('does not revoke a session of the next login when the cleanup is stale', async () => {
    let run!: () => Promise<unknown>;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, _options: LockOptions, callback: () => Promise<unknown>) =>
          new Promise<void>((resolve) => {
            run = async () => {
              await callback();
              resolve();
            };
          }),
      },
    });
    localStorage.setItem(serviceKey, record());
    const cleanup = ShopEmbedService.cleanupSignedOut('logout', 'logout');
    persist({ ...signedOut, generation: 'new-login', shopCleanupEpoch: 'new-login' });
    await run();
    await cleanup;

    expect(localStorage.getItem(serviceKey)).toBe(
      record({ expiresAt: JSON.parse(localStorage.getItem(serviceKey)!).expiresAt }),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not revoke without Web Locks, where the record stays for the retry', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    localStorage.setItem(serviceKey, record());

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(localStorage.getItem(serviceKey)).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('revokes only on the run that removes the record, not on the retry of a failed teardown', async () => {
    localStorage.setItem(serviceKey, record());
    const opening = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('Unavailable', 'UnknownError');
    });

    await ShopEmbedService.cleanupSignedOut('logout', 'logout');
    opening.mockRestore();
    await ShopEmbedService.cleanupSignedOut('logout', 'logout');

    expect(revocations()).toHaveLength(1);
  });
});
