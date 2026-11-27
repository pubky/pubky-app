import { act, renderHook, waitFor } from '@testing-library/react';
import { fakeOwner } from 'pubky-social-specs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { PinakesStatus } from '@/services/pinakes/pinakes.types';
import {
  PINAKES_RESOLVE_DEBOUNCE_MS,
  PINAKES_VIEW_RESOLVE_PAUSE_MS,
  resetViewResolves,
  usePinakesCard,
} from './usePinakesCard';

const mocks = vi.hoisted(() => ({ configured: true, fetchCardByUri: vi.fn(), resolveCard: vi.fn() }));

vi.mock('@/config/pinakes', () => ({ isPinakesConfigured: () => mocks.configured }));
vi.mock('@/controllers/pinakes/pinakes', () => ({
  PinakesController: { fetchCardByUri: mocks.fetchCardByUri, resolveCard: mocks.resolveCard },
}));

describe('usePinakesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.configured = true;
  });

  it('reads the card for the link', async () => {
    mocks.fetchCardByUri.mockResolvedValue(videoFixture);

    const { result } = renderHook(() => usePinakesCard(videoFixture.uri));

    await waitFor(() => expect(result.current.data).toEqual(videoFixture));
    expect(mocks.fetchCardByUri).toHaveBeenCalledWith({ uri: videoFixture.uri });
  });

  it('answers no card for a link Pinakes does not know', async () => {
    mocks.fetchCardByUri.mockResolvedValue(null);

    const { result } = renderHook(() => usePinakesCard('https://example.com/unknown'));

    await waitFor(() => expect(result.current).toEqual({ data: null, isLoading: false, isError: false }));
  });

  it('makes no request when Pinakes is not configured', () => {
    mocks.configured = false;

    const { result } = renderHook(() => usePinakesCard(videoFixture.uri));

    expect(result.current).toEqual({ data: null, isLoading: false, isError: false });
    expect(mocks.fetchCardByUri).not.toHaveBeenCalled();
  });

  it('makes no request without a link', () => {
    const { result } = renderHook(() => usePinakesCard(null));

    expect(result.current.data).toBeNull();
    expect(mocks.fetchCardByUri).not.toHaveBeenCalled();
  });

  it.each([
    ['a post', `/post/${fakeOwner(2)}/00357R34CQ8Q0`],
    ['a profile', `/profile/${fakeOwner(2)}`],
  ])('neither reads nor asks Pinakes for a link to %s on the host the app runs on', async (_, path) => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePinakesCard(`${window.location.origin}${path}`, { resolve: true }));
      await act(() => vi.advanceTimersByTimeAsync(PINAKES_RESOLVE_DEBOUNCE_MS * 2));

      expect(result.current).toEqual({ data: null, isLoading: false, isError: false });
      expect(mocks.fetchCardByUri).not.toHaveBeenCalled();
      expect(mocks.resolveCard).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('recheck', () => {
    let n = 0;
    let URI = '';

    beforeEach(() => {
      n += 1;
      // A link's schedule is once per page load: each test its own link.
      URI = `https://www.fedlex.admin.ch/eli/cc/2022/${n}/de`;
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    it('reads a link Pinakes did not know again, past the cache, and shows the card once it is read', async () => {
      // A mocked Pinakes that reads the link six seconds after it was published.
      mocks.fetchCardByUri.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValue(videoFixture);

      const { result } = renderHook(() => usePinakesCard(URI, { recheck: true }));
      await advance(0);
      expect(result.current).toEqual({ data: null, isLoading: false, isError: false });

      await advance(2_000);
      expect(mocks.fetchCardByUri).toHaveBeenLastCalledWith({ uri: URI, fresh: true });
      // Still no card: the link's own preview stays, never a loading state in between.
      expect(result.current).toEqual({ data: null, isLoading: false, isError: false });

      await advance(4_000);
      expect(result.current.data).toEqual(videoFixture);
      expect(mocks.fetchCardByUri).toHaveBeenCalledTimes(3);

      await advance(60_000);
      expect(mocks.fetchCardByUri).toHaveBeenCalledTimes(3);
    });

    it('waits 2, 4, 8, 16 then 30 s between re-reads and stops after about two minutes', async () => {
      mocks.fetchCardByUri.mockResolvedValue(null);

      renderHook(() => usePinakesCard(URI, { recheck: true }));
      await advance(0);
      const calls = () => mocks.fetchCardByUri.mock.calls.length;
      await advance(1_999);
      expect(calls()).toBe(1);
      await advance(1);
      expect(calls()).toBe(2);
      for (const delay of [4_000, 8_000, 16_000]) await advance(delay);
      expect(calls()).toBe(5);
      for (const delay of [30_000, 30_000, 30_000, 30_000, 60_000]) await advance(delay);
      expect(calls()).toBe(8);
    });

    it('pauses while the card is off screen and goes on when it is back', async () => {
      mocks.fetchCardByUri.mockResolvedValue(null);

      const { rerender } = renderHook(({ active }) => usePinakesCard(URI, { recheck: active }), {
        initialProps: { active: false },
      });
      await advance(30_000);
      expect(mocks.fetchCardByUri).toHaveBeenCalledTimes(1);

      rerender({ active: true });
      await advance(2_000);
      expect(mocks.fetchCardByUri).toHaveBeenCalledTimes(2);
    });

    it('spreads one schedule per link over two minutes, however many previews show it', async () => {
      mocks.fetchCardByUri.mockResolvedValue(null);
      const freshReads = () => mocks.fetchCardByUri.mock.calls.filter(([params]) => params.fresh).length;

      // A post and its repost, mounted together.
      renderHook(() => usePinakesCard(URI, { recheck: true }));
      renderHook(() => usePinakesCard(URI, { recheck: true }));
      await advance(0);
      const startedAt = Date.now();
      let lastReadAt = startedAt;
      for (let i = 0; i < 300; i++) {
        const before = freshReads();
        await advance(1_000);
        if (freshReads() > before) lastReadAt = Date.now();
      }

      expect(freshReads()).toBe(7);
      expect(lastReadAt - startedAt).toBeGreaterThanOrEqual(60_000);
    });

    it('keeps one schedule for previews of a link mounted a few seconds apart', async () => {
      const freshReadTimes: number[] = [];
      mocks.fetchCardByUri.mockImplementation(async (params: { fresh?: boolean }) => {
        if (params.fresh) freshReadTimes.push(Date.now());
        return null;
      });

      renderHook(() => usePinakesCard(URI, { recheck: true }));
      await advance(3_000);
      renderHook(() => usePinakesCard(URI, { recheck: true }));
      for (let i = 0; i < 300; i++) await advance(1_000);

      expect(freshReadTimes.length).toBeLessThanOrEqual(7);
      expect(freshReadTimes.at(-1)! - freshReadTimes[0]).toBeGreaterThanOrEqual(60_000);
    });

    it('reads a link no more than its schedule, however often its preview remounts', async () => {
      mocks.fetchCardByUri.mockResolvedValue(null);

      for (let i = 0; i < 3; i++) {
        const { unmount } = renderHook(() => usePinakesCard(URI, { recheck: true }));
        for (let s = 0; s < 6; s++) await advance(30_000);
        unmount();
      }

      expect(mocks.fetchCardByUri.mock.calls.filter(([params]) => params.fresh)).toHaveLength(7);
    });

    it('does not read a known card again', async () => {
      mocks.fetchCardByUri.mockResolvedValue(videoFixture);

      renderHook(() => usePinakesCard(videoFixture.uri, { recheck: true }));
      await advance(60_000);

      expect(mocks.fetchCardByUri).toHaveBeenCalledTimes(1);
    });
  });

  describe('resolve', () => {
    let n = 0;
    // Each test its own links: a link is resolved once per page load.
    const link = (name: string) => `https://example.com/resolve-${n}-${name}`;

    beforeEach(() => {
      n += 1;
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    it('asks Pinakes to read an unknown link once it has stayed, and shows the card it read', async () => {
      const uri = link('a');
      mocks.fetchCardByUri.mockResolvedValue(null);
      mocks.resolveCard.mockResolvedValue(videoFixture);

      const { result } = renderHook(() => usePinakesCard(uri, { resolve: true }));
      await advance(0);
      await advance(799);
      expect(mocks.resolveCard).not.toHaveBeenCalled();
      await advance(1);
      await advance(0);

      expect(mocks.resolveCard).toHaveBeenCalledWith({ uri });
      expect(result.current).toEqual({ data: videoFixture, isLoading: false, isError: false });
    });

    it('sends only the link as finally written, and none that was removed before the debounce', async () => {
      const typed = [link('h'), link('ht'), link('http')];
      mocks.fetchCardByUri.mockResolvedValue(null);
      mocks.resolveCard.mockResolvedValue(null);

      const { rerender, unmount } = renderHook(({ uri }) => usePinakesCard(uri, { resolve: true }), {
        initialProps: { uri: typed[0] },
      });
      await advance(0);
      await advance(300);
      rerender({ uri: typed[1] });
      await advance(0);
      await advance(300);
      rerender({ uri: typed[2] });
      await advance(0);
      await advance(800);
      expect(mocks.resolveCard.mock.calls).toEqual([[{ uri: typed[2] }]]);

      rerender({ uri: link('removed') });
      await advance(0);
      await advance(300);
      unmount();
      await advance(2_000);
      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
    });

    it('resolves a link once, however many previews show it', async () => {
      const uri = link('twice');
      mocks.fetchCardByUri.mockResolvedValue(null);
      mocks.resolveCard.mockResolvedValue(videoFixture);

      renderHook(() => usePinakesCard(uri, { resolve: true }));
      const second = renderHook(() => usePinakesCard(uri, { resolve: true }));
      await advance(0);
      await advance(800);
      await advance(0);

      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
      expect(second.result.current.data).toEqual(videoFixture);
    });

    it('does not ask Pinakes to read a link it already knows', async () => {
      mocks.fetchCardByUri.mockResolvedValue(videoFixture);

      renderHook(() => usePinakesCard(link('known'), { resolve: true }));
      await advance(5_000);

      expect(mocks.resolveCard).not.toHaveBeenCalled();
    });

    it('asks again for a link Pinakes refused before (a budget used up)', async () => {
      const uri = link('later');
      mocks.fetchCardByUri.mockResolvedValue(null);
      mocks.resolveCard.mockResolvedValueOnce(null).mockResolvedValueOnce(videoFixture);

      const first = renderHook(() => usePinakesCard(uri, { resolve: true }));
      await advance(0);
      await advance(800);
      await advance(0);
      first.unmount();
      const second = renderHook(() => usePinakesCard(uri, { resolve: true }));
      await advance(0);
      await advance(800);
      await advance(0);

      expect(mocks.resolveCard).toHaveBeenCalledTimes(2);
      expect(second.result.current.data).toEqual(videoFixture);
    });

    it('keeps no card (the link’s own preview) when Pinakes refuses the link', async () => {
      mocks.fetchCardByUri.mockResolvedValue(null);
      mocks.resolveCard.mockResolvedValue(null);

      const { result } = renderHook(() => usePinakesCard(link('refused'), { resolve: true }));
      await advance(0);
      await advance(800);

      expect(result.current).toEqual({ data: null, isLoading: false, isError: false });
    });

    it('leaves an unknown link to the resolve when asked to recheck it too, and rechecks a pending card', async () => {
      const unknown = link('recheck-unknown');
      const pending = link('recheck-pending');
      mocks.fetchCardByUri.mockImplementation(async ({ uri }: { uri: string }) =>
        uri === pending ? { ...videoFixture, uri, status: PinakesStatus.PENDING } : null,
      );
      mocks.resolveCard.mockResolvedValue(videoFixture);
      const fresh = (uri: string) =>
        mocks.fetchCardByUri.mock.calls.filter(([params]) => params.uri === uri && params.fresh).length;

      const { result } = renderHook(() => usePinakesCard(unknown, { resolve: true, recheck: true }));
      renderHook(() => usePinakesCard(pending, { resolve: true, recheck: true }));
      await advance(0);
      await advance(800);
      await advance(0);
      expect(result.current.data).toEqual(videoFixture);
      for (const delay of [2_000, 4_000, 8_000]) await advance(delay);

      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
      expect(fresh(unknown)).toBe(0);
      expect(fresh(pending)).toBeGreaterThan(0);
    });
  });
});

describe('usePinakesCard resolveOnView', () => {
  let n = 0;
  // Each test its own links and its own page load.
  const link = (name: string) => `https://www.youtube.com/watch?v=view${n}${name}`;

  beforeEach(() => {
    n += 1;
    vi.clearAllMocks();
    mocks.configured = true;
    resetViewResolves();
    mocks.fetchCardByUri.mockResolvedValue(null);
  });

  it('asks Pinakes to read a link it does not know at once, waiting for it, and shows the card it read', async () => {
    const uri = link('a');
    let answer: (card: typeof videoFixture) => void = () => {};
    mocks.resolveCard.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const { result } = renderHook(() => usePinakesCard(uri, { recheck: true, resolveOnView: true }));

    // Not polled by its ID: the card read's own re-reads follow a pending answer.
    await waitFor(() => expect(mocks.resolveCard).toHaveBeenCalledWith({ uri, poll: false }));
    expect(result.current.isResolving).toBe(true);
    await act(async () => answer(videoFixture));
    expect(result.current).toEqual({ data: videoFixture, isLoading: false, isError: false });
  });

  it('asks at most two links at once, the others in turn', async () => {
    const answers: ((card: null) => void)[] = [];
    mocks.resolveCard.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));

    for (const name of ['p', 'q', 'r', 's']) renderHook(() => usePinakesCard(link(name), { resolveOnView: true }));
    await waitFor(() => expect(mocks.resolveCard).toHaveBeenCalledTimes(2));

    await act(async () => answers[0](null));
    await waitFor(() => expect(mocks.resolveCard).toHaveBeenCalledTimes(3));
    expect(mocks.resolveCard.mock.calls[2][0]).toEqual({ uri: link('r'), poll: false });
  });

  it('sends no waiting ask whose previews are all gone (a link typed on, a box scrolled past)', async () => {
    const answers: ((card: null) => void)[] = [];
    mocks.resolveCard.mockImplementation(() => new Promise((resolve) => answers.push(resolve)));

    renderHook(() => usePinakesCard(link('w1'), { resolveOnView: true }));
    renderHook(() => usePinakesCard(link('w2'), { resolveOnView: true }));
    const gone = renderHook(() => usePinakesCard(link('w3'), { resolveOnView: true }));
    renderHook(() => usePinakesCard(link('w4'), { resolveOnView: true }));
    await waitFor(() => expect(mocks.resolveCard).toHaveBeenCalledTimes(2));
    gone.unmount();

    await act(async () => answers[0](null));
    await waitFor(() => expect(mocks.resolveCard).toHaveBeenCalledTimes(3));
    expect(mocks.resolveCard.mock.calls[2][0]).toEqual({ uri: link('w4'), poll: false });
  });

  it('asks no other link once Pinakes failed (a 5xx or no answer, told as busy), sending the waiting ones none', async () => {
    let fail: (answer: { busy: true; retryAfterMs: null }) => void = () => {};
    mocks.resolveCard
      .mockImplementationOnce(() => new Promise((resolve) => (fail = resolve)))
      .mockImplementation(() => new Promise(() => {}));

    renderHook(() => usePinakesCard(link('down-1'), { resolveOnView: true }));
    renderHook(() => usePinakesCard(link('down-2'), { resolveOnView: true }));
    renderHook(() => usePinakesCard(link('down-3'), { resolveOnView: true }));
    await waitFor(() => expect(mocks.resolveCard).toHaveBeenCalledTimes(2));
    await act(async () => fail({ busy: true, retryAfterMs: null }));
    renderHook(() => usePinakesCard(link('down-4'), { resolveOnView: true }));
    await act(async () => {});

    // down-3, waiting its turn, is not sent once the pause began; down-4 neither.
    expect(mocks.resolveCard).toHaveBeenCalledTimes(2);
  });

  it('asks a link once per page load, however many previews show it, also when Pinakes refused it', async () => {
    const uri = link('once');
    mocks.resolveCard.mockResolvedValue(null);

    const first = renderHook(() => usePinakesCard(uri, { resolveOnView: true }));
    await waitFor(() => expect(mocks.resolveCard).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(first.result.current.isResolving).toBeUndefined());
    first.unmount();
    const second = renderHook(() => usePinakesCard(uri, { resolveOnView: true }));
    await waitFor(() => expect(second.result.current).toEqual({ data: null, isLoading: false, isError: false }));

    expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
    expect(second.result.current.data).toBeNull();
  });

  it('asks nothing while Pinakes said it is busy, until its Retry-After has passed, then once more', async () => {
    vi.useFakeTimers();
    try {
      const busy = link('busy');
      const other = link('other');
      mocks.resolveCard.mockResolvedValueOnce({ busy: true, retryAfterMs: 30_000 }).mockResolvedValue(videoFixture);

      const first = renderHook(() => usePinakesCard(busy, { resolveOnView: true }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(first.result.current.data).toBeNull();
      // Another link while paused: not asked.
      const paused = renderHook(() => usePinakesCard(other, { resolveOnView: true }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
      expect(paused.result.current.data).toBeNull();

      await act(() => vi.advanceTimersByTimeAsync(30_000));
      first.unmount();
      const again = renderHook(() => usePinakesCard(busy, { resolveOnView: true }));
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(mocks.resolveCard).toHaveBeenCalledTimes(2);
      expect(again.result.current.data).toEqual(videoFixture);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pauses for its own default when Pinakes is busy with no Retry-After', async () => {
    vi.useFakeTimers();
    try {
      mocks.resolveCard.mockResolvedValueOnce({ busy: true, retryAfterMs: null }).mockResolvedValue(videoFixture);
      renderHook(() => usePinakesCard(link('x'), { resolveOnView: true }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(PINAKES_VIEW_RESOLVE_PAUSE_MS - 1_000));
      renderHook(() => usePinakesCard(link('y'), { resolveOnView: true }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);

      await act(() => vi.advanceTimersByTimeAsync(1_000));
      renderHook(() => usePinakesCard(link('z'), { resolveOnView: true }));
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(mocks.resolveCard).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never asks about a pubky link, a link that is not http(s), nor a link Pinakes knows', async () => {
    mocks.fetchCardByUri.mockImplementation(async ({ uri }: { uri: string }) =>
      uri.includes('known') ? videoFixture : null,
    );

    for (const uri of [
      'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/posts/0034A0X7NJ52G',
      'isbn:9780141036144',
      link('known'),
    ]) {
      const { result } = renderHook(() => usePinakesCard(uri, { resolveOnView: true }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
    }

    expect(mocks.resolveCard).not.toHaveBeenCalled();
  });

  it('asks nothing without resolveOnView', async () => {
    const { result } = renderHook(() => usePinakesCard(link('off'), { recheck: false }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mocks.resolveCard).not.toHaveBeenCalled();
  });
});

describe('usePinakesCard isResolving', () => {
  it('lets a preview of a link that is being read on demand (a post just published) wait for that read, asking nothing', async () => {
    vi.useFakeTimers();
    try {
      const uri = 'https://example.com/isresolving-joined';
      let answer: (card: typeof videoFixture) => void = () => {};
      mocks.fetchCardByUri.mockResolvedValue(null);
      mocks.resolveCard.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      // The composer has Pinakes read the link.
      const composer = renderHook(() => usePinakesCard(uri, { resolve: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PINAKES_RESOLVE_DEBOUNCE_MS + 10);
      });
      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);

      // The published post's preview of it, read while that read is in flight.
      const post = renderHook(() => usePinakesCard(uri));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PINAKES_RESOLVE_DEBOUNCE_MS + 10);
      });
      expect(post.result.current).toEqual({ data: null, isLoading: false, isError: false, isResolving: true });
      expect(mocks.resolveCard).toHaveBeenCalledTimes(1);

      await act(async () => {
        answer(videoFixture);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(post.result.current).toEqual({ data: videoFixture, isLoading: false, isError: false });
      expect(composer.result.current.data).toEqual(videoFixture);
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing is being read for an unknown link no one asked Pinakes to read', async () => {
    mocks.fetchCardByUri.mockResolvedValue(null);
    const { result } = renderHook(() => usePinakesCard('https://example.com/isresolving-nobody'));

    await waitFor(() => expect(result.current).toEqual({ data: null, isLoading: false, isError: false }));
    expect(mocks.resolveCard).not.toHaveBeenCalled();
  });

  it('says a resolve is in flight for a link Pinakes did not know, until it is answered', async () => {
    vi.useFakeTimers();
    try {
      const uri = 'https://example.com/isresolving-1';
      mocks.fetchCardByUri.mockResolvedValue(null);
      mocks.resolveCard.mockResolvedValue(null);
      const { result } = renderHook(() => usePinakesCard(uri, { resolve: true }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.data).toBeNull();
      expect(result.current.isResolving).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(PINAKES_RESOLVE_DEBOUNCE_MS + 10);
      });
      expect(result.current.isResolving).toBeFalsy();
    } finally {
      vi.useRealTimers();
    }
  });
});
