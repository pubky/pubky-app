import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMobileAuth } from './useMobileAuth';

const mockFetchUrl = vi.fn();
const mockCopyAuthUrl = vi.fn();
const mockUseAuthUrl = vi.fn();

vi.mock('../useAuthUrl/useAuthUrl', () => ({
  useAuthUrl: (...args: unknown[]) => mockUseAuthUrl(...args),
}));

describe('useMobileAuth', () => {
  const defaultAuthUrlReturn = {
    url: 'pubkyauth://signin?token=test123',
    isLoading: false,
    isExpired: false,
    fetchUrl: mockFetchUrl,
    copyAuthUrl: mockCopyAuthUrl,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuthUrl.mockReturnValue(defaultAuthUrlReturn);
  });

  it('returns useAuthUrl data plus hook values', () => {
    const { result } = renderHook(() => useMobileAuth());

    expect(result.current.url).toBe('pubkyauth://signin?token=test123');
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.fetchUrl).toBe(mockFetchUrl);
    expect(result.current.copyAuthUrl).toBe(mockCopyAuthUrl);
    expect(result.current.isOpeningRing).toBe(false);
    expect(result.current.onAuthorizeClick).toBeInstanceOf(Function);
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

  it('onAuthorizeClick navigates to deeplink url and sets isOpeningRing', () => {
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: mockLocation });

    const { result } = renderHook(() => useMobileAuth());

    act(() => {
      result.current.onAuthorizeClick();
    });

    expect(result.current.isOpeningRing).toBe(true);
    expect(mockLocation.href).toBe('pubkyauth://signin?token=test123');

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('cleans up visibility listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    const originalLocation = window.location;
    const mockLocation = { ...originalLocation, href: '' };
    Object.defineProperty(window, 'location', { configurable: true, value: mockLocation });

    const { result, unmount } = renderHook(() => useMobileAuth());

    act(() => {
      result.current.onAuthorizeClick();
    });

    unmount();

    expect(removeSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
    removeSpy.mockRestore();
  });

  it('passes options through to useAuthUrl', () => {
    renderHook(() => useMobileAuth({ type: 'signup', inviteCode: 'ABC-123' }));

    expect(mockUseAuthUrl).toHaveBeenCalledWith({ type: 'signup', inviteCode: 'ABC-123' });
  });
});
