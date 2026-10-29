import type { Session } from '@synonymdev/pubky';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionReference, SessionRestoreStatus } from '@/libs/auth/session.types';
import type { AuthStore } from '@/stores/auth/auth.types';
import { mockGrantReference, mockSession } from '@/test-utils/pubky';
import { mockAuthStore } from '@/test-utils/stores';
import { useCurrentUserProfile } from './useCurrentUserProfile';

// Hoist mock data
const mockState = vi.hoisted(() => ({
  currentUserPubky: null as string | null,
  session: null as Session | null,
  sessionReference: null as SessionReference | null,
  restoreStatus: 'idle' as SessionRestoreStatus,
  userDetails: undefined as unknown,
}));

// Mock direct dependencies
const mockGetDetails = vi.fn();
const mockFetchDetails = vi.fn().mockResolvedValue(undefined);
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getDetails: (params: { userId: string }) => mockGetDetails(params),
    fetchDetails: (params: { userId: string }) => mockFetchDetails(params),
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn((selector?: (state: AuthStore) => unknown) => {
    const state = mockAuthStore({
      currentUserPubky: mockState.currentUserPubky,
      session: mockState.session,
      sessionReference: mockState.sessionReference,
      restoreStatus: mockState.restoreStatus,
    });
    return selector ? selector(state) : state;
  }),
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (queryFn: () => Promise<unknown>, _deps: unknown[], defaultValue: unknown) => {
    queryFn();
    const result = mockGetDetails.mock.results[mockGetDetails.mock.results.length - 1];
    return result?.value == null ? defaultValue : { query: _deps[0], data: result.value };
  },
}));

describe('useCurrentUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A ready member session: `currentUserPubky` alone switches the signed-in cases below on and off.
    mockState.currentUserPubky = null;
    mockState.session = mockSession();
    mockState.sessionReference = mockGrantReference();
    mockState.restoreStatus = 'ready';
    mockGetDetails.mockReturnValue(null);
  });

  describe('Guest with a generated pubky (#2955)', () => {
    beforeEach(() => {
      // The onboarding key step stores the generated pubky with no session and nothing to restore.
      mockState.currentUserPubky = 'generated-key';
      mockState.session = null;
      mockState.sessionReference = null;
      mockState.restoreStatus = 'idle';
    });

    it('reports no user and neither reads nor fetches details for a key without an account', () => {
      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current.currentUserPubky).toBeNull();
      expect(result.current.userDetails).toBeUndefined();
      expect(mockGetDetails).not.toHaveBeenCalled();
      expect(mockFetchDetails).not.toHaveBeenCalled();
    });

    it('reports the user and reads details again once that key has a session reference to restore', () => {
      mockState.sessionReference = mockGrantReference();

      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current.currentUserPubky).toBe('generated-key');
      expect(mockGetDetails).toHaveBeenCalledWith({ userId: 'generated-key' });
    });

    it.each(['restoring', 'reauth-required', 'temporary-error'] as const)(
      'keeps reading details for a member during %s',
      (restoreStatus) => {
        mockState.restoreStatus = restoreStatus;

        renderHook(() => useCurrentUserProfile());

        expect(mockGetDetails).toHaveBeenCalledWith({ userId: 'generated-key' });
      },
    );
  });

  describe('Authentication state', () => {
    it('returns null currentUserPubky when not logged in', () => {
      mockState.currentUserPubky = null;

      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current.currentUserPubky).toBeNull();
    });

    it('returns currentUserPubky when logged in', () => {
      mockState.currentUserPubky = 'test-user-pubky';

      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current.currentUserPubky).toBe('test-user-pubky');
    });
  });

  describe('User details fetching', () => {
    it('returns undefined userDetails when not logged in (enabled=false)', () => {
      mockState.currentUserPubky = null;

      const { result } = renderHook(() => useCurrentUserProfile());

      // enabled=false → queryFn not called → useLiveQuery returns undefined (defaultValue)
      expect(result.current.userDetails).toBeUndefined();
    });

    it('does not call getDetails when not logged in', () => {
      mockState.currentUserPubky = null;

      renderHook(() => useCurrentUserProfile());

      expect(mockGetDetails).not.toHaveBeenCalled();
    });

    it('returns user details when logged in and data exists', () => {
      const mockUser = {
        id: 'test-user-pubky',
        name: 'Current User',
        bio: 'My bio',
        image: 'avatar.jpg',
        status: 'Active',
        links: [],
        indexed_at: Date.now(),
      };
      mockState.currentUserPubky = 'test-user-pubky';
      mockGetDetails.mockReturnValue(mockUser);

      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current.userDetails).toEqual(mockUser);
    });

    it('calls UserController.getDetails with currentUserPubky', () => {
      mockState.currentUserPubky = 'test-user-pubky';
      mockGetDetails.mockReturnValue({ id: 'test-user-pubky', name: 'User' });

      renderHook(() => useCurrentUserProfile());

      expect(mockGetDetails).toHaveBeenCalledWith({ userId: 'test-user-pubky' });
    });

    it('returns undefined userDetails when logged in but data not in cache (null from DB)', () => {
      mockState.currentUserPubky = 'test-user-pubky';
      // DB returns null → mock's ?? falls back to defaultValue (undefined)
      mockGetDetails.mockReturnValue(null);

      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current.userDetails).toBeUndefined();
    });
  });

  describe('Controller integration', () => {
    it('does not call fetchDetails when data is already cached (cache hit optimization)', () => {
      mockState.currentUserPubky = 'test-user-pubky';
      mockGetDetails.mockReturnValue({ id: 'test-user-pubky', name: 'User' });

      renderHook(() => useCurrentUserProfile());

      // Phase 1 optimization: fetchFn is skipped when useLiveQuery returns non-null data
      expect(mockFetchDetails).not.toHaveBeenCalled();
    });

    it('does not call fetchDetails when not logged in', () => {
      mockState.currentUserPubky = null;

      renderHook(() => useCurrentUserProfile());

      expect(mockFetchDetails).not.toHaveBeenCalled();
    });
  });

  describe('Return shape', () => {
    it('always returns both userDetails and currentUserPubky', () => {
      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current).toHaveProperty('userDetails');
      expect(result.current).toHaveProperty('currentUserPubky');
    });

    it('returns complete result when logged in with data', () => {
      const mockUser = {
        id: 'test-user-pubky',
        name: 'Test User',
        bio: 'bio',
        image: null,
        status: null,
        links: null,
        indexed_at: Date.now(),
      };
      mockState.currentUserPubky = 'test-user-pubky';
      mockGetDetails.mockReturnValue(mockUser);

      const { result } = renderHook(() => useCurrentUserProfile());

      expect(result.current.currentUserPubky).toBe('test-user-pubky');
      expect(result.current.userDetails).toEqual(mockUser);
    });
  });
});
