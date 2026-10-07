import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PWA_STANDALONE_MEDIA_QUERY } from '@/config/pwa';
import { useIsStandalone } from './useIsStandalone';

type ChangeListener = () => void;

function installMatchMedia(matches: boolean) {
  const listeners = new Set<ChangeListener>();
  const mediaQueryList = {
    matches,
    media: PWA_STANDALONE_MEDIA_QUERY,
    addEventListener: vi.fn((_type: string, listener: ChangeListener) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: ChangeListener) => listeners.delete(listener)),
  };
  const matchMedia = vi.fn(() => mediaQueryList);
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: matchMedia });
  return {
    matchMedia,
    mediaQueryList,
    setMatches(next: boolean) {
      mediaQueryList.matches = next;
      listeners.forEach((listener) => listener());
    },
  };
}

describe('useIsStandalone', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    Reflect.deleteProperty(window.navigator, 'standalone');
  });

  it('is false without matchMedia support', () => {
    const { result } = renderHook(() => useIsStandalone());
    expect(result.current).toBe(false);
  });

  it('reflects the display-mode media query and its changes', () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useIsStandalone());
    expect(result.current).toBe(false);
    expect(media.matchMedia).toHaveBeenCalledWith(PWA_STANDALONE_MEDIA_QUERY);

    act(() => media.setMatches(true));
    expect(result.current).toBe(true);
  });

  it('treats an iOS home-screen launch as standalone', () => {
    installMatchMedia(false);
    Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: true });

    const { result } = renderHook(() => useIsStandalone());
    expect(result.current).toBe(true);
  });

  it('unsubscribes from the media query on unmount', () => {
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useIsStandalone());

    unmount();

    expect(media.mediaQueryList.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
