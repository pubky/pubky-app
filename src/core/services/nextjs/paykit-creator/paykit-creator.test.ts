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

// The service reuses answers per creator, so every test asks about a creator of its own.
let creatorCount = 0;
const freshParams = (returnTo = 'https://pubky.app') => ({
  creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}-${++creatorCount}`,
  returnTo,
});
let params = freshParams();

describe('NextJsPaykitCreatorService.isCreatorHeld', () => {
  beforeEach(() => {
    params = freshParams();
    mocks.getPaykitServerUrl.mockReturnValue('https://paykit.server/setup');
    vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.useRealTimers();
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
    await NextJsPaykitCreatorService.isCreatorHeld(freshParams());

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

  describe('answer reuse, so held-status reads do not spend the shared setup-start budget', () => {
    /** Paykit's per-IP setup limit: ten starts per window from one address, then 429. */
    const fakePaykit = (held: boolean, limit = 10) => {
      let starts = 0;
      vi.mocked(fetch).mockImplementation(async () => {
        starts += 1;
        if (starts > limit) return new Response('', { status: 429 });
        return held ? new Response('<html></html>', { status: 200 }) : new Response('', { status: 400 });
      });
    };

    it('answers eleven checks of a held creator in one window from one probe', async () => {
      fakePaykit(true);

      const answers = [];
      for (let check = 0; check < 11; check += 1) {
        answers.push(await NextJsPaykitCreatorService.isCreatorHeld(params));
      }

      expect(answers).toEqual(Array(11).fill(true));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('answers eleven checks of a creator Paykit does not hold from one probe', async () => {
      fakePaykit(false);

      const answers = [];
      for (let check = 0; check < 11; check += 1) {
        answers.push(await NextJsPaykitCreatorService.isCreatorHeld(params));
      }

      expect(answers).toEqual(Array(11).fill(false));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('shares one probe between checks that arrive together', async () => {
      fakePaykit(true);

      const answers = await Promise.all(
        Array.from({ length: 11 }, () => NextJsPaykitCreatorService.isCreatorHeld(params)),
      );

      expect(answers).toEqual(Array(11).fill(true));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('asks again for another creator and for another return origin', async () => {
      fakePaykit(true);

      await NextJsPaykitCreatorService.isCreatorHeld(params);
      await NextJsPaykitCreatorService.isCreatorHeld(freshParams());
      await NextJsPaykitCreatorService.isCreatorHeld({ ...params, returnTo: 'https://preview.pubky.app' });

      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('asks again after a held answer is two minutes old', async () => {
      vi.useFakeTimers();
      fakePaykit(true);

      await NextJsPaykitCreatorService.isCreatorHeld(params);
      vi.advanceTimersByTime(119_000);
      await NextJsPaykitCreatorService.isCreatorHeld(params);
      expect(fetch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2_000);
      await NextJsPaykitCreatorService.isCreatorHeld(params);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('asks again after a not-held answer is fifteen seconds old, since a setup may have finished', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 400 }));
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 200 }));

      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
      vi.advanceTimersByTime(14_000);
      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
      vi.advanceTimersByTime(2_000);
      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it.each([429, 503])('does not keep a %i, so the next check asks again', async (status) => {
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status }));
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 200 }));

      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
        context: expect.objectContaining({ statusCode: status }),
      });
      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(true);
    });

    it('does not keep a network failure, and the checks waiting on it fail together', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
      vi.mocked(fetch).mockResolvedValueOnce(new Response('', { status: 400 }));

      const settled = await Promise.allSettled([
        NextJsPaykitCreatorService.isCreatorHeld(params),
        NextJsPaykitCreatorService.isCreatorHeld(params),
      ]);
      expect(settled.map((result) => result.status)).toEqual(['rejected', 'rejected']);
      expect(fetch).toHaveBeenCalledTimes(1);

      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
    });

    it('keeps at most 500 answers, dropping the oldest first', async () => {
      vi.mocked(fetch).mockImplementation(async () => new Response('', { status: 200 }));
      const first = freshParams();
      await NextJsPaykitCreatorService.isCreatorHeld(first);
      for (let creator = 0; creator < 500; creator += 1) {
        await NextJsPaykitCreatorService.isCreatorHeld(freshParams());
      }
      vi.mocked(fetch).mockClear();

      await NextJsPaykitCreatorService.isCreatorHeld(first);

      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
