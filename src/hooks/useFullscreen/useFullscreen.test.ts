import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/molecules/Toaster/toast';
import { useFullscreen } from './useFullscreen';

vi.mock('@/molecules/Toaster/toast', () => ({ toast: vi.fn() }));

const requestFullscreen = vi.fn<() => Promise<void>>();
const exitFullscreen = vi.fn<() => Promise<void>>();

/** jsdom has no Fullscreen API: stub the parts the hook reads and drive `fullscreenchange` by hand. */
function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
  document.dispatchEvent(new Event('fullscreenchange'));
}

describe('useFullscreen', () => {
  beforeEach(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    requestFullscreen.mockReset().mockImplementation(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
    });
    exitFullscreen.mockReset().mockImplementation(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
    });
    document.documentElement.requestFullscreen = requestFullscreen;
    document.exitFullscreen = exitFullscreen;
  });

  afterEach(() => {
    vi.mocked(toast).mockReset();
  });

  it('reports support once mounted', () => {
    const { result } = renderHook(() => useFullscreen());

    expect(result.current.isSupported).toBe(true);
    expect(result.current.isFullscreen).toBe(false);
  });

  it('reports no support where the browser has no Fullscreen API', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: false });

    const { result } = renderHook(() => useFullscreen());

    expect(result.current.isSupported).toBe(false);
  });

  it('requests document fullscreen on toggle and tracks the change event', async () => {
    const { result } = renderHook(() => useFullscreen());

    await act(async () => {
      await result.current.toggle();
    });
    act(() => setFullscreenElement(document.documentElement));

    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(result.current.isFullscreen).toBe(true);
  });

  it('exits fullscreen on toggle while it is active', async () => {
    const { result } = renderHook(() => useFullscreen());
    act(() => setFullscreenElement(document.documentElement));

    await act(async () => {
      await result.current.toggle();
    });
    act(() => setFullscreenElement(null));

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).not.toHaveBeenCalled();
    expect(result.current.isFullscreen).toBe(false);
  });

  it('toasts when the browser refuses the request', async () => {
    requestFullscreen.mockRejectedValueOnce(new TypeError('denied'));
    const { result } = renderHook(() => useFullscreen());

    await act(async () => {
      await result.current.toggle();
    });

    expect(toast).toHaveBeenCalledWith({ variant: 'error', description: 'Could not enter fullscreen.' });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('leaves fullscreen it entered when the caller unmounts', async () => {
    const { result, unmount } = renderHook(() => useFullscreen());

    await act(async () => {
      await result.current.toggle();
    });
    act(() => setFullscreenElement(document.documentElement));
    unmount();

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it('does not touch fullscreen it did not enter when the caller unmounts', () => {
    const { unmount } = renderHook(() => useFullscreen());
    act(() => setFullscreenElement(document.documentElement));

    unmount();

    expect(exitFullscreen).not.toHaveBeenCalled();
  });
});
