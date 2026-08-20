import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import type { GroupableNotification } from '@/organisms/NotificationsList/NotificationsList.types';
import { NotificationGroupPostTitle } from './NotificationGroupPostTitle';

type PostContentResult = { content: string | null; isDeleted: boolean; isMissing: boolean; isResolving: boolean };

const mockUseNotificationPostContent = vi.hoisted(() =>
  vi.fn<(options: { compositeId: string | null }) => PostContentResult>(() => ({
    content: 'Apple releases the new iPhone',
    isDeleted: false,
    isMissing: false,
    isResolving: false,
  })),
);

const postContent = (overrides: Partial<PostContentResult>): PostContentResult => ({
  content: null,
  isDeleted: false,
  isMissing: false,
  isResolving: false,
  ...overrides,
});

vi.mock('@/hooks/useNotificationPostContent/useNotificationPostContent', () => ({
  useNotificationPostContent: mockUseNotificationPostContent,
}));

const TIMESTAMP = new Date('2026-01-01T12:00:00Z').getTime();

function editedNotification(editedUri?: string): GroupableNotification {
  return {
    id: `post_edited:${TIMESTAMP}:oliver`,
    type: NotificationType.PostEdited,
    timestamp: TIMESTAMP,
    edit_source: PostChangedSource.Reply,
    edited_by: 'oliver',
    edited_uri: editedUri ?? 'pubky://oliver/pub/pubky.app/posts/post123',
    linked_uri: 'pubky://viewer/pub/pubky.app/posts/linked123',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNotificationPostContent.mockReturnValue(postContent({ content: 'Apple releases the new iPhone' }));
});

describe('NotificationGroupPostTitle', () => {
  it('renders the resolved title in double quotes, linking to the post', () => {
    render(<NotificationGroupPostTitle notification={editedNotification()} />);

    const link = screen.getByRole('link');
    expect(link).toHaveTextContent('"Apple releases the new iPhone"');
    expect(link).toHaveAttribute('href', '/post/oliver/post123');
  });

  it('truncates a long title at 40 characters', () => {
    mockUseNotificationPostContent.mockReturnValue(
      postContent({ content: 'Apple releases the new iPhone and everybody rushes to buy it' }),
    );

    render(<NotificationGroupPostTitle notification={editedNotification()} />);

    expect(screen.getByRole('link')).toHaveTextContent('"Apple releases the new iPhone and everyb..."');
  });

  it('asks the post-content hook for the edited post', () => {
    render(<NotificationGroupPostTitle notification={editedNotification()} />);

    expect(mockUseNotificationPostContent).toHaveBeenCalledWith(
      expect.objectContaining({ compositeId: 'oliver:post123', notifyOnCollectionParseError: false }),
    );
  });

  it('shows a skeleton while the title is still resolving', () => {
    mockUseNotificationPostContent.mockReturnValue(postContent({ isResolving: true }));

    const { container } = render(<NotificationGroupPostTitle notification={editedNotification()} />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('falls back to a placeholder once the title settles with nothing', () => {
    mockUseNotificationPostContent.mockReturnValue(postContent({}));

    const { container } = render(<NotificationGroupPostTitle notification={editedNotification()} />);

    expect(screen.getByText('Untitled post')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeInTheDocument();
    // The post still exists (only its label failed to derive), so navigation stays valid.
    expect(screen.getByRole('link')).toHaveAttribute('href', '/post/oliver/post123');
  });

  it('drops the link when the post itself is gone', () => {
    mockUseNotificationPostContent.mockReturnValue(postContent({ isMissing: true }));

    render(<NotificationGroupPostTitle notification={editedNotification()} />);

    expect(screen.getByText('Untitled post')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a deleted member as a plain unlinked notice, not a quoted title', () => {
    mockUseNotificationPostContent.mockReturnValue(
      postContent({ content: 'This post has been deleted by its author.', isDeleted: true }),
    );

    render(<NotificationGroupPostTitle notification={editedNotification()} />);

    // The notice renders verbatim: no quotes, no 40-char cut, and nothing to click.
    expect(screen.getByText('This post has been deleted by its author.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders plain text when the post URI cannot be resolved to a route', () => {
    mockUseNotificationPostContent.mockReturnValue(postContent({}));

    render(<NotificationGroupPostTitle notification={editedNotification('not-a-pubky-uri')} />);

    expect(screen.getByText('Untitled post')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('NotificationGroupPostTitle - Snapshots', () => {
  it('matches snapshot with a resolved title', () => {
    const { container } = render(<NotificationGroupPostTitle notification={editedNotification()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot while resolving', () => {
    mockUseNotificationPostContent.mockReturnValue(postContent({ isResolving: true }));

    const { container } = render(<NotificationGroupPostTitle notification={editedNotification()} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with an unresolvable post', () => {
    mockUseNotificationPostContent.mockReturnValue(postContent({}));

    const { container } = render(<NotificationGroupPostTitle notification={editedNotification('not-a-pubky-uri')} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
