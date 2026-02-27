import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationsContainer } from './NotificationsContainer';
import * as Hooks from '@/hooks';
import { NotificationType } from '@/core/models/notification/notification.types';

// Mock useNotifications hook
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
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
    useInfiniteScroll: vi.fn(() => ({
      sentinelRef: vi.fn(),
    })),
  };
});

// Mock atoms
vi.mock('@/atoms', () => ({
  Heading: ({ children, level, className }: { children: React.ReactNode; level?: number; className?: string }) => {
    const Tag = `h${level || 1}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    return (
      <Tag data-testid={`heading-${level || 1}`} className={className}>
        {children}
      </Tag>
    );
  },
  Spinner: ({ size }: { size?: string }) => <div data-testid="spinner" data-size={size} />,
  Container: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
  }) => <div className={className}>{children}</div>,
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  NotificationsEmpty: () => <div data-testid="notifications-empty">Nothing to see here yet</div>,
}));

// Mock organisms (NotificationsList is now in organisms)
vi.mock('@/organisms/NotificationsList', () => ({
  NotificationsList: ({ notifications }: { notifications: unknown[] }) => (
    <div data-testid="notifications-list">{notifications.length} notifications</div>
  ),
}));

describe('NotificationsContainer', () => {
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
    vi.mocked(Hooks.useNotifications).mockReturnValueOnce({
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
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('shows empty state when no notifications', () => {
    vi.mocked(Hooks.useNotifications).mockReturnValueOnce({
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
    vi.mocked(Hooks.useNotifications).mockReturnValueOnce({
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
    vi.mocked(Hooks.useNotifications).mockReturnValueOnce({
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
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('calls markAllAsRead on mount and not on unmount', () => {
    const markAllAsRead = vi.fn();
    vi.mocked(Hooks.useNotifications).mockReturnValue({
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

  it('matches snapshot', () => {
    const { container } = render(<NotificationsContainer />);
    expect(container).toMatchSnapshot();
  });
});
