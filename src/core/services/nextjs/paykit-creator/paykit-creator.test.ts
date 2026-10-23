import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCategory } from '@/libs/error/error.types';
import { MOCK_LOCK_AUTHOR_PUBKY } from '@/test-utils/locks';
import { NextJsPaykitCreatorService } from './paykit-creator';

const mocks = vi.hoisted(() => ({
  getPaykitServerUrl: vi.fn((): string | undefined => 'https://paykit.server/setup'),
}));

vi.mock('@/config/network', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/network')>()),
  getPaykitServerUrl: mocks.getPaykitServerUrl,
}));

const params = { creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}`, returnTo: 'https://pubky.app' };

describe('NextJsPaykitCreatorService.isCreatorHeld', () => {
  beforeEach(() => {
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server/setup');
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads 200 from /setup/reconnect as "held", and sends what the setup iframe sends', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html></html>', { status: 200 }));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(true);

    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://paykit.server/setup/reconnect');
    expect(url.searchParams.get('creator')).toBe(params.creator);
    expect(url.searchParams.get('return_to')).toBe('https://pubky.app');
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f-]{36}$/);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
      cache: 'no-store',
    });
  });

  it('reads 400 invalid_request as "not held"', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'invalid_request' }, { status: 400 }));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
  });

  it('uses a new state for every probe', async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response('', { status: 200 }));

    await NextJsPaykitCreatorService.isCreatorHeld(params);
    await NextJsPaykitCreatorService.isCreatorHeld(params);

    const states = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).searchParams.get('state'));
    expect(new Set(states).size).toBe(2);
  });

  it('does not download the HTML page a held creator gets', async () => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 200 }));

    await NextJsPaykitCreatorService.isCreatorHeld(params);

    expect(cancel).toHaveBeenCalled();
  });

  it.each([
    [429, ErrorCategory.RateLimit],
    [502, ErrorCategory.Server],
    [503, ErrorCategory.Server],
    [404, ErrorCategory.Client],
    [422, ErrorCategory.Client],
  ])('throws on %i instead of guessing an answer', async (status, category) => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status }));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
      category,
      context: expect.objectContaining({ statusCode: status }),
    });
  });

  it('throws on a redirect, which Paykit never answers with', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 302 }));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toThrow();
  });

  it('throws on a network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
      category: ErrorCategory.Network,
    });
  });

  it('bounds the request with a timeout signal', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 400 }));

    await NextJsPaykitCreatorService.isCreatorHeld(params);

    expect(vi.mocked(fetch).mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails without a configured Paykit Server and sends nothing', async () => {
    mocks.getPaykitServerUrl.mockReturnValue(undefined);

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toThrow('No Paykit Server configured');
    expect(fetch).not.toHaveBeenCalled();
  });
});
