import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileAuth } from './useMobileAuth';

const mockFetchUrl = vi.fn();
const mockCopyAuthUrl = vi.fn();
const mockUseAuthUrl = vi.fn();

vi.mock('../useAuthUrl/useAuthUrl', () => ({
  useAuthUrl: (...args: unknown[]) => mockUseAuthUrl(...args),
}));

const GRANT_QUERY =
  'caps=%2Fpub%2Fpubky.app%2F%3Arw%2C%2Fpriv%2Fsocial%2F%3Arw&relay=https%3A%2F%2Frelay.example%2Finbox%2F&secret=a%2Bb_c&cid=pubky.app&cpk=key';
const GRANT_URL = `pubkyauth://signin_grant?${GRANT_QUERY}`;
const BITKIT_IOS_URL = `bitkit://pubky-auth/signin?${GRANT_QUERY}`;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile';
const SIGNERS = [
  { name: 'Ring', action: 'onAuthorizeClick', opening: 'isOpeningRing' },
  { name: 'Bitkit', action: 'onAuthorizeBitkitClick', opening: 'isOpeningBitkit' },
] as const;

function stubDevice(userAgent: string, platform: string, maxTouchPoints: number) {
  vi.stubGlobal('navigator', { userAgent, platform, maxTouchPoints });
}

describe('useMobileAuth', () => {
  const defaultAuthUrlReturn = {
    url: GRANT_URL,
    isLoading: false,
    isExpired: false,
    fetchUrl: mockFetchUrl,
    copyAuthUrl: mockCopyAuthUrl,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthUrl.mockReturnValue(defaultAuthUrlReturn);
    vi.stubGlobal('location', { href: '' });
    stubDevice(ANDROID, 'Linux armv8l', 5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns the shared auth URL and actions for both signers', () => {
    const { result } = renderHook(() => useMobileAuth());

    expect(result.current.url).toBe(GRANT_URL);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.fetchUrl).toBe(mockFetchUrl);
    expect(result.current.copyAuthUrl).toBe(mockCopyAuthUrl);
    expect(result.current.isOpeningRing).toBe(false);
    expect(result.current.isOpeningBitkit).toBe(false);
    expect(result.current.onAuthorizeClick).toBeInstanceOf(Function);
    expect(result.current.onAuthorizeBitkitClick).toBeInstanceOf(Function);
  });

  describe.each(SIGNERS)('$name handoff', ({ action, opening }) => {
    it('refreshes an expired grant without navigating until its URL is ready', () => {
      mockUseAuthUrl.mockReturnValue({ ...defaultAuthUrlReturn, url: '', isExpired: true });
      const { result } = renderHook(() => useMobileAuth());

      act(() => result.current[action]());

      expect(mockFetchUrl).toHaveBeenCalledTimes(1);
      expect(window.location.href).toBe('');
      expect(result.current.isOpeningRing).toBe(false);
      expect(result.current.isOpeningBitkit).toBe(false);
    });

    it('does nothing while the grant is loading', () => {
      mockUseAuthUrl.mockReturnValue({ ...defaultAuthUrlReturn, isLoading: true });
      const { result } = renderHook(() => useMobileAuth());

      act(() => result.current[action]());

      expect(mockFetchUrl).not.toHaveBeenCalled();
      expect(window.location.href).toBe('');
      expect(result.current[opening]).toBe(false);
    });

    it('opens the existing grant synchronously without creating another flow on Android', () => {
      const { result } = renderHook(() => useMobileAuth());

      act(() => {
        result.current[action]();
        expect(window.location.href).toBe(GRANT_URL);
      });

      expect(result.current[opening]).toBe(true);
      expect(result.current.isOpeningRing).toBe(opening === 'isOpeningRing');
      expect(result.current.isOpeningBitkit).toBe(opening === 'isOpeningBitkit');
      expect(result.current.url).toBe(GRANT_URL);
      expect(mockFetchUrl).not.toHaveBeenCalled();
    });

    it('resets the opening state when the page becomes hidden', () => {
      const { result } = renderHook(() => useMobileAuth());
      act(() => result.current[action]());
      expect(result.current[opening]).toBe(true);

      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      act(() => document.dispatchEvent(new Event('visibilitychange')));

      expect(result.current.isOpeningRing).toBe(false);
      expect(result.current.isOpeningBitkit).toBe(false);
      expect(mockFetchUrl).not.toHaveBeenCalled();
    });

    it.each([
      { name: 'loading a new grant', isLoading: true, isExpired: false },
      { name: 'grant expiration', isLoading: false, isExpired: true },
    ])('resets the opening state on $name', ({ isLoading, isExpired }) => {
      const { result, rerender } = renderHook(() => useMobileAuth());
      act(() => result.current[action]());
      expect(result.current[opening]).toBe(true);

      mockUseAuthUrl.mockReturnValue({ ...defaultAuthUrlReturn, url: '', isLoading, isExpired });
      rerender();

      expect(result.current.isOpeningRing).toBe(false);
      expect(result.current.isOpeningBitkit).toBe(false);
    });

    it('cleans up the visibility listener on unmount', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const { result, unmount } = renderHook(() => useMobileAuth());
      act(() => result.current[action]());

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });
  });

  it.each([
    ['iPhone', IPHONE, 'iPhone', 5],
    ['iPadOS reporting a Mac with touch', MAC, 'MacIntel', 5],
  ])(
    'opens Bitkit on %s with the same grant query and keeps QR/copy unchanged',
    (_, userAgent, platform, touchPoints) => {
      stubDevice(userAgent, platform, touchPoints);
      const { result } = renderHook(() => useMobileAuth());

      act(() => {
        result.current.onAuthorizeBitkitClick();
        expect(window.location.href).toBe(BITKIT_IOS_URL);
      });

      expect(result.current.isOpeningBitkit).toBe(true);
      expect(result.current.isOpeningRing).toBe(false);
      expect(result.current.url).toBe(GRANT_URL);
      expect(result.current.copyAuthUrl).toBe(mockCopyAuthUrl);
      expect(mockFetchUrl).not.toHaveBeenCalled();
    },
  );

  it('keeps the Ring grant URL on iPhone', () => {
    stubDevice(IPHONE, 'iPhone', 5);
    const { result } = renderHook(() => useMobileAuth());

    act(() => result.current.onAuthorizeClick());

    expect(window.location.href).toBe(GRANT_URL);
    expect(result.current.isOpeningRing).toBe(true);
    expect(result.current.isOpeningBitkit).toBe(false);
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it('switches from Ring to Bitkit on iPhone without creating another grant', () => {
    stubDevice(IPHONE, 'iPhone', 5);
    const { result } = renderHook(() => useMobileAuth());
    act(() => result.current.onAuthorizeClick());
    expect(window.location.href).toBe(GRANT_URL);

    act(() => result.current.onAuthorizeBitkitClick());

    expect(window.location.href).toBe(BITKIT_IOS_URL);
    expect(result.current.isOpeningBitkit).toBe(true);
    expect(result.current.isOpeningRing).toBe(false);
    expect(result.current.url).toBe(GRANT_URL);
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it('keeps the original grant URL for Bitkit on a desktop Mac', () => {
    stubDevice(MAC, 'MacIntel', 0);
    const { result } = renderHook(() => useMobileAuth());

    act(() => result.current.onAuthorizeBitkitClick());

    expect(window.location.href).toBe(GRANT_URL);
    expect(mockFetchUrl).not.toHaveBeenCalled();
  });

  it('passes auth options through without selecting a different grant flow', () => {
    renderHook(() => useMobileAuth({ type: 'signup', inviteCode: 'ABC-123' }));

    expect(mockUseAuthUrl).toHaveBeenCalledWith({ type: 'signup', inviteCode: 'ABC-123' });
  });
});
