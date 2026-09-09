import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NexusSocialGraphStatus } from '@/services/nexus/nexus.types';
import { useSocialGraphStatus } from './useSocialGraphStatus';

// What the (mocked) live query resolves to: `undefined` = not resolved yet,
// `null` = cache miss (fetch arm fires), `{ status }` = cached tier.
const mockState = vi.hoisted(() => ({
  liveQueryValue: undefined as unknown,
}));

// Mock direct dependencies
const mockGetSocialGraphStatus = vi.fn();
const mockFetch = vi.fn().mockResolvedValue(undefined);
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getSocialGraphStatus: (params: { userId: string }) => mockGetSocialGraphStatus(params),
    fetch: (params: { userId: string }) => mockFetch(params),
  },
}));

// Mock dexie-react-hooks: run the query (so the controller call can be asserted) and hand
// the hook a controlled value instead of the real IndexedDB read.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (queryFn: () => Promise<unknown>) => {
    queryFn();
    return mockState.liveQueryValue;
  },
}));

describe('useSocialGraphStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.liveQueryValue = undefined;
    mockGetSocialGraphStatus.mockReturnValue(null);
  });

  it('returns null status and isLoading true before the local read resolves', () => {
    const { result } = renderHook(() => useSocialGraphStatus('target-user'));

    expect(result.current.status).toBeNull();
    expect(result.current.isLoading).toBe(true);
  });

  it('returns the cached tier', () => {
    mockState.liveQueryValue = { status: NexusSocialGraphStatus.ESTABLISHED };

    const { result } = renderHook(() => useSocialGraphStatus('target-user'));

    expect(result.current.status).toBe(NexusSocialGraphStatus.ESTABLISHED);
    expect(result.current.isLoading).toBe(false);
  });

  it('returns null status when Nexus has no ranking for the user', () => {
    mockState.liveQueryValue = { status: null };

    const { result } = renderHook(() => useSocialGraphStatus('target-user'));

    expect(result.current.status).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('reads the tier for the given user', () => {
    renderHook(() => useSocialGraphStatus('user-123'));

    expect(mockGetSocialGraphStatus).toHaveBeenCalledWith({ userId: 'user-123' });
  });

  it('does not query when userId is missing', () => {
    const { result } = renderHook(() => useSocialGraphStatus(null));

    expect(mockGetSocialGraphStatus).not.toHaveBeenCalled();
    expect(result.current.status).toBeNull();
  });

  it('fetches the full user view once on a cache miss', async () => {
    mockState.liveQueryValue = null;

    const { result } = renderHook(() => useSocialGraphStatus('target-user'));

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith({ userId: 'target-user' });
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBeNull();
  });

  it('does not fetch when the tier is already cached, including a cached "no ranking"', () => {
    mockState.liveQueryValue = { status: null };

    renderHook(() => useSocialGraphStatus('target-user'));

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
