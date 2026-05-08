import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSmsVerificationInfo } from './useSmsVerificationInfo';

// Mock direct dependencies
const mockGetSmsVerificationInfo = vi.fn();
const mockGetQueryData = vi.fn();
vi.mock('@/controllers/homegate/homegate', () => ({
  HomegateController: {
    getSmsVerificationInfo: () => mockGetSmsVerificationInfo(),
  },
}));
vi.mock('@/services/homegate/homegate.query-client', () => ({
  homegateQueryClient: {
    getQueryData: () => mockGetQueryData(),
  },
}));
vi.mock('@/services/homegate/homegate.constants', () => ({
  HOMEGATE_QUERY_KEYS: {
    lnVerificationInfo: ['homegate', 'ln-verification-info'],
    smsVerificationInfo: ['homegate', 'sms-verification-info'],
  },
}));

describe('useSmsVerificationInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQueryData.mockReturnValue(undefined); // No cached data by default
  });

  it('returns null initially while loading when no cached data', () => {
    mockGetSmsVerificationInfo.mockReturnValue(new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useSmsVerificationInfo());

    expect(result.current).toBeNull();
  });

  it('returns cached data immediately when available', () => {
    mockGetQueryData.mockReturnValue({ available: true });
    mockGetSmsVerificationInfo.mockReturnValue(new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useSmsVerificationInfo());

    // Should return cached data synchronously, no need to wait
    expect(result.current).toEqual({ available: true });
  });

  it('returns available: true when SMS verification is available', async () => {
    mockGetSmsVerificationInfo.mockResolvedValue({ available: true });

    const { result } = renderHook(() => useSmsVerificationInfo());

    await waitFor(() => {
      expect(result.current).toEqual({ available: true });
    });
  });

  it('returns available: false when SMS verification is geoblocked', async () => {
    mockGetSmsVerificationInfo.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useSmsVerificationInfo());

    await waitFor(() => {
      expect(result.current).toEqual({ available: false });
    });
  });

  it('returns available: false with error: true when API call fails (non-403)', async () => {
    // Issue #919: Generic errors should be distinguishable from geoblocking
    mockGetSmsVerificationInfo.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSmsVerificationInfo());

    // Wait for the effect to complete and return error state
    await waitFor(() => {
      expect(result.current).toEqual({ available: false, error: true });
    });
  });

  it('returns available: false without error flag when geoblocked (403)', async () => {
    // Geoblocking returns { available: false } without error flag
    mockGetSmsVerificationInfo.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useSmsVerificationInfo());

    await waitFor(() => {
      expect(result.current).toEqual({ available: false });
      // Should NOT have error flag for geoblocking
      expect(result.current?.error).toBeUndefined();
    });
  });

  it('calls HomegateController.getSmsVerificationInfo on mount', async () => {
    mockGetSmsVerificationInfo.mockResolvedValue({ available: true });

    renderHook(() => useSmsVerificationInfo());

    await waitFor(() => {
      expect(mockGetSmsVerificationInfo).toHaveBeenCalledTimes(1);
    });
  });
});
