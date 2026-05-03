import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pubky } from '@/models/models.types';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import type { NexusUserCounts, NexusUserDetails } from '@/services/nexus/nexus.types';
import { CONNECTION_TYPE, useProfileConnections } from './useProfileConnections';

// Hoist mock functions before vi.mock
const mockMocks = vi.hoisted(() => {
  const mockGetOrFetchStreamSlice = vi.fn();
  const mockBulkGetDetails = vi.fn();
  const mockBulkGetCounts = vi.fn();
  const mockBulkGetRelationships = vi.fn();
  const mockGetAvatarUrl = vi.fn();
  return {
    mockGetOrFetchStreamSlice,
    mockBulkGetDetails,
    mockBulkGetCounts,
    mockBulkGetRelationships,
    mockGetAvatarUrl,
  };
});

// Mock direct dependencies
const mockCurrentUserPubky = 'user123';
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    currentUserPubky: mockCurrentUserPubky,
  })),
}));
vi.mock('@/controllers/stream/users/users', () => ({
  StreamUserController: {
    getOrFetchStreamSlice: mockMocks.mockGetOrFetchStreamSlice,
  },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    bulkGetDetails: mockMocks.mockBulkGetDetails,
    bulkGetCounts: mockMocks.mockBulkGetCounts,
    bulkGetRelationships: mockMocks.mockBulkGetRelationships,
  },
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: mockMocks.mockGetAvatarUrl,
  },
}));
vi.mock('@/models/user/details/userDetails', () => ({
  UserDetailsModel: {
    table: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
  },
}));
vi.mock('@/models/user/counts/userCounts', () => ({
  UserCountsModel: {
    table: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          toArray: vi.fn().mockResolvedValue([]),
        })),
      })),
    },
  },
}));

// Mock Config
vi.mock('@/config/nexus', () => ({
  NEXUS_USERS_PER_PAGE: 20,
}));

vi.mock('@/config/moderation', () => ({
  MODERATED_TAGS: ['nudity'],
}));

// Mock dexie-react-hooks
let mockUserDetailsMap = new Map<Pubky, NexusUserDetails>();
let mockUserCountsMap = new Map<Pubky, NexusUserCounts>();
let mockUserRelationshipsMap = new Map<Pubky, UserRelationshipsModelSchema>();

const mockUseLiveQuery = vi.fn(<T,>(queryFn: () => Promise<T> | T, deps: unknown[], defaultValue: T): T => {
  // Check which query function is being called based on dependencies
  if (deps && deps[0] && Array.isArray(deps[0])) {
    // Determine which map to return based on the query function
    const queryFnString = queryFn.toString();
    if (queryFnString.includes('getManyDetails') || queryFnString.includes('UserController.getManyDetails')) {
      return mockUserDetailsMap as T;
    }
    if (queryFnString.includes('getManyCounts') || queryFnString.includes('UserController.getManyCounts')) {
      return mockUserCountsMap as T;
    }
    if (
      queryFnString.includes('getManyRelationships') ||
      queryFnString.includes('UserController.getManyRelationships')
    ) {
      return mockUserRelationshipsMap as T;
    }
  }
  return defaultValue;
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: <T,>(queryFn: () => Promise<T> | T, deps: unknown[], defaultValue: T): T =>
    mockUseLiveQuery(queryFn, deps, defaultValue) as T,
}));

describe('useProfileConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default empty state
    mockMocks.mockGetOrFetchStreamSlice.mockResolvedValue({
      nextPageIds: [],
      skip: 0,
    });
    mockUserDetailsMap = new Map();
    mockUserCountsMap = new Map();
    mockUserRelationshipsMap = new Map();
    mockMocks.mockGetAvatarUrl.mockReturnValue(null);
  });

  it('provides loadMore and refresh functions', async () => {
    const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWERS));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.loadMore).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('has correct initial state', async () => {
    const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWERS));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.hasMore).toBe(false); // No results means no more
  });

  it('returns count matching connections length', async () => {
    const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWERS));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(result.current.connections.length);
  });

  describe('without data', () => {
    it('returns empty connections array initially for FOLLOWERS', async () => {
      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWERS));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.connections).toHaveLength(0);
      expect(result.current.count).toBe(0);
    });

    it('returns empty connections array initially for FOLLOWING', async () => {
      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWING));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.connections).toHaveLength(0);
      expect(result.current.count).toBe(0);
    });

    it('returns empty connections array initially for FRIENDS', async () => {
      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FRIENDS));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.connections).toHaveLength(0);
      expect(result.current.count).toBe(0);
    });
  });

  describe('with data', () => {
    beforeEach(() => {
      const userIds: Pubky[] = ['user-1', 'user-2'] as Pubky[];
      mockMocks.mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: userIds,
        skip: 2,
      });

      mockUserDetailsMap = new Map<Pubky, NexusUserDetails>([
        [
          'user-1',
          {
            id: 'user-1' as Pubky,
            name: 'John Doe',
            bio: 'Test bio',
            image: 'image-1',
            status: 'active',
            links: null,
            indexed_at: 1704067200000,
          },
        ],
        [
          'user-2',
          {
            id: 'user-2' as Pubky,
            name: 'Jane Smith',
            bio: 'Another bio',
            image: null,
            status: 'active',
            links: null,
            indexed_at: 1704067200000,
          },
        ],
      ]);

      mockUserCountsMap = new Map<Pubky, NexusUserCounts>([
        [
          'user-1',
          {
            tagged: 0,
            tags: 10,
            unique_tags: 10,
            posts: 5,
            replies: 0,
            following: 0,
            followers: 0,
            friends: 0,
            bookmarks: 0,
          },
        ],
        [
          'user-2',
          {
            tagged: 0,
            tags: 20,
            unique_tags: 20,
            posts: 10,
            replies: 0,
            following: 0,
            followers: 0,
            friends: 0,
            bookmarks: 0,
          },
        ],
      ]);

      mockUserRelationshipsMap = new Map<Pubky, UserRelationshipsModelSchema>([
        ['user-1', { id: 'user-1' as Pubky, following: false, followed_by: false }],
        ['user-2', { id: 'user-2' as Pubky, following: true, followed_by: false }],
      ]);

      mockMocks.mockGetAvatarUrl.mockImplementation((id: Pubky) => {
        if (id === 'user-1') return 'https://cdn.example.com/avatar/user-1.png';
        return null;
      });
    });

    it('returns connections with user data for FOLLOWERS', async () => {
      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWERS));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.connections.length).toBeGreaterThan(0);
      });

      expect(result.current.connections).toHaveLength(2);
      expect(result.current.count).toBe(2);

      const connection1 = result.current.connections.find((c) => c.id === 'user-1');
      expect(connection1).toBeDefined();
      expect(connection1?.name).toBe('John Doe');
      expect(connection1?.bio).toBe('Test bio');
      expect(connection1?.avatarUrl).toBe('https://cdn.example.com/avatar/user-1.png');
      expect(connection1?.stats?.tags).toBe(10);
      expect(connection1?.stats?.posts).toBe(5);
      expect(connection1?.isFollowing).toBe(false);

      const connection2 = result.current.connections.find((c) => c.id === 'user-2');
      expect(connection2).toBeDefined();
      expect(connection2?.name).toBe('Jane Smith');
      expect(connection2?.bio).toBe('Another bio');
      expect(connection2?.avatarUrl).toBe(null); // No image, so no avatar URL
      expect(connection2?.stats?.tags).toBe(20);
      expect(connection2?.stats?.posts).toBe(10);
      expect(connection2?.isFollowing).toBe(true);
    });

    it('returns connections with user data for FOLLOWING', async () => {
      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWING));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.connections.length).toBeGreaterThan(0);
      });

      expect(result.current.connections).toHaveLength(2);
      expect(result.current.count).toBe(2);
    });

    it('returns connections with user data for FRIENDS', async () => {
      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FRIENDS));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.connections.length).toBeGreaterThan(0);
      });

      expect(result.current.connections).toHaveLength(2);
      expect(result.current.count).toBe(2);
    });

    it('sets hasMore correctly when more connections available', async () => {
      // Mock response with full page (20 items)
      const fullPageIds = Array.from({ length: 20 }, (_, i) => `user-${i}` as Pubky);
      mockMocks.mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: fullPageIds,
        skip: 20,
      });

      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWERS));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(true);
    });

    it('sets hasMore to false when fewer than page size returned', async () => {
      // Mock response with less than page size
      const smallPageIds = ['user-1', 'user-2'] as Pubky[];
      mockMocks.mockGetOrFetchStreamSlice.mockResolvedValue({
        nextPageIds: smallPageIds,
        skip: 2,
      });

      const { result } = renderHook(() => useProfileConnections(CONNECTION_TYPE.FOLLOWERS));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.hasMore).toBe(false);
    });
  });
});
