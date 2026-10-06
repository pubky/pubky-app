import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@/libs/logger/logger';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { useUserStream } from './useUserStream';
import { DEFAULT_USER_STREAM_BUFFER_SIZE, DEFAULT_USER_STREAM_LIMIT } from './useUserStream.constants';

const { mockUseLiveQuery, mockGetOrFetchStreamSlice, mockRefreshStreamSlice, mockGetStreamUserIds } = vi.hoisted(
  () => ({
    mockUseLiveQuery: vi.fn(),
    mockGetOrFetchStreamSlice: vi.fn(),
    mockRefreshStreamSlice: vi.fn(),
    mockGetStreamUserIds: vi.fn(),
  }),
);

// Mock dexie-react-hooks. The details/relationships queries (the two-argument calls, no default)
// resolve to a `{ forIds, map }` snapshot tagged with the ids they ran for; tests keep returning
// plain Maps and this shim tags them with the current `userIds` (deps[0]). Returning `undefined`
// from the mock models a live query that has not settled yet.
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: (...args: unknown[]) => {
    const value = mockUseLiveQuery(...args);
    const isSnapshotQuery = args.length === 2;
    if (isSnapshotQuery && value instanceof Map) {
      const deps = args[1] as unknown[];
      return { forIds: deps[0], map: value };
    }
    return value;
  },
}));

// Mock dependencies
vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: {
    getOrFetchStreamSlice: (...args: unknown[]) => mockGetOrFetchStreamSlice(...args),
    refreshStreamSlice: (...args: unknown[]) => mockRefreshStreamSlice(...args),
    getStreamUserIds: (...args: unknown[]) => mockGetStreamUserIds(...args),
    getOrFetchUsers: vi.fn().mockResolvedValue(undefined),
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
    mockGetStreamUserIds.mockResolvedValue([]);
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

  describe('deleted users', () => {
    it('labels a tombstoned user as [DELETED]', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({ nextPageIds: ['user-1'], skip: 1 });
      mockUseLiveQuery.mockReturnValue(
        new Map([['user-1', { id: 'user-1', name: '', bio: '', image: null, status: null, deleted: true }]]),
      );

      const { result } = renderHook(() => useUserStream({ streamId: UserStreamTypes.RECOMMENDED }));

      await waitFor(() => expect(result.current.users).toHaveLength(1));
      expect(result.current.users[0].name).toBe('[DELETED]');
    });
  });

  describe('user counts mapping', () => {
    it('maps the tags stat from counts.tagged (tags applied by the user)', async () => {
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ['user-1'],
        skip: 1,
      });
      const countsMap = new Map([
        [
          'user-1',
          {
            tagged: 4,
            tags: 10,
            unique_tags: 8,
            posts: 5,
            replies: 0,
            collections: 0,
            following: 1,
            followers: 2,
            friends: 0,
            bookmarks: 0,
          },
        ],
      ]);
      // The hook issues three live queries; details is the only one with a single
      // dep, and with includeRelationships off the counts query is the only one
      // whose second dep is `true`.
      mockUseLiveQuery.mockImplementation((_queryFn: unknown, deps: unknown[]) => {
        if (deps.length === 1) return mockUserDetails;
        return deps[1] === true ? countsMap : new Map();
      });

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          includeCounts: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.users).toHaveLength(1);
      });

      expect(result.current.users[0].counts).toEqual({
        posts: 5,
        tags: 4,
        followers: 2,
        following: 1,
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

    // `undefined` models a live query that has not resolved yet (the real pre-settle value).
    const mockLiveQueryMaps = ({
      details,
      relationships,
    }: {
      details: Map<string, unknown> | undefined;
      relationships: Map<string, unknown> | undefined;
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
      // Both live queries are still unresolved — simulates the synchronous pre-resolve render
      // that useLiveQuery exposes on every mount.
      mockLiveQueryMaps({
        details: undefined,
        relationships: undefined,
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
        relationships: undefined,
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
        relationships: undefined,
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

    it('clears isLoading when the details query settles empty (nothing cached or read failed)', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: true,
      });
      // Both queries settled for these ids but returned nothing: hydration is done, there is
      // simply no data. The consumer must get isLoading=false and an empty list, not a skeleton.
      mockLiveQueryMaps({
        details: new Map(),
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
        expect(result.current.isLoading).toBe(false);
      });
      expect(result.current.users).toEqual([]);
    });

    it('stays hydrating while the details query is unresolved', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: true,
      });
      mockLiveQueryMaps({
        details: undefined,
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
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(result.current.isLoading).toBe(true);
      expect(mockRefreshStreamSlice).not.toHaveBeenCalled();
    });

    it('makes one bounded refill read when eligible recommendations fall below threshold', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      // The read past the first slice finds nothing cached and goes to Nexus (a `skip` comes back)
      mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: ids,
        skip: ids.length,
        isExhausted: false,
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
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGetOrFetchStreamSlice).toHaveBeenLastCalledWith({
        streamId: UserStreamTypes.RECOMMENDED,
        limit: DEFAULT_USER_STREAM_BUFFER_SIZE,
        skip: ids.length,
        allowPartialCache: true,
      });
      expect(mockRefreshStreamSlice).not.toHaveBeenCalled();
    });

    it('asks Nexus for fresh candidates only when the cached tail was still short', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      const cachedTail = ['user-4'];
      mockGetOrFetchStreamSlice
        .mockResolvedValueOnce({ nextPageIds: ids, skip: undefined, isExhausted: false })
        .mockResolvedValueOnce({ nextPageIds: cachedTail, skip: undefined, isExhausted: false });
      mockRefreshStreamSlice.mockResolvedValue({
        nextPageIds: ['user-5', 'user-6'],
        skip: 6,
        isExhausted: true,
      });
      mockLiveQueryMaps({
        details: createDetailsMap([...ids, ...cachedTail]),
        relationships: new Map([...ids, ...cachedTail].map((id) => [id, { id, following: false, followed_by: false }])),
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

      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
      expect(mockRefreshStreamSlice).toHaveBeenCalledWith({
        streamId: UserStreamTypes.RECOMMENDED,
        limit: DEFAULT_USER_STREAM_BUFFER_SIZE,
        skip: ids.length + cachedTail.length,
      });
    });

    it('does not ask Nexus again when the read after a cache hit fails', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      const loggerErrorSpy = vi.spyOn(Logger, 'error').mockImplementation(() => {});
      mockGetOrFetchStreamSlice
        .mockResolvedValueOnce({ nextPageIds: ids, skip: undefined, isExhausted: false })
        // Fails only after the loading render, as a real transport error does
        .mockImplementationOnce(
          () => new Promise((_, reject) => setTimeout(() => reject(new Error('Nexus unavailable')), 10)),
        );
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

      // Wait for the failure itself, then let the refill effect run once more
      await waitFor(() => {
        expect(loggerErrorSpy).toHaveBeenCalledWith('[useUserStream] Failed to fetch users:', expect.any(Error));
      });
      await act(async () => {});

      expect(mockRefreshStreamSlice).not.toHaveBeenCalled();
    });

    it('shows the whole cached row at once when asked to show all', async () => {
      const ids = Array.from({ length: 12 }, (_, i) => `user-${i}`);
      mockGetStreamUserIds.mockResolvedValue(ids);
      mockLiveQueryMaps({
        details: createDetailsMap(ids),
        relationships: new Map(ids.map((id) => [id, { id, following: false, followed_by: false }])),
      });

      const { result } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 10,
          bufferSize: 10,
          refillThreshold: 10,
          includeRelationships: true,
          excludeFollowing: true,
          showAll: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.users).toHaveLength(ids.length);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockGetOrFetchStreamSlice).not.toHaveBeenCalled();
      expect(mockRefreshStreamSlice).not.toHaveBeenCalled();
    });

    it('keeps the settled list on screen while a refill hydrates, without showing followed users early', async () => {
      const ids = ['user-1', 'user-2', 'user-3'];
      const appended = ['user-4', 'user-5'];
      const allIds = [...ids, ...appended];
      mockGetOrFetchStreamSlice
        .mockResolvedValueOnce({ nextPageIds: ids, skip: undefined, isExhausted: false })
        .mockResolvedValueOnce({ nextPageIds: appended, skip: undefined, isExhausted: false });
      const initialRelationships = new Map(
        ids.map((id) => [id, { id, following: id === 'user-1', followed_by: false }] as const),
      );
      const allRelationships = new Map([
        ...initialRelationships,
        ['user-4', { id: 'user-4', following: true, followed_by: false }],
        ['user-5', { id: 'user-5', following: false, followed_by: false }],
      ]);
      // Details already cover the appended ids while the relationships live query still holds the
      // snapshot it computed for the initial ids, as between two Dexie updates: user-4 (followed)
      // has no relationship row yet and must not show as unfollowed.
      let relationshipsLag = true;
      let callCount = 0;
      mockUseLiveQuery.mockImplementation((_querier: unknown, deps: unknown[]) => {
        const index = callCount % 3;
        callCount += 1;
        if (index === 0) return createDetailsMap(allIds);
        if (index === 1) return new Map();
        return relationshipsLag
          ? { forIds: ids, map: initialRelationships }
          : { forIds: deps[0], map: allRelationships };
      });

      const { result, rerender } = renderHook(() =>
        useUserStream({
          streamId: UserStreamTypes.RECOMMENDED,
          limit: 3,
          bufferSize: 3,
          refillThreshold: 3,
          includeRelationships: true,
          excludeFollowing: true,
        }),
      );

      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
      });
      await act(async () => {});

      // The append landed but relationships lag: the settled two stay, nothing new, no skeletons
      expect(result.current.isLoading).toBe(false);
      expect(result.current.userIds).toEqual(allIds);
      expect(result.current.users.map((user) => user.id)).toEqual(['user-2', 'user-3']);

      relationshipsLag = false;
      rerender();

      expect(result.current.isLoading).toBe(false);
      expect(result.current.users.map((user) => user.id)).toEqual(['user-2', 'user-3', 'user-5']);
    });
  });
});
