import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { asInvalid } from '@/test-utils';
import { useUserDetailsFromIds } from './useUserDetailsFromIds';
import type { Pubky } from '@/models/models.types';
import type { NexusUserDetails } from '@/services/nexus/nexus.types';
// Hoist mock data
const { mockUserDetailsMap, setMockUserDetailsMap, mockGetManyDetails, mockGetOrFetchDetails, mockGetAvatarUrl } =
  vi.hoisted(() => {
    const userDetailsMap = { current: new Map<Pubky, NexusUserDetails>() };
    return {
      mockUserDetailsMap: userDetailsMap,
      setMockUserDetailsMap: (value: Map<Pubky, NexusUserDetails>) => {
        userDetailsMap.current = value;
      },
      mockGetManyDetails: vi.fn(),
      mockGetOrFetchDetails: vi.fn(),
      mockGetAvatarUrl: vi.fn(),
    };
  });

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn, _deps, _defaultValue) => {
    if (queryFn) {
      void queryFn();
    }
    return mockUserDetailsMap.current;
  }),
}));

// Mock dependencies
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getManyDetails: (...args: unknown[]) => mockGetManyDetails(...args),
    getOrFetchDetails: (...args: unknown[]) => mockGetOrFetchDetails(...args),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: (...args: unknown[]) => mockGetAvatarUrl(...args),
  },
}));

describe('useUserDetailsFromIds', () => {
  beforeEach(() => {
    mockGetManyDetails.mockImplementation(({ userIds }: { userIds: Pubky[] }) => {
      const map = new Map<Pubky, NexusUserDetails>();
      for (const userId of userIds) {
        const details = mockUserDetailsMap.current.get(userId);
        if (details) {
          map.set(userId, details);
        }
      }
      return Promise.resolve(map);
    });
    mockGetOrFetchDetails.mockResolvedValue(null);
    mockGetAvatarUrl.mockImplementation((id: string) => `https://example.com/${id}/avatar`);
    setMockUserDetailsMap(new Map());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('returns empty users array when userIds is empty', () => {
      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: [] }));

      expect(result.current.users).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('user details transformation', () => {
    it('transforms user details map to AutocompleteUserData array', () => {
      setMockUserDetailsMap(
        new Map([
          ['user1', { id: 'user1', name: 'Alice', image: 'avatar1.jpg' } as NexusUserDetails],
          ['user2', { id: 'user2', name: 'Bob', image: 'avatar2.jpg' } as NexusUserDetails],
        ]),
      );

      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user1', 'user2'] as Pubky[] }));

      expect(result.current.users).toHaveLength(2);
      expect(result.current.users[0]).toEqual({
        id: 'user1',
        name: 'Alice',
        avatarUrl: 'https://example.com/user1/avatar',
      });
      expect(result.current.users[1]).toEqual({
        id: 'user2',
        name: 'Bob',
        avatarUrl: 'https://example.com/user2/avatar',
      });
    });

    it('preserves order of userIds in output', () => {
      setMockUserDetailsMap(
        new Map([
          ['user1', { id: 'user1', name: 'Alice', image: 'avatar.jpg' } as NexusUserDetails],
          ['user2', { id: 'user2', name: 'Bob', image: 'avatar.jpg' } as NexusUserDetails],
          ['user3', { id: 'user3', name: 'Charlie', image: 'avatar.jpg' } as NexusUserDetails],
        ]),
      );

      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user3', 'user1', 'user2'] as Pubky[] }));

      expect(result.current.users[0].id).toBe('user3');
      expect(result.current.users[1].id).toBe('user1');
      expect(result.current.users[2].id).toBe('user2');
    });

    it('uses fallback name when user name is not available', () => {
      setMockUserDetailsMap(
        new Map([
          ['user1', { id: 'user1', name: '', image: null } as NexusUserDetails],
          ['user2', asInvalid<NexusUserDetails>({ id: 'user2', name: null, image: null })],
        ]),
      );

      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user1', 'user2'] as Pubky[] }));

      expect(result.current.users[0].name).toBe('Unknown User');
      expect(result.current.users[1].name).toBe('Unknown User');
    });

    it('sets avatarUrl to undefined when user has no image', () => {
      setMockUserDetailsMap(new Map([['user1', { id: 'user1', name: 'Alice', image: null } as NexusUserDetails]]));

      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user1'] as Pubky[] }));

      expect(result.current.users[0].avatarUrl).toBeUndefined();
    });

    it('skips users not found in details map', () => {
      setMockUserDetailsMap(
        new Map([
          ['user1', { id: 'user1', name: 'Alice', image: null } as NexusUserDetails],
          // user2 is not in the map
        ]),
      );

      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user1', 'user2'] as Pubky[] }));

      expect(result.current.users).toHaveLength(1);
      expect(result.current.users[0].id).toBe('user1');
    });
  });

  describe('loading state', () => {
    it('returns isLoading true when userIds exist but details not loaded yet', () => {
      // Details map is empty but we have userIds
      setMockUserDetailsMap(new Map());

      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user1', 'user2'] as Pubky[] }));

      expect(result.current.isLoading).toBe(true);
    });

    it('returns isLoading false when details are loaded', () => {
      setMockUserDetailsMap(new Map([['user1', { id: 'user1', name: 'Alice', image: null } as NexusUserDetails]]));

      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user1'] as Pubky[] }));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('prefetching', () => {
    it('prefetches user details by default', async () => {
      const { result } = renderHook(() => useUserDetailsFromIds({ userIds: ['user1', 'user2'] as Pubky[] }));

      await waitFor(() => {
        expect(mockGetOrFetchDetails).toHaveBeenCalledTimes(2);
      });

      expect(mockGetOrFetchDetails).toHaveBeenCalledWith({ userId: 'user1' });
      expect(mockGetOrFetchDetails).toHaveBeenCalledWith({ userId: 'user2' });
      expect(result.current).toBeDefined();
    });

    it('does not prefetch when prefetch is false', () => {
      renderHook(() =>
        useUserDetailsFromIds({
          userIds: ['user1', 'user2'] as Pubky[],
          prefetch: false,
        }),
      );

      expect(mockGetOrFetchDetails).not.toHaveBeenCalled();
    });

    it('does not prefetch when userIds is empty', () => {
      renderHook(() => useUserDetailsFromIds({ userIds: [] }));

      expect(mockGetOrFetchDetails).not.toHaveBeenCalled();
    });
  });

  describe('reactivity', () => {
    it('updates users when userIds change', () => {
      setMockUserDetailsMap(
        new Map([
          ['user1', { id: 'user1', name: 'Alice', image: null } as NexusUserDetails],
          ['user2', { id: 'user2', name: 'Bob', image: null } as NexusUserDetails],
        ]),
      );

      const { result, rerender } = renderHook(({ userIds }) => useUserDetailsFromIds({ userIds }), {
        initialProps: { userIds: ['user1'] as Pubky[] },
      });

      expect(result.current.users).toHaveLength(1);
      expect(result.current.users[0].id).toBe('user1');

      rerender({ userIds: ['user1', 'user2'] as Pubky[] });

      expect(result.current.users).toHaveLength(2);
    });
  });
});
