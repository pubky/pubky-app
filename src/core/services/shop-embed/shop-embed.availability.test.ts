import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopEmbedController } from '@/controllers/shop-embed/shop-embed';
import * as errorReporting from '@/libs/observability/sentry';
import { ShopEmbedService } from './shop-embed';

beforeEach(() => {
  vi.spyOn(errorReporting, 'captureAppError').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Shop BFF availability', () => {
  it('checks readiness when AbortSignal.any is unavailable in older Safari', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any')!;
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ service: 'pubky-shop-bff', status: 'ready' })));
    try {
      expect(await ShopEmbedService.fetchAvailability(new AbortController().signal)).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    } finally {
      Object.defineProperty(AbortSignal, 'any', descriptor);
    }
  });

  it('checks the exact public health marker through the controller without creating a session', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ service: 'pubky-shop-bff', status: 'ready' })));
    expect(await ShopEmbedController.fetchAvailability(new AbortController().signal)).toBe(true);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      '/shop-embed/api/marketplace/health',
      expect.objectContaining({ method: 'GET', cache: 'no-store', redirect: 'error', credentials: 'same-origin' }),
    );
  });

  it.each([
    new Response('<html>proxy fallback</html>', { headers: { 'content-type': 'text/html' } }),
    Response.json({ status: 'ready' }),
    Response.json({ service: 'pubky-shop-bff', status: 'unavailable' }),
    new Response('{', { headers: { 'content-type': 'application/json' } }),
    Response.json({ service: 'pubky-shop-bff', status: 'unavailable' }, { status: 503 }),
  ])('rejects a non-ready response without changing authentication', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    localStorage.setItem('auth-test-sentinel', 'saved-grant');
    expect(await ShopEmbedService.fetchAvailability(new AbortController().signal)).toBe(false);
    expect(localStorage.getItem('auth-test-sentinel')).toBe('saved-grant');
    localStorage.removeItem('auth-test-sentinel');
  });

  it('reports an unexpected HTTP failure and never interprets it as a user logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 502 })));
    await expect(ShopEmbedService.fetchAvailability(new AbortController().signal)).rejects.toMatchObject({
      context: expect.objectContaining({ statusCode: 502 }),
    });
  });

  it.each(['timeout', 'unmount', 'already-aborted'])('bounds the request with cancellation: %s', async (reason) => {
    vi.useFakeTimers();
    const caller = new AbortController();
    if (reason === 'already-aborted') caller.abort();
    const removeListener = vi.spyOn(caller.signal, 'removeEventListener');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            const abort = () => reject(new DOMException('aborted', 'AbortError'));
            if (options.signal?.aborted) abort();
            else options.signal?.addEventListener('abort', abort, { once: true });
          }),
      ),
    );
    const request = ShopEmbedService.fetchAvailability(caller.signal);
    const result = expect(request).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
    if (reason === 'unmount') caller.abort();
    else if (reason === 'timeout') await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('releases the caller listener and timeout after a successful check', async () => {
    vi.useFakeTimers();
    const caller = new AbortController();
    const removeListener = vi.spyOn(caller.signal, 'removeEventListener');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ service: 'pubky-shop-bff', status: 'ready' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await ShopEmbedService.fetchAvailability(caller.signal)).toBe(true);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    caller.abort();
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(false);
  });
});
