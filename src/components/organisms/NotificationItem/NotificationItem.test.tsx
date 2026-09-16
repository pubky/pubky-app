import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { USER_NAME_MAX_LENGTH } from '@/config/user';
import { useUserProfile } from '@/hooks/useUserProfile/useUserProfile';
import { type FlatNotification, NotificationType, PostChangedSource } from '@/models/notification/notification.types';
import { toast } from '@/molecules/Toaster/toast';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { NotificationItem } from './NotificationItem';

function render(ui: ReactElement) {
  return rtlRender(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
}

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock hooks
vi.mock('@/hooks/useUserProfile/useUserProfile', () => ({
  useUserProfile: vi.fn(() => ({
    profile: { name: 'User', avatarUrl: undefined },
    isLoading: false,
  })),
}));

vi.mock('@/libs/logger/logger', async () => {
  const actual = await vi.importActual<typeof import('@/libs/logger/logger')>('@/libs/logger/logger');
  return {
    ...actual,
    Logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// Mock dependencies
vi.mock('@/controllers/profile/profile', () => ({
  ProfileController: {
    read: vi.fn(() => Promise.resolve(null)),
  },
}));
vi.mock('@/controllers/user/user', () => ({
  UserController: {
    getDetails: vi.fn(() => Promise.resolve(null)),
  },
}));
vi.mock('@/services/local/post/post', () => ({
  LocalPostService: {
    readPostDetails: vi.fn(() => Promise.resolve(null)),
  },
}));
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: (compositeId: string | null) => mockUsePostDetails(compositeId),
}));
vi.mock('@/controllers/file/file', () => ({
  FileController: {
    getAvatarUrl: vi.fn((id: string) => `https://cdn.example.com/avatar/${id}`),
  },
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      currentUserPubky: 'test-user-pubky',
    })),
  },
}));
vi.mock('@/stores/notification/notification.store', () => ({
  useNotificationStore: vi.fn((selector) => {
    const state = { lastRead: 0, setLastRead: vi.fn() };
    return selector ? selector(state) : state;
  }),
}));

// Mock organisms
vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => {
  return {
    AvatarWithFallback: ({ name, avatarUrl, className }: { name: string; avatarUrl?: string; className?: string }) => (
      <div data-testid="avatar-with-fallback" data-name={name} data-avatar={avatarUrl} className={className}>
        {avatarUrl ? <img src={avatarUrl} alt={name} /> : <span>{name[0]}</span>}
      </div>
    ),
  };
});

// Mock molecules
/** The post the mocked live query currently reports; null models "not found". */
const mockPostDetails = { value: null as { kind: string; content: string } | null };
const mockUsePostDetails = vi.fn((compositeId: string | null) => ({
  postDetails: compositeId ? mockPostDetails.value : null,
  isLoading: false,
}));
vi.mock('@/molecules/NotificationIcon/NotificationIcon', () => {
  return {
    NotificationIcon: ({
      type,
      postKind,
      showBadge,
    }: {
      type: NotificationType;
      postKind?: string;
      showBadge?: boolean;
    }) => (
      <div
        data-testid="notification-icon"
        data-type={type}
        data-post-kind={postKind}
        data-badge={showBadge ? 'true' : 'false'}
      >
        Icon
      </div>
    ),
  };
});

vi.mock('@/molecules/PostTag/PostTag', () => {
  return {
    PostTag: ({
      label,
      className,
      onClick,
    }: {
      label: string;
      className?: string;
      onClick?: (e: React.MouseEvent) => void;
    }) => (
      <span data-testid="post-tag" className={className} onClick={onClick}>
        {label}
      </span>
    ),
  };
});

vi.mock('@/molecules/Toaster/toast');

// Mock atoms
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({
      children,
      className,
      onClick,
    }: {
      children: React.ReactNode;
      className?: string;
      onClick?: React.MouseEventHandler;
    }) => (
      <div data-testid="container" className={className} onClick={onClick}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
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
  };
});

describe('NotificationItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(toast).mockClear();
    mockUsePostDetails.mockClear();
    mockPostDetails.value = null;
    vi.mocked(useUserProfile).mockReturnValue({
      profile: { name: 'User', avatarUrl: undefined },
      isLoading: false,
    } as ReturnType<typeof useUserProfile>);
  });

  const baseNotification = {
    id: 'follow:1234567890:user1',
    type: NotificationType.Follow,
    timestamp: Date.now() - 1000 * 60 * 30, // 30 minutes ago
    followed_by: 'user1',
  } as FlatNotification;

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
    expect(screen.getByText('30m')).toBeInTheDocument();
  });

  it('shows exact date in tooltip on hover', async () => {
    const user = userEvent.setup();
    const expectedExactLabel = new Date(baseNotification.timestamp).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'medium',
    });
    render(<NotificationItem notification={baseNotification} isUnread={false} />);

    await user.hover(screen.getByText('30m'));

    await vi.waitFor(() => {
      expect(screen.getByRole('tooltip')).toHaveTextContent(expectedExactLabel);
    });
  });

  it('does not show tooltip on mobile after hover', async () => {
    const user = userEvent.setup();
    render(<NotificationItem notification={baseNotification} isUnread={false} isMobile />);

    await user.hover(screen.getByText('30m'));

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
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

  it('hides the tag badge on mobile and keeps it visible on desktop for TagPost notifications', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'first-world-problem',
      post_uri: 'user1:post123',
    } as FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    const tag = screen.getByTestId('post-tag');
    expect(tag).toHaveTextContent('first-world-problem');
    expect(tag).toHaveClass('hidden', 'shrink-0', 'lg:inline-flex');
  });

  it('allows long tagged-post copy to wrap on mobile and uses a single-line flex layout on desktop', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'first-world-problem',
      post_uri: 'user1:post123',
    } as FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    const notificationCopy = screen.getByText('tagged your post').closest('p');
    expect(notificationCopy).toHaveClass(
      'whitespace-normal',
      'leading-normal',
      'lg:flex',
      'lg:items-baseline',
      'lg:gap-1',
      'lg:whitespace-nowrap',
    );
    expect(notificationCopy).not.toHaveClass('truncate');
    expect(notificationCopy).not.toHaveClass('lg:truncate');
    expect(notificationCopy).not.toHaveClass('leading-none');
  });

  it('truncates maximum-length unbroken usernames while keeping action text and navigation links', () => {
    const longUsername = 'B'.repeat(USER_NAME_MAX_LENGTH);
    vi.mocked(useUserProfile).mockReturnValue({
      profile: { name: longUsername, avatarUrl: undefined },
      isLoading: false,
    } as ReturnType<typeof useUserProfile>);

    render(<NotificationItem notification={baseNotification} isUnread={false} />);

    const usernameLink = screen.getByText(longUsername);
    expect(usernameLink).toHaveClass('inline-block', 'max-w-full', 'min-w-0', 'truncate', 'align-bottom');
    expect(usernameLink.closest('a')).toHaveAttribute('href', '/profile/user1');

    const actionLink = screen.getByText('followed you');
    expect(actionLink).toBeInTheDocument();
    expect(actionLink).toHaveClass('lg:shrink-0');
    expect(actionLink.closest('a')).toHaveAttribute('href', '/profile/user1');
  });

  it('renders Mention notification without preview when post not loaded', () => {
    // Post preview is dynamically loaded - without post data, no preview is shown
    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'user1:post123',
    } as FlatNotification;
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
    } as FlatNotification;
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
    } as FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    const tag = screen.getByTestId('post-tag');
    fireEvent.click(tag);

    expect(mockPush).toHaveBeenCalledWith('/search?tags=developer');
    expect(tag).toHaveClass('hidden', 'shrink-0', 'lg:inline-flex');
    expect(screen.getByText('tagged your profile').closest('a')).toHaveAttribute('href', '/profile/tagged');
    expect(screen.getByText('User').closest('a')).toHaveAttribute('href', '/profile/user1');
  });

  it('encodes special characters in tag when navigating to search', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'c++',
      post_uri: 'user1:post123',
    } as FlatNotification;
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

    mockPostDetails.value = {
      kind: 'long',
      content: articleContent,
    };

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    // Wait for the async post fetch to complete
    // formatPreviewText wraps content in single quotes and truncates to 20 chars
    await vi.waitFor(() => {
      expect(screen.getByText("'My Article Title'")).toBeInTheDocument();
    });
  });

  it('falls back to raw content without toast when article JSON parsing fails', async () => {
    const invalidJson = 'not valid json content';

    mockPostDetails.value = {
      kind: 'long',
      content: invalidJson,
    };

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    await vi.waitFor(() => {
      expect(screen.getByText(/not valid json/)).toBeInTheDocument();
    });
    expect(vi.mocked(toast)).not.toHaveBeenCalled();
  });

  it('extracts name from collection post content in notifications', async () => {
    const collectionContent = JSON.stringify({
      name: 'My Collection',
      description: 'Some description',
      items: ['user1:post1'],
    });

    mockPostDetails.value = {
      kind: 'collection',
      content: collectionContent,
    };

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    await vi.waitFor(() => {
      expect(screen.getByText("'My Collection'")).toBeInTheDocument();
    });
  });

  it('falls back to raw content and shows toast when collection JSON parsing fails', async () => {
    const invalidJson = 'not valid json content';

    mockPostDetails.value = {
      kind: 'collection',
      content: invalidJson,
    };

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    await vi.waitFor(() => {
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Could not parse collection content',
      });
    });
  });

  it('uses content directly for short posts', async () => {
    mockPostDetails.value = {
      kind: 'short',
      content: 'This is a short post content',
    };

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    // Wait for the async post fetch to complete
    // formatPreviewText wraps content in single quotes and truncates to 20 chars
    await vi.waitFor(() => {
      expect(screen.getByText("'This is a short post...'")).toBeInTheDocument();
    });
  });

  it('shows deleted message when post is deleted', async () => {
    mockPostDetails.value = {
      kind: 'short',
      content: '[DELETED]',
    };

    const mentionNotification = {
      id: 'mention:123:user1',
      type: NotificationType.Mention,
      timestamp: Date.now() - 1000 * 60 * 30,
      mentioned_by: 'user1',
      post_uri: 'pubky://user1/pub/pubky.app/posts/post123',
    } as FlatNotification;

    render(<NotificationItem notification={mentionNotification} isUnread={false} />);

    // Wait for the async post fetch to complete
    // The component should show the translated 'post.deleted' message from en.json:
    // "This post has been deleted by its author." truncated to 20 chars and wrapped in quotes
    await vi.waitFor(() => {
      expect(screen.getByText("'This post has been d...'")).toBeInTheDocument();
    });
  });

  it('renders a deleted notification without any post link', () => {
    // Design decision on PR #2314: the deleted post has no destination, so the row is
    // informational — only the avatar and username may link (to the actor's profile).
    const deletedNotification = {
      id: 'post_deleted:123:user1',
      type: NotificationType.PostDeleted,
      timestamp: Date.now() - 1000 * 60 * 30,
      delete_source: PostChangedSource.Repost,
      deleted_by: 'user1',
      deleted_uri: 'pubky://user1/pub/pubky.app/posts/post123',
      linked_uri: 'pubky://viewer/pub/pubky.app/posts/linked123',
    } as FlatNotification;

    const { container } = render(<NotificationItem notification={deletedNotification} isUnread={false} />);

    expect(screen.getByText('deleted a post').closest('a')).toBeNull();
    const hrefs = [...container.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href'));
    expect(hrefs).toEqual(['/profile/user1', '/profile/user1']);
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
    } as FlatNotification;

    render(<NotificationItem notification={replyNotification} isUnread={false} />);

    // Find the action text link
    const actionLink = screen.getByText('replied to your post');

    // Verify the href points to the PARENT post, not the reply
    expect(actionLink.closest('a')).toHaveAttribute('href', '/post/original-author/parent-post-id');
  });

  it('renders updated collection copy and links to the collection detail page', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));

    try {
      const collectionNotification = {
        id: 'post_edited:123:collection-owner',
        type: NotificationType.PostEdited,
        timestamp: new Date('2026-07-16T11:30:00Z').getTime(),
        edit_source: PostChangedSource.Repost,
        edited_by: 'collection-owner',
        edited_uri: 'pubky://collection-owner/pub/pubky.app/posts/collection-id',
        linked_uri: 'pubky://viewer/pub/pubky.app/posts/repost-id',
        post_kind: 'collection',
      } satisfies FlatNotification;

      render(<NotificationItem notification={collectionNotification} isUnread={false} />);

      expect(screen.getByText('updated collection').closest('a')).toHaveAttribute(
        'href',
        '/collections/collection-owner/collection-id',
      );
      expect(screen.getByTestId('notification-icon')).toHaveAttribute('data-post-kind', 'collection');
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the muted collection preview below the sm breakpoint', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));

    try {
      mockPostDetails.value = {
        kind: 'collection',
        content: JSON.stringify({ name: 'Based Bitcoin', description: '', items: [] }),
      };

      const collectionNotification = {
        id: 'post_edited:123:collection-owner',
        type: NotificationType.PostEdited,
        timestamp: new Date('2026-07-16T11:30:00Z').getTime(),
        edit_source: PostChangedSource.Repost,
        edited_by: 'collection-owner',
        edited_uri: 'pubky://collection-owner/pub/pubky.app/posts/collection-id',
        linked_uri: 'pubky://viewer/pub/pubky.app/posts/repost-id',
        post_kind: 'collection',
      } satisfies FlatNotification;

      render(<NotificationItem notification={collectionNotification} isUnread={false} />);

      await vi.waitFor(() => {
        const preview = screen.getByText("'Based Bitcoin'");
        expect(preview).toHaveClass('hidden', 'sm:block', 'text-muted-foreground');
      });
      expect(mockUsePostDetails).toHaveBeenCalledWith('collection-owner:collection-id');
    } finally {
      vi.useRealTimers();
    }
  });

  it('navigates to notification link when clicking empty space in the row', () => {
    render(<NotificationItem notification={baseNotification} isUnread={false} />);

    // The outermost container has the onClick handler and cursor-pointer class
    const row = screen.getAllByTestId('container')[0];
    expect(row).toHaveClass('cursor-pointer');

    // Click on the container itself (empty space)
    fireEvent.click(row);

    // Follow notification links to user profile
    expect(mockPush).toHaveBeenCalledWith('/profile/user1');
  });

  it('navigates to the tagged post from its action or empty row space', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'first-world-problem',
      post_uri: 'user1:post123',
    } as FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    expect(screen.getByText('tagged your post').closest('a')).toHaveAttribute('href', '/post/user1/post123');
    expect(screen.getByText('User').closest('a')).toHaveAttribute('href', '/profile/user1');

    fireEvent.click(screen.getAllByTestId('container')[0]);

    expect(mockPush).toHaveBeenCalledWith('/post/user1/post123');
  });

  it('does not navigate when clicking on a link inside the row', () => {
    render(<NotificationItem notification={baseNotification} isUnread={false} />);

    const link = screen.getByText('User').closest('a')!;
    // Clicking user's name link, in that case the row click handler should not be called
    fireEvent.click(link);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when clicking on a link inside the TagPost notification row', () => {
    const tagNotification = {
      id: 'tagpost:123:user1',
      type: NotificationType.TagPost,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'bitcoin',
      post_uri: 'user1:post123',
    } as FlatNotification;
    render(<NotificationItem notification={tagNotification} isUnread={false} />);

    // PostTag mock renders a span, but let's verify the closest('a, button') guard
    // by clicking a link element - the handler should bail out
    const actionLink = screen.getByText('tagged your post').closest('a')!;
    fireEvent.click(actionLink);

    // mockPush should only be called from tag click handler, not row click
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when clicking on a link inside Reply notification row', () => {
    const replyNotification = {
      id: 'reply:123:user1',
      type: NotificationType.Reply,
      timestamp: Date.now() - 1000 * 60 * 30,
      replied_by: 'user1',
      parent_post_uri: 'pubky://original-author/pub/pubky.app/posts/parent-post-id',
      reply_uri: 'pubky://user1/pub/pubky.app/posts/reply-post-id',
    } as FlatNotification;
    render(<NotificationItem notification={replyNotification} isUnread={false} />);

    const actionLink = screen.getByText('replied to your post').closest('a')!;
    fireEvent.click(actionLink);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when clicking on a link inside NewFriend notification row', () => {
    const friendNotification = {
      id: 'new_friend:123:user1',
      type: NotificationType.NewFriend,
      timestamp: Date.now() - 1000 * 60 * 30,
      followed_by: 'user1',
    } as FlatNotification;
    render(<NotificationItem notification={friendNotification} isUnread={false} />);

    const actionLink = screen.getByText('is now your friend').closest('a')!;
    fireEvent.click(actionLink);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when clicking on a link inside TagProfile notification row', () => {
    const tagProfileNotification = {
      id: 'tagprofile:123:user1',
      type: NotificationType.TagProfile,
      timestamp: Date.now() - 1000 * 60 * 30,
      tagged_by: 'user1',
      tag_label: 'developer',
    } as FlatNotification;
    render(<NotificationItem notification={tagProfileNotification} isUnread={false} />);

    const actionLink = screen.getByText('tagged your profile').closest('a')!;
    fireEvent.click(actionLink);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate via row click when clicking on the timestamp and icon link', () => {
    const replyNotification = {
      id: 'reply:123:user1',
      type: NotificationType.Reply,
      timestamp: Date.now() - 1000 * 60 * 30,
      replied_by: 'user1',
      parent_post_uri: 'pubky://original-author/pub/pubky.app/posts/parent-post-id',
      reply_uri: 'pubky://user1/pub/pubky.app/posts/reply-post-id',
    } as FlatNotification;
    render(<NotificationItem notification={replyNotification} isUnread={false} />);

    // The timestamp and icon share the same parent Link — use the icon as a stable selector
    // "notification-icon" test id comes from the NotificationIcon mock defined in this file
    const timestampLink = screen.getByTestId('notification-icon').closest('a')!;
    fireEvent.click(timestampLink);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not underline the username link on hover', () => {
    render(<NotificationItem notification={baseNotification} isUnread={false} />);

    expect(screen.getByText('User').closest('a')).not.toHaveClass('hover:underline');
  });
});

describe('NotificationItem - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPostDetails.value = null;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('matches snapshot for Follow notification', () => {
    const notification = {
      id: 'follow:123:user1',
      type: NotificationType.Follow,
      timestamp: Date.now() - 1000 * 60 * 30,
      followed_by: 'user1',
    } as FlatNotification;
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
    } as FlatNotification;
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
    } as FlatNotification;
    const { container } = render(<NotificationItem notification={notification} isUnread={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for an edited collection with a title preview', async () => {
    mockPostDetails.value = {
      kind: 'collection',
      content: JSON.stringify({ name: 'Based Bitcoin', description: '', items: [] }),
    };
    const notification = {
      id: 'post_edited:123:collection-owner',
      type: NotificationType.PostEdited,
      timestamp: new Date('2026-07-16T11:30:00Z').getTime(),
      edit_source: PostChangedSource.Repost,
      edited_by: 'collection-owner',
      edited_uri: 'pubky://collection-owner/pub/pubky.app/posts/collection-id',
      linked_uri: 'pubky://viewer/pub/pubky.app/posts/repost-id',
      post_kind: 'collection',
    } satisfies FlatNotification;

    render(<NotificationItem notification={notification} isUnread={false} />);

    // Collection names derive synchronously from the live query's value.
    expect(screen.getByText("'Based Bitcoin'")).toMatchSnapshot();
  });
});

describe('NotificationItem - Mobile Snapshots', () => {
  beforeEach(() => {
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const notification = {
      id: 'follow:123:user1',
      type: NotificationType.Follow,
      timestamp: Date.now() - 1000 * 60 * 30,
      followed_by: 'user1',
    } as FlatNotification;
    const { container } = render(<NotificationItem notification={notification} isUnread={false} isMobile />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
