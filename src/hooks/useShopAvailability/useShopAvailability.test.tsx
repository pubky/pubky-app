import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopEmbedController } from '@/controllers/shop-embed/shop-embed';
import { useShopAvailability } from './useShopAvailability';

vi.mock('@/controllers/shop-embed/shop-embed', () => ({
  ShopEmbedController: { fetchAvailability: vi.fn() },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(ShopEmbedController.fetchAvailability).mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useShopAvailability', () => {
  it('resets consecutive loaded-frame failures on success and spaces focus/reconnect retries', async () => {
    const recover = vi.fn();
    const { result, unmount } = renderHook(() => useShopAvailability(recover));
    await act(async () => {});
    act(() => result.current.markLoaded());
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValue(false);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(result.current.unavailable).toBe(false);
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledTimes(3);
    for (let i = 0; i < 3; i++) {
      act(() => window.dispatchEvent(new Event('focus')));
      act(() => window.dispatchEvent(new Event('online')));
    }
    await act(() => vi.advanceTimersByTimeAsync(9_999));
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledTimes(3);
    expect(result.current.unavailable).toBe(false);
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValueOnce(true);
    await act(() => vi.advanceTimersByTimeAsync(1));
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(result.current.unavailable).toBe(false);
    // Repeated iframe handshakes must not reset the existing failure streak.
    act(() => result.current.markLoaded());
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.unavailable).toBe(true);
    expect(recover).not.toHaveBeenCalled();
    unmount();
  });

  it('does not probe or show an outage when initially offline', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result, unmount } = renderHook(() => useShopAvailability(vi.fn()));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(ShopEmbedController.fetchAvailability).not.toHaveBeenCalled();
    expect(result.current.unavailable).toBe(false);
    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledOnce();
    unmount();
  });

  it.each(['offline', 'hidden'] as const)(
    'pauses polling and discards an in-flight failure across an %s interval',
    async (reason) => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
      const recover = vi.fn();
      const { result, unmount } = renderHook(() => useShopAvailability(recover));
      await act(async () => {});
      act(() => result.current.markLoaded());
      vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValue(false);
      await act(() => vi.advanceTimersByTimeAsync(20_000));
      let finish!: (ready: boolean) => void;
      vi.mocked(ShopEmbedController.fetchAvailability).mockReturnValueOnce(
        new Promise((resolve) => (finish = resolve)),
      );
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      if (reason === 'offline') {
        online.mockReturnValue(false);
        act(() => window.dispatchEvent(new Event('offline')));
      } else {
        hidden.mockReturnValue(true);
        act(() => document.dispatchEvent(new Event('visibilitychange')));
      }
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      act(() => window.dispatchEvent(new Event('focus')));
      expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledTimes(4);
      expect(result.current.unavailable).toBe(false);
      online.mockReturnValue(true);
      hidden.mockReturnValue(false);
      act(() =>
        reason === 'offline'
          ? window.dispatchEvent(new Event('online'))
          : document.dispatchEvent(new Event('visibilitychange')),
      );
      // This response belongs to the old network/visibility interval.
      await act(async () => finish(false));
      expect(result.current.unavailable).toBe(false);
      await act(() => vi.advanceTimersByTimeAsync(20_000));
      expect(result.current.unavailable).toBe(false);
      await act(() => vi.advanceTimersByTimeAsync(10_000));
      expect(result.current.unavailable).toBe(true);
      expect(recover).not.toHaveBeenCalled();
      unmount();
    },
  );

  it('ignores a failure that finishes while offline and resumes with a fresh streak', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { result, unmount } = renderHook(() => useShopAvailability(vi.fn()));
    await act(async () => {});
    act(() => result.current.markLoaded());
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValue(false);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    let finish!: (ready: boolean) => void;
    vi.mocked(ShopEmbedController.fetchAvailability).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    online.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event('offline')));
    await act(async () => finish(false));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(result.current.unavailable).toBe(false);
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledTimes(4);
    online.mockReturnValue(true);
    await act(async () => window.dispatchEvent(new Event('online')));
    expect(result.current.unavailable).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.unavailable).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.unavailable).toBe(true);
    unmount();
  });

  it('pauses hidden tabs and resumes on visibility change without a focus event', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const { unmount } = renderHook(() => useShopAvailability(vi.fn()));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(ShopEmbedController.fetchAvailability).not.toHaveBeenCalled();
    hidden.mockReturnValue(false);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledOnce();
    hidden.mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledOnce();
    unmount();
  });

  it('preserves a healthy Shop and automatically recovers once after an outage', async () => {
    const recover = vi.fn();
    const { result, unmount } = renderHook(() => useShopAvailability(recover));
    await act(async () => {});
    expect(result.current.unavailable).toBe(false);
    expect(recover).not.toHaveBeenCalled();
    act(() => result.current.markLoaded());
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValue(false);
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(result.current.unavailable).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.unavailable).toBe(true);
    expect(recover).not.toHaveBeenCalled();
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValue(true);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(result.current.unavailable).toBe(false);
    expect(recover).toHaveBeenCalledOnce();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(recover).toHaveBeenCalledOnce();
    unmount();
  });

  it('retries network failures immediately on reconnect or focus without overlapping requests', async () => {
    vi.mocked(ShopEmbedController.fetchAvailability).mockRejectedValueOnce(new TypeError('offline'));
    const recover = vi.fn();
    const { result, unmount } = renderHook(() => useShopAvailability(recover));
    await act(async () => {});
    expect(result.current.unavailable).toBe(true);
    let finish!: (ready: boolean) => void;
    vi.mocked(ShopEmbedController.fetchAvailability).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    act(() => window.dispatchEvent(new Event('online')));
    act(() => window.dispatchEvent(new Event('focus')));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledTimes(2);
    await act(async () => finish(true));
    expect(result.current.unavailable).toBe(false);
    expect(recover).toHaveBeenCalledOnce();
    unmount();
  });

  it('aborts on unmount and ignores a late successful response', async () => {
    vi.mocked(ShopEmbedController.fetchAvailability).mockResolvedValueOnce(false);
    const recover = vi.fn();
    const { unmount } = renderHook(() => useShopAvailability(recover));
    await act(async () => {});
    let finish!: (ready: boolean) => void;
    vi.mocked(ShopEmbedController.fetchAvailability).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    act(() => window.dispatchEvent(new Event('focus')));
    const signal = vi.mocked(ShopEmbedController.fetchAvailability).mock.lastCall![0];
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish(true));
    act(() => window.dispatchEvent(new Event('online')));
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(ShopEmbedController.fetchAvailability).toHaveBeenCalledTimes(2);
    expect(recover).not.toHaveBeenCalled();
  });
});
