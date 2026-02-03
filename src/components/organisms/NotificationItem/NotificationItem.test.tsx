import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationItem } from './NotificationItem';
import { NotificationType } from '@/core/models/notification/notification.types';
import * as Core from '@/core';
import * as Libs from '@/libs';

// Hoisted mocks for isPostDeleted
const { mockIsPostDeleted } = vi.hoisted(() => ({
  mockIsPostDeleted: vi.fn(() => false),
}));

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useUserProfile: vi.fn(() => ({
      profile: { name: 'User', avatarUrl: undefined },
      isLoading: false,
    })),
  };
});

// Mock libs
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    formatNotificationTime: vi.fn((timestamp: number) => {
      const diffMs = Date.now() - timestamp;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'now';
      if (diffMins < 60) return `${diffMins}m`;
      return '1h';
    }),
    isPostDeleted: mockIsPostDeleted,
    Logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// Mock Core module
vi.mock('@/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/core')>();
  return {
    ...actual,
    ProfileController: {
      read: vi.fn(() => Promise.resolve(null)),
    },
    UserController: {
      getDetails: vi.fn(() => Promise.resolve(null)),
    },
    LocalPostService: {
      readPostDetails: vi.fn(() => Promise.resolve(null)),
    },
    PostController: {
      get getOrFetchDetails() {
        return mockGetOrFetchDetails;
      },
    },
    FileController: {
      getAvatarUrl: vi.fn((id: string) => `https://cdn.example.com/avatar/${id}`),
    },
    useAuthStore: {
      getState: vi.fn(() => ({
        currentUserPubky: 'test-user-pubky',
      })),
    },
    useNotificationStore: vi.fn((selector) => {
      const state = { lastRead: 0, setLastRead: vi.fn() };
      return selector ? selector(state) : state;
    }),
  };
});

// Mock organisms
vi.mock('@/organisms', () => ({
  AvatarWithFallback: ({ name, avatarUrl, className }: { name: string; avatarUrl?: string; className?: string }) => (
    <div data-testid="avatar-with-fallback" data-name={name} data-avatar={avatarUrl} className={className}>
      {avatarUrl ? <img src={avatarUrl} alt={name} /> : <span>{name[0]}</span>}
    </div>
  ),
}));

// Mock molecules
const mockToast = vi.fn();
const mockGetOrFetchDetails = vi.fn(() => Promise.resolve(null));
vi.mock('@/molecules', () => ({
  PostTag: ({ label, onClick }: { label: string; onClick?: (e: React.MouseEvent) => void }) => (
    <span data-testid="post-tag" onClick={onClick}>
      {label}
    </span>
  ),
  NotificationIcon: ({ type, showBadge }: { type: NotificationType; showBadge?: boolean }) => (
    <div data-testid="notification-icon" data-type={type} data-badge={showBadge ? 'true' : 'false'}>
      Icon
    </div>
  ),
  useToast: () => ({ toast: mockToast }),
}));

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="container" className={className}>
      {children}
    </div>
  ),
  Typography: ({
    children,
    as: Tag = 'p',
    className,
  }: {
    children: React.ReactNode;
    as?: React.ElementType;
    className?: string;
  }) => (
    <Tag data-testid="typography" className={className}>
      {children}
    </Tag>
  ),
}));

describe('NotificationItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.mockClear();
    mockGetOrFetchDetails.mockClear();
    mockGetOrFetchDetails.mockResolvedValue(null);
    mockIsPostDeleted.mockReturnValue(false);
  });

  const baseNotification = {
    id: 'follow:1234567890:user1',
    type: NotificationType.Follow,
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    followed_by: 'user1',
  } as Core.FlatNotification;

  it('renders notification text correctly', () => {
    render(<NotificationItem notification={baseNotification} isUnread={false} />);
    // Username and action text are now separate links
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('followed you')).toBeInTheDocument();
  });

  it('renders avatar with user data', () => {
    render(<NotificationItem notification={baseNotification} isUnread={false} />);
    const avatar = screen.getByTestId('avatar-with-fallback');
    expect(avatar).toHaveAttribute('data-name', 'User');
    expect(avatar).not.toHaveAttribute('data-avatar');
  });

  it('renders timestamp', () => {
    render(<NotificationItem notification={baseNotification} isUnread={false} />);
    expect(Libs.formatNotificationTime).toHaveBeenCalledWith(baseNotification.timestamp, false);
    expect(Libs.formatNotificationTime).toHaveBeenCalledWith(baseNotification.timestamp, true);
  });

  it('renders notification icon', () => {
    render(<NotificationItem notification={baseNotification} isUnread={false} />);
    const icon = screen.getByTestId('notification-icon');
    expect(icon).toHaveAttribute('data-type', NotificationType.Follow);
  });

  it('shows badge for recent notifications', () => {
    const recentNotification = {
      ...baseNotification,
      timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    };
    render(<NotificationItem notification={recentNotification} isUnread={true} />);
    const icon = screen.getByTestId('notification-icon');
    expect(icon).toHaveAttribute('data-badge', 'true');
  });

  it('does not show badge for old notifications', () => {
    const oldNotification = {
      ...baseNotification,
      timestamp: Date.now() - 1000 * 60 * 60 * 25, // 25 hours ago
    };
    render(<NotificationItem notification={oldNotification} isUnread={false} />);
    const icon = screen.getByTestId('notification-icon');
    expect(icon).toHaveAttribute('data-badge', 'false');
  });

  it('renders tag badge for TagPost notifications', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'bitcoin',
      post_uri: 'user1:post123',
    } as Core.FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);
    expect(screen.getByTestId('post-tag')).toBeInTheDocument();
    expect(screen.getByText('bitcoin')).toBeInTheDocument();
  });

  it('renders Mention notification without preview when post not loaded', () => {
    // Post preview is dynamically loaded - without post data, no preview is shown
    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'user1:post123',
    } as Core.FlatNotification;
    render(<NotificationItem notification={mentionNotification} isUnread={false} />);
    // Username and action text are now separate links
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('mentioned you in post')).toBeInTheDocument();
    // Preview text is not rendered since post data is not loaded in this test
  });

  it('handles missing user data gracefully', () => {
    const notificationWithUnknownUser = {
      ...baseNotification,
      followed_by: 'unknown-user',
    };
    render(<NotificationItem notification={notificationWithUnknownUser} isUnread={false} />);
    // Username and action text are now separate links
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('followed you')).toBeInTheDocument();
  });

  it('navigates to search when tag is clicked in TagPost notification', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'bitcoin',
      post_uri: 'user1:post123',
    } as Core.FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    const tag = screen.getByTestId('post-tag');
    fireEvent.click(tag);

    expect(mockPush).toHaveBeenCalledWith('/search?tags=bitcoin');
  });

  it('navigates to search when tag is clicked in TagProfile notification', () => {
    const tagNotification = {
      id: 'tagprofile:123:user1',
      type: NotificationType.TagProfile,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'developer',
      profile_uri: 'user1',
    } as Core.FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    const tag = screen.getByTestId('post-tag');
    fireEvent.click(tag);

    expect(mockPush).toHaveBeenCalledWith('/search?tags=developer');
  });

  it('encodes special characters in tag when navigating to search', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'c++',
      post_uri: 'user1:post123',
    } as Core.FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    const tag = screen.getByTestId('post-tag');
    fireEvent.click(tag);

    expect(mockPush).toHaveBeenCalledWith('/search?tags=c%2B%2B');
  });

  it('extracts title from article (long post) content in notifications', async () => {
    const articleContent = JSON.stringify({
      title: 'My Article Title',
      body: '## Introduction\n\nArticle body content here in **Markdown** format.',
    });

    mockGetOrFetchDetails.mockResolvedValue({
      kind: 'long',
      content: articleContent,
    });

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as Core.FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    // Wait for the async post fetch to complete
    // formatPreviewText wraps content in single quotes and truncates to 20 chars
    await vi.waitFor(() => {
      expect(screen.getByText("'My Article Title'")).toBeInTheDocument();
    });
  });

  it('falls back to raw content and shows toast when article JSON parsing fails', async () => {
    const invalidJson = 'not valid json content';

    mockGetOrFetchDetails.mockResolvedValue({
      kind: 'long',
      content: invalidJson,
    });

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as Core.FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    // Wait for the async post fetch to complete and toast to be called
    await vi.waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Error',
        description: 'Failed to parse article content',
      });
    });
  });

  it('uses content directly for short posts', async () => {
    mockGetOrFetchDetails.mockResolvedValue({
      kind: 'short',
      content: 'This is a short post content',
    });

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as Core.FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    // Wait for the async post fetch to complete
    // formatPreviewText wraps content in single quotes and truncates to 20 chars
    await vi.waitFor(() => {
      expect(screen.getByText("'This is a short post...'")).toBeInTheDocument();
    });
  });

  it('shows deleted message when post is deleted', async () => {
    mockIsPostDeleted.mockReturnValue(true);
    mockGetOrFetchDetails.mockResolvedValue({
      kind: 'short',
      content: '[DELETED]',
    });

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as Core.FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    // Wait for the async post fetch to complete
    // The component should show the translated 'post.deleted' message from en.json:
    // "This post has been deleted by its author." truncated to 20 chars and wrapped in quotes
    await vi.waitFor(() => {
      expect(screen.getByText("'This post has been d...'")).toBeInTheDocument();
    });
  });

  it('links to parent post (not the reply) for Reply notifications', () => {
    // Issue #1034: Reply notifications should link to the parent post thread,
    // not the isolated reply, so user sees the full conversation context
    const replyNotification = {
      id: 'reply:123:replier-user',
      type: NotificationType.Reply,
      timestamp: Date.now() - 1000 * 60 * 30,
      replied_by: 'replier-user',
      parent_post_uri: 'pubky://original-author/pub/pubky.app/posts/parent-post-id',
      reply_uri: 'pubky://replier-user/pub/pubky.app/posts/reply-post-id',
    } as Core.FlatNotification;

    render(<NotificationItem notification={replyNotification} isUnread={false} />);

    // Find the action text link
    const actionLink = screen.getByText('replied to your post');

    // Verify the href points to the PARENT post, not the reply
    expect(actionLink.closest('a')).toHaveAttribute('href', '/post/original-author/parent-post-id');
  });
});

describe('NotificationItem - Snapshots', () => {
  it('matches snapshot for Follow notification', () => {
    const notification = {
      id: 'follow:123:user1',
      type: NotificationType.Follow,
      timestamp: Date.now() - 1000 * 60 * 30,
      followed_by: 'user1',
    } as Core.FlatNotification;
    const { container } = render(<NotificationItem notification={notification} isUnread={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for TagPost notification', () => {
    const notification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'bitcoin',
      post_uri: 'user1:post123',
    } as Core.FlatNotification;
    const { container } = render(<NotificationItem notification={notification} isUnread={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for Mention notification', () => {
    const notification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'user1:post123',
    } as Core.FlatNotification;
    const { container } = render(<NotificationItem notification={notification} isUnread={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
