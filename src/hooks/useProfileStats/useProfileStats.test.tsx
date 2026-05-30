import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserController } from '@/controllers/user/user';
import type { UserCountsModelSchema } from '@/models/user/counts/userCounts.schema';
import { useProfileStats } from './useProfileStats';

// Hoist mock data using vi.hoisted
// Note: undefined = query not executed yet (loading), null = query executed but no data found
const {
  mockUserCounts,
  setMockUserCounts,
  mockNotificationsCount,
  setMockNotificationsCount,
  mockTaggedCount,
  setMockTaggedCount,
} = vi.hoisted(() => {
  const data = { current: undefined as UserCountsModelSchema | null | undefined };
  const notificationsCount = { current: 0 };
  const taggedCount = { current: 0 };
  return {
    mockUserCounts: data,
    setMockUserCounts: (value: UserCountsModelSchema | null | undefined) => {
      data.current = value;
    },
    mockNotificationsCount: notificationsCount,
    setMockNotificationsCount: (value: number) => {
      notificationsCount.current = value;
    },
    mockTaggedCount: taggedCount,
    setMockTaggedCount: (value: number) => {
      taggedCount.current = value;
    },
  };
});

// Mock dexie-react-hooks
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn((queryFn) => {
    // Execute the query function to return mock data
    if (queryFn) {
      void queryFn();
    }
    return mockUserCounts.current;
  }),
}));

// Mock useNotifications from direct path (used by useProfileStats)
vi.mock('@/hooks/useNotifications/useNotifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useNotifications/useNotifications')>();
  return {
    ...actual,
    useNotifications: vi.fn(() => ({
      notifications: [],
      unreadNotifications: [],
      count: 0,
      unreadCount: mockNotificationsCount.current,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      markAllAsRead: vi.fn(),
      isNotificationUnread: vi.fn(() => false),
    })),
  };
});

vi.mock('@/hooks/useTagged/useTagged', () => ({
  useTagged: vi.fn(() => ({
    tags: [],
    count: mockTaggedCount.current,
    isLoading: false,
    handleTagAdd: vi.fn(),
  })),
}));

// Mock controllers
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getCounts: vi.fn().mockImplementation(() => Promise.resolve(mockUserCounts.current)),
    fetchCounts: vi.fn().mockImplementation(() => Promise.resolve(mockUserCounts.current)),
  },
}));
vi.mock('@/controllers/notification/notification', () => ({
  NotificationController: {
    getNotificationsCountsNow: vi.fn(() => mockNotificationsCount.current),
  },
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: vi.fn((selector: (state: { selectUnread: () => number }) => number) =>
    selector({ selectUnread: () => mockNotificationsCount.current }),
  ),
}));

describe('useProfileStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to undefined (simulating query not yet executed)
    setMockUserCounts(undefined);
    setMockNotificationsCount(0);
    setMockTaggedCount(0);
  });

  describe('Stats fetching', () => {
    it('returns zero stats and isLoading true when query has not executed yet (undefined)', () => {
      setMockUserCounts(undefined);
      const { result } = renderHook(() => useProfileStats('test-user-id'));

      expect(result.current.stats.posts).toBe(0);
      expect(result.current.stats.replies).toBe(0);
      expect(result.current.stats.followers).toBe(0);
      expect(result.current.stats.following).toBe(0);
      expect(result.current.stats.friends).toBe(0);
      expect(result.current.stats.uniqueTags).toBe(0);
      expect(result.current.stats.notifications).toBe(0);
      expect(result.current.isLoading).toBe(true);
    });

    it('returns zero stats and isLoading false when counts not found (null) after fetch settles', async () => {
      setMockUserCounts(null);
      const { result } = renderHook(() => useProfileStats('test-user-id'));

      // Wait for fetchFn (fetchCounts) to settle — isLoading stays true
      // while the fetch is in-flight, then becomes false once it resolves.
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.stats.posts).toBe(0);
      expect(result.current.stats.replies).toBe(0);
      expect(result.current.stats.followers).toBe(0);
      expect(result.current.stats.following).toBe(0);
      expect(result.current.stats.friends).toBe(0);
      expect(result.current.stats.uniqueTags).toBe(0);
      expect(result.current.stats.notifications).toBe(0);
    });

    it('returns correct stats when user counts exist', () => {
      setMockUserCounts({
        id: 'test-user-id',
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        uniqueTags: 0,
        tagged: 0,
        tags: 0,
        unique_tags: 3,
        bookmarks: 0,
      } as UserCountsModelSchema);

      const { result } = renderHook(() => useProfileStats('test-user-id'));

      // Backend sends posts including replies, UI calculates: 10 - 5 = 5 actual posts
      expect(result.current.stats.posts).toBe(5);
      expect(result.current.stats.replies).toBe(5);
      expect(result.current.stats.followers).toBe(20);
      expect(result.current.stats.following).toBe(15);
      expect(result.current.stats.friends).toBe(8);
      expect(result.current.stats.uniqueTags).toBe(3);
      expect(result.current.isLoading).toBe(false);
    });

    it('handles zero counts', () => {
      setMockUserCounts({
        id: 'test-user-id',
        posts: 0,
        replies: 0,
        followers: 0,
        following: 0,
        friends: 0,
        tagged: 0,
        uniqueTags: 0,
        tags: 0,
        unique_tags: 0,
        bookmarks: 0,
      } as UserCountsModelSchema);

      const { result } = renderHook(() => useProfileStats('test-user-id'));

      expect(result.current.stats.posts).toBe(0);
      expect(result.current.stats.replies).toBe(0);
      expect(result.current.stats.followers).toBe(0);
      expect(result.current.stats.following).toBe(0);
      expect(result.current.stats.friends).toBe(0);
      expect(result.current.stats.uniqueTags).toBe(0);
    });

    it('calculates posts correctly when user only has replies', () => {
      // User with 27 replies and no posts (backend counts posts including replies)
      setMockUserCounts({
        id: 'test-user-id',
        posts: 27, // Backend: includes replies in count
        replies: 27,
        followers: 0,
        following: 0,
        friends: 0,
        tagged: 0,
        tags: 0,
        unique_tags: 7,
        bookmarks: 0,
      } as UserCountsModelSchema);

      const { result } = renderHook(() => useProfileStats('test-user-id'));

      // UI calculates: 27 - 27 = 0 actual posts
      expect(result.current.stats.posts).toBe(0);
      expect(result.current.stats.replies).toBe(27);
      expect(result.current.stats.uniqueTags).toBe(7);
    });
  });

  describe('Notifications stat', () => {
    it('returns notifications count from useNotifications hook', () => {
      setMockNotificationsCount(15);
      setMockUserCounts({
        id: 'test-user-id',
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        uniqueTags: 0,
        tagged: 0,
        tags: 0,
        unique_tags: 3,
        bookmarks: 0,
      } as UserCountsModelSchema);

      setMockNotificationsCount(15);

      const { result } = renderHook(() => useProfileStats('test-user-id'));

      expect(result.current.stats.notifications).toBe(15);
    });
  });

  describe('Loading state', () => {
    it('isLoading is true when query has not executed yet (undefined)', () => {
      setMockUserCounts(undefined);
      const { result } = renderHook(() => useProfileStats('test-user-id'));

      expect(result.current.isLoading).toBe(true);
    });

    it('isLoading is false when counts not found (null) after fetch settles', async () => {
      setMockUserCounts(null);
      const { result } = renderHook(() => useProfileStats('test-user-id'));

      // isLoading stays true while fetchFn is in-flight, then becomes false
      // once the fetch settles and data is still null (genuinely not found).
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
    });

    it('isLoading is false when user counts are available', () => {
      setMockUserCounts({
        id: 'test-user-id',
        posts: 10,
        replies: 5,
        followers: 20,
        following: 15,
        friends: 8,
        uniqueTags: 0,
        tagged: 0,
        tags: 0,
        unique_tags: 3,
        bookmarks: 0,
      } as UserCountsModelSchema);

      const { result } = renderHook(() => useProfileStats('test-user-id'));

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles empty userId - returns loading true (query returns null for empty userId)', () => {
      // When userId is empty, the query returns null (not found)
      // but the mock returns undefined by default (query not executed)
      setMockUserCounts(undefined);
      const { result } = renderHook(() => useProfileStats(''));

      expect(result.current.stats.posts).toBe(0);
      expect(result.current.isLoading).toBe(true);
    });

    it('handles large count values', () => {
      setMockUserCounts({
        id: 'test-user-id',
        posts: 999999,
        replies: 888888,
        followers: 777777,
        following: 666666,
        friends: 555555,
        uniqueTags: 0,
        tagged: 0,
        tags: 0,
        unique_tags: 444444,
        bookmarks: 0,
      } as UserCountsModelSchema);

      const { result } = renderHook(() => useProfileStats('test-user-id'));

      // UI calculates: 999999 - 888888 = 111111 actual posts
      expect(result.current.stats.posts).toBe(111111);
      expect(result.current.stats.replies).toBe(888888);
      expect(result.current.stats.followers).toBe(777777);
      expect(result.current.stats.following).toBe(666666);
      expect(result.current.stats.friends).toBe(555555);
      expect(result.current.stats.uniqueTags).toBe(444444);
    });

    it('handles partial user counts', () => {
      setMockUserCounts({
        id: 'test-user-id',
        posts: 10,
        // Missing other fields
      } as UserCountsModelSchema);

      const { result } = renderHook(() => useProfileStats('test-user-id'));

      expect(result.current.stats.posts).toBe(10);
      expect(result.current.stats.replies).toBe(0);
      expect(result.current.stats.followers).toBe(0);
    });
  });

  describe('Controller integration', () => {
    it('calls UserController.getCounts with correct userId', () => {
      renderHook(() => useProfileStats('test-user-id'));

      // UserController.getCounts should be called with object parameter (queryFn)
      expect(UserController.getCounts).toHaveBeenCalledWith({ userId: 'test-user-id' });
    });

    it('does not call UserController.fetchCounts when data is cached (cache hit optimization)', () => {
      // mockUserCounts.current is non-null by default → useLiveQuery returns non-null data
      // → useLocalFirstQuery skips fetchFn (Phase 1 early-return optimization)
      renderHook(() => useProfileStats('test-user-id'));

      expect(UserController.fetchCounts).not.toHaveBeenCalled();
    });

    it('does not call getCounts or fetchCounts when enabled is false', () => {
      setMockUserCounts(undefined);
      renderHook(() => useProfileStats('test-user-id', { enabled: false }));

      expect(UserController.getCounts).not.toHaveBeenCalled();
      expect(UserController.fetchCounts).not.toHaveBeenCalled();
    });
  });
});
