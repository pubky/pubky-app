import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NotificationType } from '@/models/notification/notification.types';
import {
  NotificationActorAvatar,
  NotificationActorHeading,
  NotificationTimestampAndIcon,
} from './NotificationRowChrome';

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: ({ name, className }: { name: string; className?: string }) => (
    <div data-testid="avatar-with-fallback" data-name={name} className={className} />
  ),
}));

vi.mock('@/molecules/NotificationIcon/NotificationIcon', () => ({
  NotificationIcon: ({ type, postKind }: { type: NotificationType; postKind?: string }) => (
    <div data-testid="notification-icon" data-type={type} data-post-kind={postKind} />
  ),
}));

vi.mock('@/molecules/RelativeTimestamp/RelativeTimestamp', () => ({
  RelativeTimestamp: ({ timeAgo }: { timeAgo: string }) => <span data-testid="relative-timestamp">{timeAgo}</span>,
}));

vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => ({
  useRelativeTime: () => ({ formatRelativeTime: () => '37m' }),
}));

describe('NotificationActorAvatar', () => {
  it('links the avatar to the profile when a link is given', () => {
    render(
      <NotificationActorAvatar
        avatarUrl={undefined}
        userName="Oliver"
        fallbackSeed="oliver"
        userProfileLink="/profile/oliver"
      />,
    );

    expect(screen.getByRole('link')).toHaveAttribute('href', '/profile/oliver');
    expect(screen.getByTestId('avatar-with-fallback')).toHaveAttribute('data-name', 'Oliver');
  });

  it('renders a plain avatar without a profile link', () => {
    render(
      <NotificationActorAvatar avatarUrl={undefined} userName="Oliver" fallbackSeed="oliver" userProfileLink={null} />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByTestId('avatar-with-fallback')).toHaveClass('shrink-0');
  });
});

describe('NotificationActorHeading', () => {
  it('links the username and the action to their targets', () => {
    render(
      <NotificationActorHeading
        userName="Oliver"
        userProfileLink="/profile/oliver"
        actionText="followed you"
        actionLink="/post/oliver/123"
      />,
    );

    expect(screen.getByRole('link', { name: 'Oliver' })).toHaveAttribute('href', '/profile/oliver');
    expect(screen.getByRole('link', { name: 'followed you' })).toHaveAttribute('href', '/post/oliver/123');
  });

  it('falls back to plain text when there are no targets', () => {
    render(<NotificationActorHeading userName="Oliver" userProfileLink={null} actionText="followed you" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Oliver')).toBeInTheDocument();
    expect(screen.getByText('followed you')).toBeInTheDocument();
  });
});

describe('NotificationTimestampAndIcon', () => {
  const baseProps = {
    timestampDate: new Date('2026-01-01T12:00:00Z'),
    isMobile: false,
    type: NotificationType.Follow,
    showBadge: false,
  };

  it('wraps the cluster in a link to the notification target', () => {
    render(<NotificationTimestampAndIcon {...baseProps} link="/post/oliver/123" />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/post/oliver/123');
    expect(screen.getByTestId('relative-timestamp')).toHaveTextContent('37m');
    expect(screen.getByTestId('notification-icon')).toBeInTheDocument();
  });

  it('renders a plain cluster with extra classes when there is no target', () => {
    const { container } = render(<NotificationTimestampAndIcon {...baseProps} className="shrink-0" />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(container.firstElementChild).toHaveClass('flex', 'items-center', 'gap-2', 'shrink-0');
  });

  it('passes the post kind through to the icon', () => {
    render(<NotificationTimestampAndIcon {...baseProps} type={NotificationType.PostEdited} postKind="collection" />);

    expect(screen.getByTestId('notification-icon')).toHaveAttribute('data-post-kind', 'collection');
  });
});

describe('NotificationRowChrome - Snapshots', () => {
  it('matches snapshot for a linked avatar', () => {
    const { container } = render(
      <NotificationActorAvatar
        avatarUrl={undefined}
        userName="Oliver"
        fallbackSeed="oliver"
        userProfileLink="/profile/oliver"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a fully linked heading', () => {
    const { container } = render(
      <NotificationActorHeading
        userName="Oliver"
        userProfileLink="/profile/oliver"
        actionText="followed you"
        actionLink="/post/oliver/123"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a plain-text heading', () => {
    const { container } = render(
      <NotificationActorHeading userName="Oliver" userProfileLink={null} actionText="followed you" />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a linked timestamp cluster', () => {
    const { container } = render(
      <NotificationTimestampAndIcon
        timestampDate={new Date('2026-01-01T12:00:00Z')}
        isMobile={false}
        type={NotificationType.Follow}
        showBadge={true}
        link="/post/oliver/123"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a plain timestamp cluster', () => {
    const { container } = render(
      <NotificationTimestampAndIcon
        timestampDate={new Date('2026-01-01T12:00:00Z')}
        isMobile={false}
        type={NotificationType.PostEdited}
        postKind="collection"
        showBadge={false}
        className="shrink-0"
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
