import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLnVerificationInfo } from './useLnVerificationInfo';

// Mock direct dependencies
const mockGetLnVerificationInfo = vi.fn();
const mockGetQueryData = vi.fn();
vi.mock('@/controllers/homegate/homegate', () => ({
  HomegateController: {
    getLnVerificationInfo: () => mockGetLnVerificationInfo(),
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

describe('useLnVerificationInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetQueryData.mockReturnValue(undefined); // No cached data by default
  });

  it('returns null initially while loading when no cached data', () => {
    mockGetLnVerificationInfo.mockReturnValue(new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useLnVerificationInfo());

    expect(result.current).toBeNull();
  });

  it('returns cached data immediately when available', () => {
    mockGetQueryData.mockReturnValue({ available: true, amountSat: 1000 });
    mockGetLnVerificationInfo.mockReturnValue(new Promise(() => {})); // Never resolves

    const { result } = renderHook(() => useLnVerificationInfo());

    // Should return cached data synchronously, no need to wait
    expect(result.current).toEqual({ available: true, amountSat: 1000 });
  });

  it('returns available: true with amountSat when LN verification is available', async () => {
    mockGetLnVerificationInfo.mockResolvedValue({ available: true, amountSat: 1000 });

    const { result } = renderHook(() => useLnVerificationInfo());

    await waitFor(() => {
      expect(result.current).toEqual({ available: true, amountSat: 1000 });
    });
  });

  it('returns available: false when LN verification is geoblocked', async () => {
    mockGetLnVerificationInfo.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useLnVerificationInfo());

    await waitFor(() => {
      expect(result.current).toEqual({ available: false });
    });
  });

  it('returns available: false with error: true when API call fails (non-403)', async () => {
    // Issue #919: Generic errors should be distinguishable from geoblocking
    mockGetLnVerificationInfo.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLnVerificationInfo());

    // Wait for the effect to complete and return error state
    await waitFor(() => {
      expect(result.current).toEqual({ available: false, error: true });
    });
  });

  it('returns available: false without error flag when geoblocked (403)', async () => {
    // Geoblocking returns { available: false } without error flag
    mockGetLnVerificationInfo.mockResolvedValue({ available: false });

    const { result } = renderHook(() => useLnVerificationInfo());

    await waitFor(() => {
      expect(result.current).toEqual({ available: false });
      // Should NOT have error flag for geoblocking
      expect((result.current as { available: false; error?: boolean })?.error).toBeUndefined();
    });
  });

  it('calls HomegateController.getLnVerificationInfo on mount', async () => {
    mockGetLnVerificationInfo.mockResolvedValue({ available: true, amountSat: 500 });

    renderHook(() => useLnVerificationInfo());

    await waitFor(() => {
      expect(mockGetLnVerificationInfo).toHaveBeenCalledTimes(1);
    });
  });

  it('returns correct amountSat value', async () => {
    mockGetLnVerificationInfo.mockResolvedValue({ available: true, amountSat: 2500 });

    const { result } = renderHook(() => useLnVerificationInfo());

    await waitFor(() => {
      expect(result.current?.available).toBe(true);
      if (result.current?.available) {
        expect(result.current.amountSat).toBe(2500);
      }
    });
  });
});
