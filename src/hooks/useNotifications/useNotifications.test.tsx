import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useNotifications } from './useNotifications';
import { NotificationType } from '@/core';
import * as Core from '@/core';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';

// Hoist mock data
const { mockCurrentUserPubky, setMockCurrentUserPubky, mockUnreadCount, setMockUnreadCount } = vi.hoisted(() => {
  const pubky = { current: 'test-user-pubky' as string | null };
  const unread = { current: 0 };
  return {
    mockCurrentUserPubky: pubky,
    setMockCurrentUserPubky: (value: string | null) => {
      pubky.current = value;
    },
    mockUnreadCount: unread,
    setMockUnreadCount: (value: number) => {
      unread.current = value;
    },
  };
});

// Mock Core
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    NotificationController: {
      getOrFetchNotifications: vi.fn(() =>
        Promise.resolve({
          flatNotifications: [],
          olderThan: undefined,
        }),
      ),
      markAllAsRead: vi.fn(),
    },
    useAuthStore: vi.fn(() => ({
      currentUserPubky: mockCurrentUserPubky.current,
    })),
    useNotificationStore: vi.fn((selector) => {
      const state = { lastRead: 0, unread: mockUnreadCount.current, setLastRead: vi.fn() };
      return selector ? selector(state) : state.lastRead;
    }),
  };
});

// Mock config
vi.mock('@/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config')>();
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
    expect(Core.NotificationController.getOrFetchNotifications).not.toHaveBeenCalled();
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
    expect(Core.NotificationController.markAllAsRead).toHaveBeenCalled();
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
    ] as Core.FlatNotification[];

    vi.mocked(Core.NotificationController.getOrFetchNotifications).mockResolvedValueOnce({
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
    ] as Core.FlatNotification[];

    vi.mocked(useMutedUsers).mockReturnValue({
      mutedUserIds: ['muted-user'],
      mutedUserIdSet: new Set(['muted-user']),
      isMuted: vi.fn((id) => id === 'muted-user'),
      isLoading: false,
    });

    vi.mocked(Core.NotificationController.getOrFetchNotifications).mockResolvedValueOnce({
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
    ] as Core.FlatNotification[];

    vi.mocked(Core.NotificationController.getOrFetchNotifications)
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

    expect(Core.NotificationController.getOrFetchNotifications).toHaveBeenCalledWith({
      olderThan: 999,
    });
  });

  it('should refresh notifications when unread count increases (bug #743)', async () => {
    // Initial notifications
    const initialNotifications = [
      { id: 'test-1', type: NotificationType.Follow, timestamp: 1000, followed_by: 'user1' },
    ] as Core.FlatNotification[];

    // Updated notifications (includes a new notification)
    const updatedNotifications = [
      { id: 'test-2', type: NotificationType.Follow, timestamp: 2000, followed_by: 'user2' },
      { id: 'test-1', type: NotificationType.Follow, timestamp: 1000, followed_by: 'user1' },
    ] as Core.FlatNotification[];

    vi.mocked(Core.NotificationController.getOrFetchNotifications)
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
    expect(Core.NotificationController.getOrFetchNotifications).toHaveBeenCalledTimes(2);
  });
});
