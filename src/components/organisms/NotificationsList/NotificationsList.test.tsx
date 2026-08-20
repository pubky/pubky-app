import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type FlatNotification, NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { NotificationsList } from './NotificationsList';
import type { GroupableNotification, NotificationListEntry } from './NotificationsList.types';

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: mockUseIsMobile,
}));

// Mock NotificationItem
vi.mock('@/organisms/NotificationItem/NotificationItem', () => ({
  NotificationItem: ({
    notification,
    isUnread,
    isMobile,
  }: {
    notification: FlatNotification;
    isUnread: boolean;
    isMobile: boolean;
  }) => (
    <div
      data-testid="notification-item"
      data-type={notification.type}
      data-unread={isUnread ? 'true' : 'false'}
      data-mobile={isMobile ? 'true' : undefined}
    >
      {notification.type}
    </div>
  ),
}));

vi.mock('@/organisms/NotificationGroupItem/NotificationGroupItem', () => ({
  NotificationGroupItem: ({
    notifications,
    isUnread,
    isMobile,
    isExpanded,
    onExpandedChange,
  }: {
    notifications: GroupableNotification[];
    isUnread: boolean;
    isMobile: boolean;
    isExpanded?: boolean;
    onExpandedChange?: (expanded: boolean) => void;
  }) => (
    <div
      data-testid="notification-group-item"
      data-type={notifications[0].type}
      data-count={notifications.length}
      data-unread={isUnread ? 'true' : 'false'}
      data-mobile={isMobile ? 'true' : undefined}
      data-expanded={isExpanded ? 'true' : 'false'}
    >
      <button type="button" onClick={() => onExpandedChange?.(!isExpanded)}>
        toggle
      </button>
      {notifications[0].type}
    </div>
  ),
}));

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="container" className={className}>
        {children}
      </div>
    ),
  };
});

const toSingle = (notification: FlatNotification): NotificationListEntry => ({ kind: 'single', notification });

const toGroup = (notifications: GroupableNotification[]): NotificationListEntry => ({ kind: 'group', notifications });

const deletedBy = (deleter: string, timestamp: number): GroupableNotification => ({
  id: `post_deleted:${timestamp}:${deleter}`,
  type: NotificationType.PostDeleted,
  timestamp,
  delete_source: PostChangedSource.Reply,
  deleted_by: deleter,
  deleted_uri: `pubky://${deleter}/pub/pubky.app/posts/deleted-${timestamp}`,
  linked_uri: `pubky://viewer/pub/pubky.app/posts/linked-${timestamp}`,
});

beforeEach(() => {
  mockUseIsMobile.mockReset();
  mockUseIsMobile.mockReturnValue(false);
});

describe('NotificationsList', () => {
  const mockNotifications: FlatNotification[] = [
    {
      id: 'follow:123:user1',
      type: NotificationType.Follow,
      timestamp: Date.now() - 1000 * 60 * 30,
      followed_by: 'user1',
    } as FlatNotification,
    {
      id: 'reply:123:user2',
      type: NotificationType.Reply,
      timestamp: Date.now() - 1000 * 60 * 60,
      replied_by: 'user2',
      parent_post_uri: 'user1:post123',
      reply_uri: 'user2:reply456',
    } as FlatNotification,
    {
      id: 'tagpost:123:user3',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 60 * 2,
      tagged_by: 'user3',
      tag_label: 'bitcoin',
      post_uri: 'user3:post789',
    } as FlatNotification,
  ];

  const mockEntries = mockNotifications.map(toSingle);

  it('renders list of notifications', () => {
    render(<NotificationsList entries={mockEntries} unreadNotifications={[]} />);
    const items = screen.getAllByTestId('notification-item');
    expect(items).toHaveLength(3);
  });

  it('renders empty list when no notifications', () => {
    render(<NotificationsList entries={[]} unreadNotifications={[]} />);
    const items = screen.queryAllByTestId('notification-item');
    expect(items).toHaveLength(0);
  });

  it('renders notifications in correct order', () => {
    render(<NotificationsList entries={mockEntries} unreadNotifications={[]} />);
    const items = screen.getAllByTestId('notification-item');
    expect(items[0]).toHaveAttribute('data-type', NotificationType.Follow);
    expect(items[1]).toHaveAttribute('data-type', NotificationType.Reply);
    expect(items[2]).toHaveAttribute('data-type', NotificationType.TagPost);
  });

  it('detects the viewport once and shares the result with every notification', () => {
    mockUseIsMobile.mockReturnValue(true);

    render(<NotificationsList entries={mockEntries} unreadNotifications={[]} />);

    expect(mockUseIsMobile).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('notification-item').every((item) => item.dataset.mobile === 'true')).toBe(true);
  });

  it('renders a group entry as a single grouped row', () => {
    const grouped = [deletedBy('deleter', 3000), deletedBy('deleter', 2000)];

    render(<NotificationsList entries={[toGroup(grouped)]} unreadNotifications={[]} />);

    expect(screen.getAllByTestId('notification-group-item')).toHaveLength(1);
    expect(screen.queryAllByTestId('notification-item')).toHaveLength(0);
    expect(screen.getByTestId('notification-group-item')).toHaveAttribute('data-count', '2');
  });

  it('interleaves grouped and single rows in entry order', () => {
    const grouped = [deletedBy('deleter', 3000), deletedBy('deleter', 2000)];
    const entries = [toGroup(grouped), toSingle(mockNotifications[0])];

    const { container } = render(<NotificationsList entries={entries} unreadNotifications={[]} />);

    const rendered = container.querySelectorAll(
      '[data-testid="notification-group-item"], [data-testid="notification-item"]',
    );
    expect(rendered[0]).toHaveAttribute('data-testid', 'notification-group-item');
    expect(rendered[1]).toHaveAttribute('data-testid', 'notification-item');
  });

  it('marks a single row unread when its notification is unread', () => {
    render(<NotificationsList entries={mockEntries} unreadNotifications={[mockNotifications[0]]} />);

    const items = screen.getAllByTestId('notification-item');
    expect(items[0]).toHaveAttribute('data-unread', 'true');
    expect(items[1]).toHaveAttribute('data-unread', 'false');
  });

  it('marks a group unread when only a trailing member is unread', () => {
    const newest = deletedBy('deleter', 3000);
    const oldest = deletedBy('deleter', 2000);

    render(<NotificationsList entries={[toGroup([newest, oldest])]} unreadNotifications={[oldest]} />);

    expect(screen.getByTestId('notification-group-item')).toHaveAttribute('data-unread', 'true');
  });

  it('keeps a group expanded when its members change and the row remounts', async () => {
    const newest = deletedBy('deleter', 4000);
    const middle = deletedBy('deleter', 3000);
    const oldest = deletedBy('deleter', 2000);

    const { rerender } = render(<NotificationsList entries={[toGroup([middle, oldest])]} unreadNotifications={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    expect(screen.getByTestId('notification-group-item')).toHaveAttribute('data-expanded', 'true');

    // A refresh prepends a newer member, which changes the row's key and remounts it;
    // the disclosure state lives here, so the group the user is reading stays open.
    rerender(<NotificationsList entries={[toGroup([newest, middle, oldest])]} unreadNotifications={[]} />);

    expect(screen.getByTestId('notification-group-item')).toHaveAttribute('data-expanded', 'true');
  });

  it('collapses a group again once the row reports it closed', async () => {
    const grouped = [deletedBy('deleter', 3000), deletedBy('deleter', 2000)];

    render(<NotificationsList entries={[toGroup(grouped)]} unreadNotifications={[]} />);

    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));
    await userEvent.click(screen.getByRole('button', { name: 'toggle' }));

    expect(screen.getByTestId('notification-group-item')).toHaveAttribute('data-expanded', 'false');
  });

  it('marks a group read when none of its members are unread', () => {
    const grouped = [deletedBy('deleter', 3000), deletedBy('deleter', 2000)];

    render(<NotificationsList entries={[toGroup(grouped)]} unreadNotifications={[]} />);

    expect(screen.getByTestId('notification-group-item')).toHaveAttribute('data-unread', 'false');
  });
});

/** Shared by the desktop and mobile snapshots, which must render the same input. */
const renderSnapshotList = () => {
  const notifications: FlatNotification[] = [
    {
      id: 'follow:123:user1',
      type: NotificationType.Follow,
      timestamp: Date.now() - 1000 * 60 * 30,
      followed_by: 'user1',
    } as FlatNotification,
    {
      id: 'reply:123:user2',
      type: NotificationType.Reply,
      timestamp: Date.now() - 1000 * 60 * 60,
      replied_by: 'user2',
      parent_post_uri: 'user1:post123',
      reply_uri: 'user2:reply456',
    } as FlatNotification,
  ];

  return render(<NotificationsList entries={notifications.map(toSingle)} unreadNotifications={[]} />);
};

describe('NotificationsList - Snapshots', () => {
  it('matches snapshot with notifications', () => {
    const { container } = renderSnapshotList();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty list', () => {
    const { container } = render(<NotificationsList entries={[]} unreadNotifications={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('NotificationsList - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
    mockUseIsMobile.mockReturnValue(true);
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = renderSnapshotList();
    expect(container.firstChild).toMatchSnapshot();
  });
});
