import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import videoFixture from '@/services/pinakes/fixtures/by-uri.video.json';
import { PINAKES_RESOLVE_DEBOUNCE_MS, usePinakesCard } from './usePinakesCard';

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
  });
});

describe('usePinakesCard isResolving', () => {
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
