import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotifications } from '@/hooks/useNotifications/useNotifications';
import { NotificationType } from '@/models/notification/notification.types';
import { NotificationsContainer } from './NotificationsContainer';

const authStoreState = vi.hoisted(() => ({ session: {} as unknown }));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector?: (state: { session: unknown | null }) => unknown) =>
    selector ? selector(authStoreState) : authStoreState,
}));

// Mock useNotifications hook
vi.mock('@/hooks/useNotifications/useNotifications', () => ({
  useNotifications: vi.fn(() => ({
    notifications: [
      {
        id: 'follow:123:user1',
        type: NotificationType.Follow,
        timestamp: Date.now() - 1000 * 60 * 30,
        followed_by: 'user1',
      },
    ],
    unreadNotifications: [],
    count: 27,
    unreadCount: 0,
    isLoading: false,
    isLoadingMore: false,
    hasMore: false,
    error: null,
    loadMore: vi.fn(),
    refresh: vi.fn(),
    markAllAsRead: vi.fn(),
    isNotificationUnread: vi.fn(() => false),
  })),
}));

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: vi.fn(() => ({
    sentinelRef: vi.fn(),
  })),
}));

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
      overrideDefaults?: boolean;
    }) => <div className={className}>{children}</div>,
  };
});

vi.mock('@/atoms/Heading/Heading', () => {
  return {
    Heading: ({ children, level, className }: { children: React.ReactNode; level?: number; className?: string }) => {
      const Tag = `h${level || 1}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return (
        <Tag data-testid={`heading-${level || 1}`} className={className}>
          {children}
        </Tag>
      );
    },
  };
});

vi.mock('@/atoms/Skeleton/Skeleton', () => {
  return {
    Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
  };
});

vi.mock('@/atoms/Spinner/Spinner', () => {
  return {
    Spinner: ({ size }: { size?: string }) => <div data-testid="spinner" data-size={size} />,
  };
});

// Mock molecules
vi.mock('@/molecules/NotificationsEmpty/NotificationsEmpty', () => {
  return {
    NotificationsEmpty: () => <div data-testid="notifications-empty">Nothing to see here yet</div>,
  };
});

// Mock organisms (NotificationsList is now in organisms)
vi.mock('@/organisms/NotificationsList/NotificationsList', () => ({
  NotificationsList: ({ notifications }: { notifications: unknown[] }) => (
    <div data-testid="notifications-list">{notifications.length} notifications</div>
  ),
}));

describe('NotificationsContainer', () => {
  beforeEach(() => {
    authStoreState.session = {};
  });

  it('renders without errors', () => {
    render(<NotificationsContainer />);
    expect(screen.getByTestId('heading-5')).toBeInTheDocument();
  });

  it('displays the correct heading', () => {
    render(<NotificationsContainer />);
    const heading = screen.getByTestId('heading-5');
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent(/Notifications/);
  });

  it('displays notifications list when notifications exist', () => {
    render(<NotificationsContainer />);
    expect(screen.getByTestId('notifications-list')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    vi.mocked(useNotifications).mockReturnValueOnce({
      notifications: [],
      unreadNotifications: [],
      count: 0,
      unreadCount: 0,
      isLoading: true,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      markAllAsRead: vi.fn(),
      isNotificationUnread: vi.fn(() => false),
    });
    render(<NotificationsContainer />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('shows empty state when no notifications', () => {
    vi.mocked(useNotifications).mockReturnValueOnce({
      notifications: [],
      unreadNotifications: [],
      count: 0,
      unreadCount: 0,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      markAllAsRead: vi.fn(),
      isNotificationUnread: vi.fn(() => false),
    });
    render(<NotificationsContainer />);
    expect(screen.getByText(/Nothing to see here yet/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    vi.mocked(useNotifications).mockReturnValueOnce({
      notifications: [],
      unreadNotifications: [],
      count: 0,
      unreadCount: 0,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: 'Failed to load notifications',
      loadMore: vi.fn(),
      refresh: vi.fn(),
      markAllAsRead: vi.fn(),
      isNotificationUnread: vi.fn(() => false),
    });
    render(<NotificationsContainer />);
    expect(screen.getByText(/Failed to load notifications/i)).toBeInTheDocument();
  });

  it('shows loading more indicator when paginating', () => {
    vi.mocked(useNotifications).mockReturnValueOnce({
      notifications: [
        {
          id: 'follow:123:user1',
          type: NotificationType.Follow,
          timestamp: Date.now() - 1000 * 60 * 30,
          followed_by: 'user1',
        },
      ],
      unreadNotifications: [],
      count: 1,
      unreadCount: 0,
      isLoading: false,
      isLoadingMore: true,
      hasMore: true,
      error: null,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      markAllAsRead: vi.fn(),
      isNotificationUnread: vi.fn(() => false),
    });
    render(<NotificationsContainer />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
  });

  it('calls markAllAsRead on mount and not on unmount', () => {
    const markAllAsRead = vi.fn();
    vi.mocked(useNotifications).mockReturnValue({
      notifications: [
        {
          id: 'follow:123:user1',
          type: NotificationType.Follow,
          timestamp: Date.now() - 1000 * 60 * 30,
          followed_by: 'user1',
        },
      ],
      unreadNotifications: [],
      count: 1,
      unreadCount: 0,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      markAllAsRead,
      isNotificationUnread: vi.fn(() => false),
    });
    const { unmount } = render(<NotificationsContainer />);
    expect(markAllAsRead).toHaveBeenCalledTimes(1);
    unmount();
    expect(markAllAsRead).toHaveBeenCalledTimes(1);
  });

  it('does not call markAllAsRead until authenticated', () => {
    authStoreState.session = null;
    const markAllAsRead = vi.fn();
    vi.mocked(useNotifications).mockReturnValueOnce({
      notifications: [
        {
          id: 'follow:123:user1',
          type: NotificationType.Follow,
          timestamp: Date.now() - 1000 * 60 * 30,
          followed_by: 'user1',
        },
      ],
      unreadNotifications: [],
      count: 1,
      unreadCount: 0,
      isLoading: false,
      isLoadingMore: false,
      hasMore: false,
      error: null,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      markAllAsRead,
      isNotificationUnread: vi.fn(() => false),
    });

    render(<NotificationsContainer />);

    expect(markAllAsRead).not.toHaveBeenCalled();
  });

  it('matches snapshot', () => {
    const { container } = render(<NotificationsContainer />);
    expect(container).toMatchSnapshot();
  });
});
