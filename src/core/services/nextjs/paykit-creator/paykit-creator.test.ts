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
const freshParams = () => ({ creator: `pubky${MOCK_LOCK_AUTHOR_PUBKY}-${++creatorCount}` });
let params = freshParams();

/** Paykit's `/setup/creator-held` answers, as paykit-server v0.1.1-rc2 sends them. */
const heldAnswer = (held: boolean) => Response.json({ held }, { headers: { 'Cache-Control': 'no-store' } });
const refused = (status: 429 | 503) =>
  Response.json(
    { error: status === 429 ? 'rate_limited' : 'unavailable' },
    { status, headers: { 'Retry-After': status === 429 ? '60' : '1' } },
  );

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

  it('asks /setup/creator-held with the creator alone and reads { held: true }', async () => {
    vi.mocked(fetch).mockResolvedValue(heldAnswer(true));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(true);

    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]));
    expect(`${url.origin}${url.pathname}`).toBe('https://paykit.server/setup/creator-held');
    expect([...url.searchParams.entries()]).toEqual([['creator', params.creator]]);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'manual',
      cache: 'no-store',
    });
  });

  it('reads { held: false } as "not held"', async () => {
    vi.mocked(fetch).mockResolvedValue(heldAnswer(false));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
  });

  it('never opens a setup flow to find out', async () => {
    vi.mocked(fetch).mockResolvedValue(heldAnswer(true));

    await NextJsPaykitCreatorService.isCreatorHeld(params);

    const paths = vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).pathname);
    expect(paths).toEqual(['/setup/creator-held']);
  });

  it('throws on 400, which is a rejected query and not "not held"', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'invalid_request' }, { status: 400 }));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
      category: ErrorCategory.Client,
      context: expect.objectContaining({ statusCode: 400 }),
    });
  });

  it('throws on 429 at once, without waiting the minute Paykit asks for', async () => {
    vi.mocked(fetch).mockResolvedValue(refused(429));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
      category: ErrorCategory.RateLimit,
      context: expect.objectContaining({ statusCode: 429 }),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('asks once more after a 503 and its one-second Retry-After', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(refused(503)).mockResolvedValueOnce(heldAnswer(true));

    const answer = NextJsPaykitCreatorService.isCreatorHeld(params);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    await expect(answer).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('releases the first 503 before asking again', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), { status: 503, headers: { 'Retry-After': '1' } }),
      )
      .mockResolvedValueOnce(heldAnswer(true));

    const answer = NextJsPaykitCreatorService.isCreatorHeld(params);
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(answer).resolves.toBe(true);
  });

  it.each([400, 404, 429, 502, 302])('releases the body of a %i it does not read', async (status) => {
    const cancel = vi.fn();
    vi.mocked(fetch).mockResolvedValue(new Response(new ReadableStream({ cancel }), { status }));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });

  it('throws when the retry after a 503 is refused again', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValueOnce(refused(503)).mockResolvedValueOnce(refused(503));

    const answer = NextJsPaykitCreatorService.isCreatorHeld(params);
    const settled = expect(answer).rejects.toMatchObject({
      category: ErrorCategory.Server,
      context: expect.objectContaining({ statusCode: 503 }),
    });
    await vi.advanceTimersByTimeAsync(1000);

    await settled;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not wait out a 503 whose Retry-After is longer than two seconds', async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Retry-After': '30' } }),
    );

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
      context: expect.objectContaining({ statusCode: 503 }),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [502, ErrorCategory.Server],
    [404, ErrorCategory.Client],
  ])('throws on %i instead of guessing an answer', async (status, category) => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status }));

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
      category,
      context: expect.objectContaining({ statusCode: status }),
    });
  });

  it.each([
    ['an HTML page', () => new Response('<html></html>', { status: 200 })],
    ['a non-boolean held', () => Response.json({ held: 'yes' })],
    ['no held field', () => Response.json({})],
  ])('throws on a 200 with %s', async (_label, answer) => {
    vi.mocked(fetch).mockResolvedValue(answer());

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toThrow(
      'Paykit creator-held response is invalid',
    );
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

  it('bounds both attempts with one six-second deadline', async () => {
    vi.useFakeTimers();
    // Node's own timeout signal ignores fake timers; this one fires on the faked clock.
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), ms);
      return controller.signal;
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(refused(503))
      .mockImplementationOnce(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
          }),
      );

    const answer = NextJsPaykitCreatorService.isCreatorHeld(params);
    const settled = expect(answer).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(fetch).mock.calls.map(([, init]) => init?.signal);
    expect(second).toBe(first);
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(timeout).toHaveBeenCalledWith(6000);

    const signal = timeout.mock.results[0].value as AbortSignal;
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await settled;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails without a configured Paykit Server and sends nothing', async () => {
    mocks.getPaykitServerUrl.mockReturnValue(undefined);

    await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toThrow('No Paykit Server configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  describe('answer reuse, so callers sharing the app server spare its read limit', () => {
    it('answers eleven checks of a held creator in one window from one read', async () => {
      vi.mocked(fetch).mockImplementation(async () => heldAnswer(true));

      const answers = [];
      for (let check = 0; check < 11; check += 1) {
        answers.push(await NextJsPaykitCreatorService.isCreatorHeld(params));
      }

      expect(answers).toEqual(Array(11).fill(true));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('answers eleven distinct creators with one read each and no setup start', async () => {
      vi.mocked(fetch).mockImplementation(async () => heldAnswer(true));

      const answers = [];
      for (let creator = 0; creator < 11; creator += 1) {
        answers.push(await NextJsPaykitCreatorService.isCreatorHeld(freshParams()));
      }

      expect(answers).toEqual(Array(11).fill(true));
      const paths = new Set(vi.mocked(fetch).mock.calls.map(([url]) => new URL(String(url)).pathname));
      expect(fetch).toHaveBeenCalledTimes(11);
      expect(paths).toEqual(new Set(['/setup/creator-held']));
    });

    it('shares one read between checks that arrive together', async () => {
      vi.mocked(fetch).mockImplementation(async () => heldAnswer(true));

      const answers = await Promise.all(
        Array.from({ length: 11 }, () => NextJsPaykitCreatorService.isCreatorHeld(params)),
      );

      expect(answers).toEqual(Array(11).fill(true));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('asks again after a held answer is two minutes old', async () => {
      vi.useFakeTimers();
      vi.mocked(fetch).mockImplementation(async () => heldAnswer(true));

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
      vi.mocked(fetch).mockResolvedValueOnce(heldAnswer(false)).mockResolvedValueOnce(heldAnswer(true));

      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
      vi.advanceTimersByTime(14_000);
      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
      vi.advanceTimersByTime(2_000);
      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('does not keep a 429, so the next check asks again', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(refused(429)).mockResolvedValueOnce(heldAnswer(true));

      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).rejects.toMatchObject({
        context: expect.objectContaining({ statusCode: 429 }),
      });
      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(true);
    });

    it('does not keep a network failure, and the checks waiting on it fail together', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
      vi.mocked(fetch).mockResolvedValueOnce(heldAnswer(false));

      const settled = await Promise.allSettled([
        NextJsPaykitCreatorService.isCreatorHeld(params),
        NextJsPaykitCreatorService.isCreatorHeld(params),
      ]);
      expect(settled.map((result) => result.status)).toEqual(['rejected', 'rejected']);
      expect(fetch).toHaveBeenCalledTimes(1);

      await expect(NextJsPaykitCreatorService.isCreatorHeld(params)).resolves.toBe(false);
    });

    it('keeps at most 500 answers, dropping the oldest first', async () => {
      vi.mocked(fetch).mockImplementation(async () => heldAnswer(true));
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
