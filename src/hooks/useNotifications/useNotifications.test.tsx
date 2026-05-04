import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import { NotificationController } from '@/controllers/notification/notification';
import { NotificationType, type FlatNotification } from '@/models/notification/notification.types';

function createAllEnabledNotificationPreferences() {
  return {
    follow: true,
    newFriend: true,
    tagPost: true,
    tagProfile: true,
    mention: true,
    reply: true,
    repost: true,
    postDeleted: true,
    postEdited: true,
  };
}

// Hoist mock data
const {
  mockCurrentUserPubky,
  setMockCurrentUserPubky,
  mockUnreadCount,
  setMockUnreadCount,
  mockNotificationPreferences,
  setMockNotificationPreferences,
  mockNotificationController,
} = vi.hoisted(() => {
  const pubky = { current: 'test-user-pubky' as string | null };
  const unread = { current: 0 };
  const notificationPreferences = {
    current: createAllEnabledNotificationPreferences(),
  };
  const notificationController = {
    getOrFetchNotifications: vi.fn(() =>
      Promise.resolve({
        flatNotifications: [],
        olderThan: undefined,
      }),
    ),
    markAllAsRead: vi.fn(),
  };
  return {
    mockCurrentUserPubky: pubky,
    setMockCurrentUserPubky: (value: string | null) => {
      pubky.current = value;
    },
    mockUnreadCount: unread,
    setMockUnreadCount: (value: number) => {
      unread.current = value;
    },
    mockNotificationPreferences: notificationPreferences,
    setMockNotificationPreferences: (value: typeof notificationPreferences.current) => {
      notificationPreferences.current = value;
    },
    mockNotificationController: notificationController,
  };
});

// Mock dependencies
vi.mock('@/controllers/notification/notification', () => ({
  NotificationController: mockNotificationController,
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(() => ({
    currentUserPubky: mockCurrentUserPubky.current,
  })),
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: vi.fn((selector) => {
    const state = { lastRead: 0, unread: mockUnreadCount.current, setLastRead: vi.fn() };
    return selector ? selector(state) : state.lastRead;
  }),
}));
vi.mock('@/stores/settings/settings.store', () => ({
  useSettingsStore: vi.fn((selector) => {
    const state = { notifications: mockNotificationPreferences.current };
    return selector ? selector(state) : state;
  }),
}));

// Mock config
vi.mock('@/config/nexus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/nexus')>();
  return {
    ...actual,
    NEXUS_NOTIFICATIONS_LIMIT: 30,
  };
});

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: vi.fn(() => ({
    mutedUserIds: [],
    mutedUserIdSet: new Set(),
    isMuted: vi.fn(() => false),
    isLoading: false,
  })),
}));

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockCurrentUserPubky('test-user-pubky');
    setMockUnreadCount(0);
    setMockNotificationPreferences(createAllEnabledNotificationPreferences());
    vi.mocked(useMutedUsers).mockReturnValue({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: vi.fn(() => false),
      isLoading: false,
    });
  });

  it('should return empty notifications array when no data', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it('should return empty unread notifications array when no data', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.unreadNotifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('should not fetch when no user is authenticated', async () => {
    setMockCurrentUserPubky(null);

    const { result } = renderHook(() => useNotifications());

    // Should not be loading since there's no user
    expect(result.current.isLoading).toBe(false);
    expect(NotificationController.getOrFetchNotifications).not.toHaveBeenCalled();
  });

  it('should return isLoading as false when data is available', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('should return markAllAsRead function', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.markAllAsRead).toBeDefined();
    expect(typeof result.current.markAllAsRead).toBe('function');
  });

  it('should call markAllAsRead without errors', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(() => result.current.markAllAsRead()).not.toThrow();
    expect(NotificationController.markAllAsRead).toHaveBeenCalled();
  });

  it('should return consistent counts', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.count).toBe(result.current.notifications.length);
    expect(result.current.unreadCount).toBe(result.current.unreadNotifications.length);
  });

  it('should return isNotificationUnread function', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isNotificationUnread).toBeDefined();
    expect(typeof result.current.isNotificationUnread).toBe('function');
  });

  it('should return loadMore and refresh functions', async () => {
    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(typeof result.current.loadMore).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
  });

  it('should return notifications from controller', async () => {
    const mockNotifications = [
      { id: 'test-1', type: NotificationType.Follow, timestamp: Date.now(), followed_by: 'user1' },
    ] as FlatNotification[];

    vi.mocked(NotificationController.getOrFetchNotifications).mockResolvedValueOnce({
      flatNotifications: mockNotifications,
      olderThan: mockNotifications[0].timestamp - 1,
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toEqual(mockNotifications);
    expect(result.current.count).toBe(1);
  });

  it('filters notifications from muted users', async () => {
    const mockNotifications = [
      { id: 'test-1', type: NotificationType.Follow, timestamp: 1000, followed_by: 'muted-user' },
      { id: 'test-2', type: NotificationType.Follow, timestamp: 1001, followed_by: 'active-user' },
    ] as FlatNotification[];

    vi.mocked(useMutedUsers).mockReturnValue({
      mutedUserIds: ['muted-user'],
      mutedUserIdSet: new Set(['muted-user']),
      isMuted: vi.fn((id) => id === 'muted-user'),
      isLoading: false,
    });

    vi.mocked(NotificationController.getOrFetchNotifications).mockResolvedValueOnce({
      flatNotifications: mockNotifications,
      olderThan: 999,
    });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toEqual([mockNotifications[1]]);
    expect(result.current.count).toBe(1);
  });

  it('should call loadMore with olderThan parameter', async () => {
    const mockNotifications = [
      { id: 'test-1', type: NotificationType.Follow, timestamp: 1000, followed_by: 'user1' },
    ] as FlatNotification[];

    vi.mocked(NotificationController.getOrFetchNotifications)
      .mockResolvedValueOnce({
        flatNotifications: mockNotifications,
        olderThan: 999,
      })
      .mockResolvedValueOnce({
        flatNotifications: [],
        olderThan: undefined,
      });

    const { result } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(NotificationController.getOrFetchNotifications).toHaveBeenCalledWith({
      olderThan: 999,
    });
  });

  it('should refresh notifications when unread count increases (bug #743)', async () => {
    // Initial notifications
    const initialNotifications = [
      { id: 'test-1', type: NotificationType.Follow, timestamp: 1000, followed_by: 'user1' },
    ] as FlatNotification[];

    // Updated notifications (includes a new notification)
    const updatedNotifications = [
      { id: 'test-2', type: NotificationType.Follow, timestamp: 2000, followed_by: 'user2' },
      { id: 'test-1', type: NotificationType.Follow, timestamp: 1000, followed_by: 'user1' },
    ] as FlatNotification[];

    vi.mocked(NotificationController.getOrFetchNotifications)
      .mockResolvedValueOnce({
        flatNotifications: initialNotifications,
        olderThan: 999,
      })
      .mockResolvedValueOnce({
        flatNotifications: updatedNotifications,
        olderThan: 999,
      });

    const { result, rerender } = renderHook(() => useNotifications());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.notifications).toEqual(initialNotifications);
    expect(result.current.count).toBe(1);

    // Simulate the store's unread count increasing (as if polling detected new notifications)
    await act(async () => {
      setMockUnreadCount(2);
      // Force a rerender to simulate what happens when the store state changes
      rerender();
    });

    // The notification list should have been refreshed automatically
    await waitFor(
      () => {
        expect(result.current.notifications).toEqual(updatedNotifications);
      },
      { timeout: 1000 },
    );

    expect(result.current.count).toBe(2);
    // Should have called getOrFetchNotifications twice: once on mount, once on unread count change
    expect(NotificationController.getOrFetchNotifications).toHaveBeenCalledTimes(2);
  });

  it('should reset pagination and refetch first page when notification filter changes', async () => {
    // Regression intent:
    // - User may already be paginated into older items (cursor has advanced).
    // - When notification preferences change, list query context changes.
    // - Hook should restart from first page, not continue from stale olderThan cursor.
    const olderPageNotifications = [
      { id: 'older-1', type: NotificationType.Follow, timestamp: 1000, followed_by: 'user1' },
    ] as FlatNotification[];
    const latestPageNotifications = [
      { id: 'latest-1', type: NotificationType.Reply, timestamp: 3000, replied_by: 'user2' },
    ] as FlatNotification[];

    vi.mocked(NotificationController.getOrFetchNotifications)
      .mockResolvedValueOnce({
        flatNotifications: olderPageNotifications,
        olderThan: 999,
      })
      .mockResolvedValueOnce({
        flatNotifications: latestPageNotifications,
        olderThan: 2999,
      });

    const { result, rerender } = renderHook(() => useNotifications());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Initial render reflects current paginated snapshot.
    expect(result.current.notifications).toEqual(olderPageNotifications);
    expect(NotificationController.getOrFetchNotifications).toHaveBeenCalledTimes(1);

    await act(async () => {
      // Simulate user toggling one notification type in Settings.
      setMockNotificationPreferences({
        ...createAllEnabledNotificationPreferences(),
        follow: false,
      });
      rerender();
    });

    // filter change should trigger a fresh first-page request ({})
    // so newest matching items are shown again.
    await waitFor(() => {
      // Includes the initial mount call + one refetch after filter change.
      expect(NotificationController.getOrFetchNotifications).toHaveBeenCalledTimes(2);
    });

    expect(NotificationController.getOrFetchNotifications).toHaveBeenNthCalledWith(2, {});
    expect(result.current.notifications).toEqual(latestPageNotifications);
  });
});
