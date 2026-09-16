import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBKY_52_STAGING_FIXTURE } from '@/test-utils/pubky';
import { useIsFollowing } from './useIsFollowing';

const VALID_TARGET = PUBKY_52_STAGING_FIXTURE;
const OTHER_VALID_TARGET = '5a1diz4pghi47ywdfyfzpit5f3bdomzt4pugpbmq4rngdd4iub4y';

// Hoist mock data
const mockState = vi.hoisted(() => ({
  currentUserPubky: null as string | null,
}));

// Mock direct dependencies
const mockGetRelationships = vi.fn();
const mockFetch = vi.fn().mockResolvedValue(undefined);
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getRelationships: (params: { userId: string }) => mockGetRelationships(params),
    fetch: (params: { userId: string }) => mockFetch(params),
  },
}));
const mockSubscribeUser = vi.fn();
const mockUnsubscribeUser = vi.fn();
vi.mock('@/coordinators/ttl/ttl', () => ({
  TtlCoordinator: {
    getInstance: () => ({
      subscribeUser: mockSubscribeUser,
      unsubscribeUser: mockUnsubscribeUser,
    }),
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector?: (state: { currentUserPubky: string | null }) => unknown) => {
    const state = { currentUserPubky: mockState.currentUserPubky };
    return selector ? selector(state) : state;
  }),
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (queryFn: () => Promise<unknown>, _deps: unknown[], defaultValue: unknown) => {
    queryFn();
    const result = mockGetRelationships.mock.results[mockGetRelationships.mock.results.length - 1];
    return result?.value ?? defaultValue;
  },
}));

describe('useIsFollowing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.currentUserPubky = 'current-user-pubky';
    mockGetRelationships.mockReturnValue(null);
  });

  describe('Loading state', () => {
    it('returns isLoading true when relationship data is not yet available', () => {
      // DB returns null → mock's ?? falls back to defaultValue (undefined) → isLoading: true
      mockGetRelationships.mockReturnValue(null);

      const { result } = renderHook(() => useIsFollowing('target-user'));

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading false when relationship data exists', () => {
      mockGetRelationships.mockReturnValue({ following: true });

      const { result } = renderHook(() => useIsFollowing('target-user'));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Following state', () => {
    it('returns isFollowing true when user is following target', () => {
      mockGetRelationships.mockReturnValue({ following: true });

      const { result } = renderHook(() => useIsFollowing('target-user'));

      expect(result.current.isFollowing).toBe(true);
    });

    it('returns isFollowing false when user is not following target', () => {
      mockGetRelationships.mockReturnValue({ following: false });

      const { result } = renderHook(() => useIsFollowing('target-user'));

      expect(result.current.isFollowing).toBe(false);
    });

    it('returns isFollowing false when relationship record has no following field', () => {
      mockGetRelationships.mockReturnValue({});

      const { result } = renderHook(() => useIsFollowing('target-user'));

      expect(result.current.isFollowing).toBe(false);
    });

    it('defaults isFollowing to false when relationship data is not available', () => {
      mockGetRelationships.mockReturnValue(null);

      const { result } = renderHook(() => useIsFollowing('target-user'));

      expect(result.current.isFollowing).toBe(false);
    });
  });

  describe('Self-follow guard', () => {
    it('does not query when targetUserId equals currentUserPubky', () => {
      mockState.currentUserPubky = 'same-user';

      const { result } = renderHook(() => useIsFollowing('same-user'));

      // enabled=false → queryFn not called
      expect(mockGetRelationships).not.toHaveBeenCalled();
      expect(result.current.isFollowing).toBe(false);
    });

    it('does not fetch when targetUserId equals currentUserPubky', () => {
      mockState.currentUserPubky = 'same-user';

      renderHook(() => useIsFollowing('same-user'));

      // enabled=false → fetchFn not called
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Missing IDs', () => {
    it('does not query when currentUserPubky is null (not logged in)', () => {
      mockState.currentUserPubky = null;

      renderHook(() => useIsFollowing('target-user'));

      // enabled=false → queryFn not called
      expect(mockGetRelationships).not.toHaveBeenCalled();
    });

    it('does not fetch when currentUserPubky is null', () => {
      mockState.currentUserPubky = null;

      renderHook(() => useIsFollowing('target-user'));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not query when targetUserId is empty string', () => {
      renderHook(() => useIsFollowing(''));

      // enabled=false → queryFn not called
      expect(mockGetRelationships).not.toHaveBeenCalled();
    });

    it('does not fetch when targetUserId is empty string', () => {
      renderHook(() => useIsFollowing(''));

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns isFollowing false when not logged in', () => {
      mockState.currentUserPubky = null;

      const { result } = renderHook(() => useIsFollowing('target-user'));

      expect(result.current.isFollowing).toBe(false);
    });
  });

  describe('Controller integration', () => {
    it('calls UserController.getRelationships with correct targetUserId', () => {
      mockGetRelationships.mockReturnValue({ following: false });

      renderHook(() => useIsFollowing('target-user'));

      expect(mockGetRelationships).toHaveBeenCalledWith({ userId: 'target-user' });
    });

    it('does not call UserController.fetch when data is cached (cache hit optimization)', () => {
      mockGetRelationships.mockReturnValue({ following: false });

      renderHook(() => useIsFollowing('target-user'));

      // Phase 1 optimization: fetchFn is skipped when useLiveQuery returns non-null data
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('TTL subscription (#1803)', () => {
    it('subscribes the target user so a cached relationship is refreshed once stale', () => {
      mockGetRelationships.mockReturnValue({ following: false });

      const { unmount } = renderHook(() => useIsFollowing(VALID_TARGET));

      expect(mockSubscribeUser).toHaveBeenCalledWith({ pubky: VALID_TARGET });
      expect(mockUnsubscribeUser).not.toHaveBeenCalled();

      unmount();

      expect(mockUnsubscribeUser).toHaveBeenCalledWith({ pubky: VALID_TARGET });
    });

    it('does not subscribe a malformed profile identifier', () => {
      mockGetRelationships.mockReturnValue({ following: false });

      renderHook(() => useIsFollowing('invalid-profile-key'));

      expect(mockSubscribeUser).not.toHaveBeenCalled();
    });

    it('re-subscribes when the target user changes', () => {
      mockGetRelationships.mockReturnValue({ following: false });

      const { rerender } = renderHook(({ id }) => useIsFollowing(id), { initialProps: { id: VALID_TARGET } });

      rerender({ id: OTHER_VALID_TARGET });

      expect(mockUnsubscribeUser).toHaveBeenCalledWith({ pubky: VALID_TARGET });
      expect(mockSubscribeUser).toHaveBeenLastCalledWith({ pubky: OTHER_VALID_TARGET });
    });
  });
});
