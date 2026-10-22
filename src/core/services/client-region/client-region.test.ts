import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { asOpaque } from '@/test-utils/type-assertions';
import { CLIENT_REGION_PATH, ClientRegionService } from './client-region';

const mockFetch = vi.fn();

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });

describe('ClientRegionService.fetchCountry', () => {
  let logError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', asOpaque<typeof fetch>(mockFetch));
    logError = vi.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // An unavailable route is a value, never an error: nothing may have been logged or reported.
    expect(logError).not.toHaveBeenCalled();
    logError.mockRestore();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('asks the Shop region route through the same-origin mount, with no cache and no redirects', async () => {
    mockFetch.mockResolvedValue(json({ country: 'DE' }));

    await ClientRegionService.fetchCountry();

    expect(CLIENT_REGION_PATH).toBe('/shop-embed/api/marketplace/client-region');
    expect(mockFetch).toHaveBeenCalledWith(
      '/shop-embed/api/marketplace/client-region',
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns the uppercase country the route reports', async () => {
    mockFetch.mockResolvedValue(json({ country: 'GB' }));

    await expect(ClientRegionService.fetchCountry()).resolves.toEqual({ status: 'ready', country: 'GB' });
  });

  it('returns a null country when the edge could not tell where the viewer is', async () => {
    mockFetch.mockResolvedValue(json({ country: null }));

    await expect(ClientRegionService.fetchCountry()).resolves.toEqual({ status: 'ready', country: null });
  });

  it.each([
    ['a lowercase code', { country: 'de' }],
    ['a three-letter code', { country: 'DEU' }],
    ['a number', { country: 49 }],
    ['a body without a country', { region: 'DE' }],
    ['an array', ['DE']],
    ['a bare string', 'DE'],
    ['null', null],
  ])('is unavailable for %s', async (_label, body) => {
    mockFetch.mockResolvedValue(json(body));

    await expect(ClientRegionService.fetchCountry()).resolves.toEqual({ status: 'unavailable' });
  });

  it.each([404, 500, 503, 429, 403])('is unavailable, not an error, for HTTP %i', async (status) => {
    mockFetch.mockResolvedValue(new Response('nope', { status }));

    await expect(ClientRegionService.fetchCountry()).resolves.toEqual({ status: 'unavailable' });
  });

  // A deployment without a Shop beside it answers `/shop-embed/...` with an HTML page, sometimes with a 200.
  it('is unavailable for an HTML page, even a 200 one', async () => {
    mockFetch.mockResolvedValue(
      new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );

    await expect(ClientRegionService.fetchCountry()).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable for a JSON body that does not parse', async () => {
    mockFetch.mockResolvedValue(
      new Response('{not json', { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await expect(ClientRegionService.fetchCountry()).resolves.toEqual({ status: 'unavailable' });
  });

  it('is unavailable when the network fails', async () => {
    mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(ClientRegionService.fetchCountry()).resolves.toEqual({ status: 'unavailable' });
  });

  it('gives up after five seconds, so a hung route cannot hold a lock card forever', async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );

    const pending = ClientRegionService.fetchCountry();
    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toEqual({ status: 'unavailable' });
  });
});
