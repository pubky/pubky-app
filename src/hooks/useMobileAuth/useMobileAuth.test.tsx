import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMobileAuth } from './useMobileAuth';

const mockFetchUrl = vi.fn();
const mockUseAuthUrl = vi.fn();

vi.mock('../useAuthUrl', () => ({
  useAuthUrl: (...args: unknown[]) => mockUseAuthUrl(...args),
}));

vi.mock('@/config', () => ({
  APP_STORE_URL: 'https://apps.apple.com/app/pubky-ring',
  PLAY_STORE_URL: 'https://play.google.com/store/apps/details?id=to.pubky.ring',
}));

describe('useMobileAuth', () => {
  const defaultAuthUrlReturn = {
    url: 'pubkyauth://signin?token=test123',
    isLoading: false,
    fetchUrl: mockFetchUrl,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthUrl.mockReturnValue(defaultAuthUrlReturn);
    // Default: non-iOS user agent
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 10) Chrome/91.0',
    });
  });

  it('returns useAuthUrl data plus platform-specific values', () => {
    const { result } = renderHook(() => useMobileAuth());

    expect(result.current.url).toBe('pubkyauth://signin?token=test123');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchUrl).toBe(mockFetchUrl);
    expect(result.current.isIOS).toBe(false);
    expect(result.current.isOpeningRing).toBe(false);
    expect(result.current.onAuthorizeClick).toBeInstanceOf(Function);
  });

  it('returns isIOS true for iPhone user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
    });

    const { result } = renderHook(() => useMobileAuth());

    expect(result.current.isIOS).toBe(true);
  });

  it('returns isIOS true for iPad user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X)',
    });

    const { result } = renderHook(() => useMobileAuth());

    expect(result.current.isIOS).toBe(true);
  });

  it('onAuthorizeClick calls fetchUrl when url is empty', () => {
    mockUseAuthUrl.mockReturnValue({ ...defaultAuthUrlReturn, url: '' });

    const { result } = renderHook(() => useMobileAuth());

    act(() => {
      result.current.onAuthorizeClick();
    });

    expect(mockFetchUrl).toHaveBeenCalled();
  });

  it('onAuthorizeClick does nothing when isLoading', () => {
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: mockLocation });

    mockUseAuthUrl.mockReturnValue({ ...defaultAuthUrlReturn, isLoading: true });

    const { result } = renderHook(() => useMobileAuth());

    act(() => {
      result.current.onAuthorizeClick();
    });

    expect(mockFetchUrl).not.toHaveBeenCalled();
    expect(mockLocation.href).toBe('');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('onAuthorizeClick navigates to url on iOS', () => {
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: mockLocation });

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
    });

    const { result } = renderHook(() => useMobileAuth());

    act(() => {
      result.current.onAuthorizeClick();
    });

    expect(result.current.isOpeningRing).toBe(true);
    expect(mockLocation.href).toBe('pubkyauth://signin?token=test123');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('onAuthorizeClick falls back to Play Store on Android when page stays visible', () => {
    vi.useFakeTimers();
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: mockLocation });

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/121.0',
    });

    const { result } = renderHook(() => useMobileAuth());

    act(() => {
      result.current.onAuthorizeClick();
    });
    expect(result.current.isOpeningRing).toBe(true);
    expect(mockLocation.href).toBe('pubkyauth://signin?token=test123');

    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(result.current.isOpeningRing).toBe(false);
    expect(mockLocation.href).toBe('https://play.google.com/store/apps/details?id=to.pubky.ring');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.useRealTimers();
  });

  it('cleans up pending fallback timer on unmount', () => {
    vi.useFakeTimers();
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: mockLocation });

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) Chrome/121.0',
    });

    const { result, unmount } = renderHook(() => useMobileAuth());

    act(() => {
      result.current.onAuthorizeClick();
    });
    expect(mockLocation.href).toBe('pubkyauth://signin?token=test123');

    unmount();

    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(mockLocation.href).toBe('pubkyauth://signin?token=test123');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    vi.useRealTimers();
  });

  it('passes options through to useAuthUrl', () => {
    renderHook(() => useMobileAuth({ type: 'signup', inviteCode: 'ABC-123' }));

    expect(mockUseAuthUrl).toHaveBeenCalledWith({ type: 'signup', inviteCode: 'ABC-123' });
  });
});
