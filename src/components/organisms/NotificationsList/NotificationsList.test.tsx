import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NotificationsList } from './NotificationsList';
import { NotificationType, type FlatNotification } from '@/models/notification/notification.types';
// Mock NotificationItem
vi.mock('@/organisms/NotificationItem/NotificationItem', () => ({
  NotificationItem: ({ notification }: { notification: FlatNotification }) => (
    <div data-testid="notification-item" data-type={notification.type}>
      {notification.type}
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

  it('renders list of notifications', () => {
    render(<NotificationsList notifications={mockNotifications} unreadNotifications={[]} />);
    const items = screen.getAllByTestId('notification-item');
    expect(items).toHaveLength(3);
  });

  it('renders empty list when no notifications', () => {
    render(<NotificationsList notifications={[]} unreadNotifications={[]} />);
    const items = screen.queryAllByTestId('notification-item');
    expect(items).toHaveLength(0);
  });

  it('renders notifications in correct order', () => {
    render(<NotificationsList notifications={mockNotifications} unreadNotifications={[]} />);
    const items = screen.getAllByTestId('notification-item');
    expect(items[0]).toHaveAttribute('data-type', NotificationType.Follow);
    expect(items[1]).toHaveAttribute('data-type', NotificationType.Reply);
    expect(items[2]).toHaveAttribute('data-type', NotificationType.TagPost);
  });
});

describe('NotificationsList - Snapshots', () => {
  it('matches snapshot with notifications', () => {
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
    const { container } = render(<NotificationsList notifications={notifications} unreadNotifications={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with empty list', () => {
    const { container } = render(<NotificationsList notifications={[]} unreadNotifications={[]} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
