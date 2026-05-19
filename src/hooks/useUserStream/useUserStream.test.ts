import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { useUserStream } from './useUserStream';
import {
  DEFAULT_USER_STREAM_BUFFER_SIZE,
  DEFAULT_USER_STREAM_LIMIT,
  DEFAULT_USER_STREAM_PAGE_SIZE,
} from './useUserStream.constants';

const { mockUseLiveQuery, mockGetOrFetchStreamSlice, mockRefreshStreamSlice } = vi.hoisted(() => ({
  mockUseLiveQuery: vi.fn(),
  mockGetOrFetchStreamSlice: vi.fn(),
  mockRefreshStreamSlice: vi.fn(),
}));

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => mockUseLiveQuery(...args),
}));

// Mock dependencies
vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: {
    getOrFetchStreamSlice: (...args: unknown[]) => mockGetOrFetchStreamSlice(...args),
    refreshStreamSlice: (...args: unknown[]) => mockRefreshStreamSlice(...args),
  },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getManyDetails: vi.fn().mockResolvedValue(new Map()),
    getManyCounts: vi.fn().mockResolvedValue(new Map()),
    getManyRelationships: vi.fn().mockResolvedValue(new Map()),
    getManyTagsOrFetch: vi.fn().mockResolvedValue(new Map()),
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: (id: string) => `https://cdn.example.com/avatar/${id}`,
  },
}));
vi.mock('@/models/stream/user/userStream.types', () => ({
  UserStreamTypes: {
    RECOMMENDED: 'recommended:all:all',
    TODAY_INFLUENCERS_ALL: 'influencers:today:all',
  },
}));

describe('useUserStream', () => {
  const mockUserDetails = new Map([
    [
      'user-1',
      {
        id: 'user-1',
        name: 'User One',
        bio: 'Bio one',
        image: 'image1.jpg',
        status: null,
      },
    ],
    [
      'user-2',
      {
        id: 'user-2',
        name: 'User Two',
        bio: 'Bio two',
        image: null,
        status: 'active',
      },
    ],
  ]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshStreamSlice.mockResolvedValue({ nextPageIds: [], skip: undefined, isExhausted: true });
    // Default mock for useLiveQuery - returns the details map
    mockUseLiveQuery.mockReturnValue(mockUserDetails);
  });

  describe('initial loading', () => {
    it('returns loading state initially', () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({ nextPageIds: [], skip: 0 });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      expect(result.current.isLoading).toBe(true);
    });

    it('fetches initial data on mount', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1', 'user-2'],
        skip: 2,
      });
      mockUseLiveQuery.mockReturnValue(mockUserDetails);

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 10,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith({
        streamId: UserStreamTypes.RECOMMENDED,
        limit: 10,
        skip: 0,
      });
    });
  });

  describe('non-paginated mode', () => {
    it('uses default limit when not provided', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({ nextPageIds: [], skip: 0 });
      mockUseLiveQuery.mockReturnValue(new Map());

      renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: DEFAULT_USER_STREAM_LIMIT,
          }),
        );
      });
    });

    it('hasMore is false when not paginated', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1'],
        skip: 1,
      });
      mockUseLiveQuery.mockReturnValue(mockUserDetails);

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: false,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });
  });

  describe('paginated mode', () => {
    it('uses page size limit when paginated and no limit specified', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({ nextPageIds: [], skip: 0 });
      mockUseLiveQuery.mockReturnValue(new Map());

      renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith(
          expect.objectContaining({
            limit: DEFAULT_USER_STREAM_PAGE_SIZE,
          }),
        );
      });
    });

    it('sets hasMore true when full page returned', async () => {
      const fullPage = Array.from({ length: DEFAULT_USER_STREAM_PAGE_SIZE }, (_, i) => `user-${i}`);
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: fullPage,
        skip: DEFAULT_USER_STREAM_PAGE_SIZE,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it('sets hasMore false when partial page returned', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1', 'user-2'],
        skip: 2,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });

    it('loadMore fetches next page when hasMore is true', async () => {
      const fullPage = Array.from({ length: DEFAULT_USER_STREAM_PAGE_SIZE }, (_, i) => `user-${i}`);
      mockGetOrFetchStreamSlice
        .mockResolvedValueOnce({ nextPageIds: fullPage, skip: DEFAULT_USER_STREAM_PAGE_SIZE })
        .mockResolvedValueOnce({ nextPageIds: ['user-30', 'user-31'], skip: 32 });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.hasMore).toBe(true);
      });

      await act(async () => {
        await result.current.loadMore();
      });

      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
      expect(mockGetOrFetchStreamSlice).toHaveBeenLastCalledWith({
        streamId: UserStreamTypes.RECOMMENDED,
        limit: DEFAULT_USER_STREAM_PAGE_SIZE,
        skip: DEFAULT_USER_STREAM_PAGE_SIZE,
      });
    });

    it('loadMore does nothing when hasMore is false', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1'],
        skip: 1,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          paginated: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.hasMore).toBe(false);
      });

      await act(async () => {
        await result.current.loadMore();
      });

      // Should only be called once (initial fetch)
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('sets error state on fetch failure', async () => {
      mockGetOrFetchStreamSlice.mockRejectedValue(new Error('Network error'));
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch users');
    });
  });

  describe('refetch', () => {
    it('refetch resets and fetches again', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1'],
        skip: 1,
      });
      mockUseLiveQuery.mockReturnValue(new Map());

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.refetch();
      });

      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
    });
  });

  describe('recommended filtering and refill', () => {
    const createDetailsMap = (ids: string[]) =>
      new Map(
        ids.map((id) => [
          id,
          {
            id,
            name: `User ${id}`,
            bio: `Bio ${id}`,
            image: null,
            status: null,
          },
        ]),
      );

    const mockLiveQueryMaps = ({
      details,
      relationships,
    }: {
      details: Map<string, unknown>;
      relationships: Map<string, unknown>;
    }) => {
      let callCount = 0;
      mockUseLiveQuery.mockImplementation(() => {
        const index = callCount % 3;
        callCount += 1;
        if (index === 0) return details;
        if (index === 1) return new Map();
        return relationships;
      });
    };

    it('filters followed users and renders the first visible recommendations', async () => {
      const ids = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: false,
      });
      mockLiveQueryMaps({
        details: createDetailsMap(ids),
        relationships: new Map([
          ['user-1', { id: 'user-1', following: true, followed_by: false }],
          ['user-2', { id: 'user-2', following: false, followed_by: false }],
          ['user-3', { id: 'user-3', following: false, followed_by: false }],
          ['user-4', { id: 'user-4', following: false, followed_by: false }],
          ['user-5', { id: 'user-5', following: false, followed_by: false }],
        ]),
      });

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 3,
          includeRelationships: true,
          excludeFollowing: true,
          bufferSize: 5,
          refillThreshold: 2,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.users.map((user) => user.id)).toEqual(['user-2', 'user-3', 'user-4']);
    });

    it('keeps preserved followed users visible while filtering other followed users', async () => {
      const ids = ['user-1', 'user-2', 'user-3', 'user-4'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: false,
      });
      mockLiveQueryMaps({
        details: createDetailsMap(ids),
        relationships: new Map([
          ['user-1', { id: 'user-1', following: true, followed_by: false }],
          ['user-2', { id: 'user-2', following: true, followed_by: false }],
          ['user-3', { id: 'user-3', following: false, followed_by: false }],
          ['user-4', { id: 'user-4', following: false, followed_by: false }],
        ]),
      });

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 3,
          includeRelationships: true,
          excludeFollowing: true,
          preserveFollowedUserIds: ['user-1'],
          bufferSize: 4,
          refillThreshold: 2,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.users.map((user) => user.id)).toEqual(['user-1', 'user-3', 'user-4']);
      expect(result.current.users[0]?.isFollowing).toBe(true);
    });

    it('does not refill while live queries are still hydrating, even if eligibleCount appears low', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: false,
      });
      mockRefreshStreamSlice.mockResolvedValue({
        nextPageIds: [],
        skip: ids.length,
        isExhausted: true,
      });
      // Both live queries return their default empty Map — simulates the synchronous
      // pre-resolve render that useLiveQuery exposes on every mount.
      mockLiveQueryMaps({
        details: new Map(),
        relationships: new Map(),
      });

      renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 3,
          includeRelationships: true,
          excludeFollowing: true,
          refillThreshold: 6,
        }),
      );

      // Wait for the initial fetch to settle, then ensure the refill effect did NOT fire
      // despite eligibleCount === 0, because the hydration guard is still false.
      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(1);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRefreshStreamSlice).not.toHaveBeenCalled();
    });

    it('keeps isLoading true while relationships are still hydrating with excludeFollowing on', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: false,
      });
      mockRefreshStreamSlice.mockResolvedValue({
        nextPageIds: [],
        skip: ids.length,
        isExhausted: true,
      });
      // Details arrived but relationships hasn't — without the hydration gate the consumer
      // would see an unfiltered slice of the buffer for one render and then watch it shuffle
      // to the filtered slice once relationships catch up.
      mockLiveQueryMaps({
        details: createDetailsMap(ids),
        relationships: new Map(),
      });

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 3,
          includeRelationships: true,
          excludeFollowing: true,
        }),
      );

      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(1);
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('does not refill until userRelationshipsMap is hydrated when excludeFollowing is on', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: false,
      });
      mockRefreshStreamSlice.mockResolvedValue({
        nextPageIds: [],
        skip: ids.length,
        isExhausted: true,
      });
      // Details are hydrated but relationships are not — exposes the second race
      // where eligibleCount can briefly look high (no users filtered) without the
      // relationships data needed to make that decision.
      mockLiveQueryMaps({
        details: createDetailsMap(ids),
        relationships: new Map(),
      });

      renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 3,
          includeRelationships: true,
          excludeFollowing: true,
          refillThreshold: 6,
        }),
      );

      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(1);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockRefreshStreamSlice).not.toHaveBeenCalled();
    });

    it('makes one bounded refill request when eligible recommendations fall below threshold', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: false,
      });
      mockRefreshStreamSlice.mockResolvedValue({
        nextPageIds: ['user-4', 'user-5'],
        skip: 5,
        isExhausted: true,
      });
      mockLiveQueryMaps({
        details: createDetailsMap(ids),
        relationships: new Map(ids.map((id) => [id, { id, following: false, followed_by: false }])),
      });

      renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 3,
          includeRelationships: true,
          excludeFollowing: true,
          refillThreshold: 6,
        }),
      );

      await waitFor(() => {
        expect(mockRefreshStreamSlice).toHaveBeenCalledTimes(1);
      });

      expect(mockRefreshStreamSlice).toHaveBeenCalledWith({
        streamId: UserStreamTypes.RECOMMENDED,
        limit: DEFAULT_USER_STREAM_BUFFER_SIZE,
        skip: ids.length,
      });
    });
  });
});
