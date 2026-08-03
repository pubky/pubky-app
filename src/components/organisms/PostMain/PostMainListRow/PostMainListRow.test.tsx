import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { useAuthStore } from '@/stores/auth/auth.store';
import type { AuthStore } from '@/stores/auth/auth.types';
import { PostMainListRow } from './PostMainListRow';

const { mockAuthStoreSelector } = vi.hoisted(() => ({
  mockAuthStoreSelector:
    (currentUserPubky: string | null) =>
    (selector: (state: AuthStore) => unknown): unknown =>
      selector({ currentUserPubky } as AuthStore),
}));

vi.mock('@/atoms/Card/Card', () => ({
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/atoms/Container/Container', () => ({
  Container: ({
    children,
    className,
    onClick,
    onAuxClick,
    'data-testid': dataTestId,
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    onAuxClick?: React.MouseEventHandler<HTMLDivElement>;
    'data-testid'?: string;
  }) => (
    <div data-testid={dataTestId} className={className} onClick={onClick} onAuxClick={onAuxClick}>
      {children}
    </div>
  ),
}));

vi.mock('@/atoms/Link/Link', () => ({
  Link: ({
    children,
    className,
    href,
    onClick,
  }: {
    children: React.ReactNode;
    className?: string;
    href: string;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('@/atoms/Typography/Typography', () => ({
  Typography: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: vi.fn(),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: vi.fn(),
}));

vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => ({
  useRelativeTime: vi.fn(),
}));

vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => ({
  useRepostInfo: vi.fn(),
}));

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: vi.fn(),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: vi.fn(mockAuthStoreSelector(null)),
}));

vi.mock('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp', () => ({
  PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string }) => <span>{timeAgo}</span>,
}));

vi.mock('@/molecules/PostUnavailable/PostUnavailable', () => ({
  PostUnavailable: ({ message }: { message: string }) => <div data-testid="post-unavailable" data-message={message} />,
}));

vi.mock('@/molecules/PostListMediaThumbnail/PostListMediaThumbnail', () => ({
  PostListMediaThumbnail: ({ postId }: { postId: string }) => (
    <div data-testid="post-list-media-thumbnail" data-post-id={postId} />
  ),
}));

vi.mock('@/molecules/UserInfoPopover/UserInfoPopover', () => ({
  UserInfoPopover: ({
    children,
    userId,
    userName,
    avatarUrl,
    formattedPublicKey,
  }: {
    children: React.ReactNode;
    userId: string;
    userName: string;
    avatarUrl?: string;
    formattedPublicKey: string;
  }) => (
    <div
      data-testid="user-info-popover"
      data-user-id={userId}
      data-user-name={userName}
      data-avatar-url={avatarUrl}
      data-formatted-public-key={formattedPublicKey}
    >
      {children}
    </div>
  ),
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: () => <div data-testid="avatar" />,
}));

vi.mock('../../ClickableTagsList/ClickableTagsList', () => ({
  ClickableTagsList: ({ taggedId }: { taggedId: string }) => (
    <div data-testid="clickable-tags-list" data-tagged-id={taggedId} />
  ),
}));

vi.mock('../../PostActionsBar/PostActionsBar', () => ({
  PostActionsBar: ({
    postId,
    onTagClick,
    onReplyClick,
    onRepostClick,
  }: {
    postId: string;
    onTagClick?: () => void;
    onReplyClick?: () => void;
    onRepostClick?: () => void;
  }) => (
    <div data-testid="post-actions-bar" data-post-id={postId}>
      <button data-testid="tag-button" onClick={onTagClick}>
        Tag
      </button>
      <button data-testid="reply-button" onClick={onReplyClick}>
        Reply
      </button>
      <button data-testid="repost-button" onClick={onRepostClick}>
        Repost
      </button>
    </div>
  ),
}));

vi.mock('../../PostContent/PostContent', () => ({
  PostContent: ({
    postId,
    textClassName,
    mediaVariant,
  }: {
    postId: string;
    textClassName?: string;
    mediaVariant?: string;
  }) => (
    <div
      data-testid="post-content"
      data-post-id={postId}
      data-text-class-name={textClassName}
      data-media-variant={mediaVariant}
    >
      PostContent {postId}
    </div>
  ),
}));

vi.mock('../../PostContentBlurred/PostContentBlurred', () => ({
  PostContentBlurred: ({ postId, className, variant }: { postId: string; className?: string; variant?: string }) => (
    <div data-testid="post-content-blurred" data-post-id={postId} data-variant={variant} className={className} />
  ),
}));

vi.mock('../../PostTagsPanel/PostTagsPanel', () => {
  const PostTagsPanel = React.forwardRef<HTMLDivElement, { postId: string }>(({ postId }, ref) => (
    <div ref={ref} data-testid="post-tags-panel" data-post-id={postId} />
  ));
  PostTagsPanel.displayName = 'PostTagsPanel';
  return { PostTagsPanel };
});

describe('PostMainListRow', () => {
  const createPostDetails = (postId: string, content: string, indexedAt = Date.now(), kind = 'short') => ({
    id: postId,
    indexed_at: indexedAt,
    kind,
    uri: `pubky://${postId.split(':')[0]}/pub/pubky.app/posts/${postId.split(':')[1]}`,
    content,
    attachments: [],
    is_moderated: false,
    is_blurred: false,
  });

  const mockPostDetails = (content: string, kind = 'short') => {
    vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector(null));
    vi.mocked(useAvatarUrl).mockReturnValue('https://example.com/avatar.png');
    vi.mocked(useRelativeTime).mockReturnValue({ formatRelativeTime: () => '1m' });
    vi.mocked(useRepostInfo).mockReturnValue({
      isRepost: false,
      repostAuthorId: null,
      isCurrentUserRepost: false,
      originalPostId: null,
      isLoading: false,
      hasError: false,
    });
    vi.mocked(useUserDetails).mockReturnValue({
      userDetails: {
        id: 'author',
        name: 'Author',
        bio: '',
        links: null,
        status: null,
        image: null,
        indexed_at: Date.now(),
      },
      isLoading: false,
    });
    vi.mocked(usePostDetails).mockImplementation((postId) => ({
      postDetails: postId === 'author:post' ? createPostDetails('author:post', content, Date.now(), kind) : undefined,
      isLoading: false,
    }));
  };

  it('uses secondary foreground color for the post content snippet', () => {
    mockPostDetails('Some post content');
    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Some post content')).toHaveClass('text-secondary-foreground');
    expect(screen.getByTestId('post-main-list-row-header')).toHaveClass('gap-3');
    expect(screen.getByTestId('post-main-list-row-header')).not.toHaveClass('gap-6');
    expect(screen.getByTestId('post-list-media-thumbnail')).toBeInTheDocument();
    expect(screen.getByTestId('user-info-popover')).toHaveAttribute('data-user-id', 'author');
    expect(screen.getByTestId('user-info-popover')).toHaveAttribute('data-user-name', 'Author');
    expect(screen.getByTestId('user-info-popover')).toHaveAttribute(
      'data-avatar-url',
      'https://example.com/avatar.png',
    );
  });

  it('links own-user headers to the static profile route', () => {
    mockPostDetails('Own post content');
    vi.mocked(useAuthStore).mockImplementation(mockAuthStoreSelector('author'));

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Author').closest('a')).toHaveAttribute('href', '/profile');
  });

  it('renders full post content below the header row when full content is enabled', () => {
    const longContent =
      'We did it! Pubky Hackathon Champions in Lugano! This is the main post text that should remain visible in full on the single post page list layout.';
    mockPostDetails(longContent);

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={true}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.queryByText(longContent)).not.toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toHaveAttribute('data-post-id', 'author:post');
    expect(screen.getByTestId('post-content')).toHaveAttribute(
      'data-text-class-name',
      'text-base font-medium leading-5',
    );
    expect(screen.getByTestId('post-content')).toHaveAttribute('data-media-variant', 'list');
    expect(screen.queryByTestId('post-list-media-thumbnail')).not.toBeInTheDocument();
  });

  it('keeps compact list row content truncated', () => {
    const longContent =
      'This reply is intentionally long enough to exceed the compact list row snippet limit so it should keep the ellipsis behavior for replies.';
    mockPostDetails(longContent);

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    const truncatedText = screen.getByText(/This reply is intentionally long enough/);
    expect(truncatedText).toHaveTextContent('...');
    expect(truncatedText).toHaveClass('truncate');
  });

  it('replaces blurred compact content and its media thumbnail with the moderation affordance', () => {
    mockPostDetails('Sensitive post content');
    vi.mocked(usePostDetails).mockImplementation((postId) => ({
      postDetails:
        postId === 'author:post'
          ? { ...createPostDetails('author:post', 'Sensitive post content'), is_blurred: true }
          : undefined,
      isLoading: false,
    }));

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.queryByText('Sensitive post content')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-content-blurred')).toHaveAttribute('data-post-id', 'author:post');
    expect(screen.getByTestId('post-content-blurred')).toHaveAttribute('data-variant', 'compact');
    expect(screen.queryByTestId('post-list-media-thumbnail')).not.toBeInTheDocument();
  });

  it('renders collection name instead of raw collection JSON in compact rows', () => {
    const collectionContent = JSON.stringify({
      name: 'Reading list',
      description: 'Papers and notes worth revisiting',
      items: ['pubky://reader/pub/pubky.app/posts/post-1'],
    });
    mockPostDetails(collectionContent, 'collection');

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Reading list')).toHaveClass('text-secondary-foreground');
    expect(screen.queryByText(collectionContent)).not.toBeInTheDocument();
  });

  it('falls back to collection description when the parsed collection name is blank', () => {
    mockPostDetails(JSON.stringify({ name: '   ', description: 'Saved protocol notes' }), 'collection');

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Saved protocol notes')).toBeInTheDocument();
  });

  it('ignores non-string article title and body fields when building compact snippets', () => {
    mockPostDetails(JSON.stringify({ title: 123, body: ['not text'] }), 'long');

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={true}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.queryByText(/"title":123/)).not.toBeInTheDocument();
    expect(screen.queryByText('123')).not.toBeInTheDocument();
  });

  it('uses the original post summary for compact simple repost rows', () => {
    const handleReplyClick = vi.fn();
    const handleRepostClick = vi.fn();
    vi.mocked(useAvatarUrl).mockReturnValue('https://example.com/original-avatar.png');
    vi.mocked(useRelativeTime).mockReturnValue({ formatRelativeTime: () => '1m' });
    vi.mocked(useRepostInfo).mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isCurrentUserRepost: true,
      originalPostId: 'original-author:original-post',
      isLoading: false,
      hasError: false,
    });
    vi.mocked(usePostDetails).mockImplementation((postId) => ({
      postDetails:
        postId === 'author:post'
          ? createPostDetails('author:post', '')
          : postId === 'original-author:original-post'
            ? createPostDetails('original-author:original-post', 'Original reposted content')
            : undefined,
      isLoading: false,
    }));
    vi.mocked(useUserDetails).mockImplementation((userId) => ({
      userDetails: userId
        ? {
            id: userId,
            name: userId === 'original-author' ? 'Original Author' : 'Author',
            bio: '',
            links: null,
            status: null,
            image: null,
            indexed_at: Date.now(),
          }
        : undefined,
      isLoading: false,
    }));

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={false}
        onReplyClick={handleReplyClick}
        onRepostClick={handleRepostClick}
      />,
    );

    expect(screen.getByText('Original Author')).toBeInTheDocument();
    expect(screen.getByText('Original reposted content')).toHaveClass('truncate');
    expect(screen.getByTestId('clickable-tags-list')).toHaveAttribute(
      'data-tagged-id',
      'original-author:original-post',
    );
    expect(screen.getByTestId('post-actions-bar')).toHaveAttribute('data-post-id', 'original-author:original-post');
    expect(screen.getByTestId('post-list-media-thumbnail')).toHaveAttribute(
      'data-post-id',
      'original-author:original-post',
    );

    fireEvent.click(screen.getByTestId('reply-button'));
    fireEvent.click(screen.getByTestId('repost-button'));
    fireEvent.click(screen.getByTestId('tag-button'));

    expect(handleReplyClick).toHaveBeenCalledWith('original-author:original-post');
    expect(handleRepostClick).toHaveBeenCalledWith('original-author:original-post');
    expect(screen.getByTestId('post-tags-panel')).toHaveAttribute('data-post-id', 'original-author:original-post');
  });

  it('uses the original post moderation state for compact simple repost rows', () => {
    vi.mocked(useAvatarUrl).mockReturnValue('https://example.com/original-avatar.png');
    vi.mocked(useRelativeTime).mockReturnValue({ formatRelativeTime: () => '1m' });
    vi.mocked(useRepostInfo).mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isCurrentUserRepost: true,
      originalPostId: 'original-author:original-post',
      isLoading: false,
      hasError: false,
    });
    vi.mocked(usePostDetails).mockImplementation((postId) => ({
      postDetails:
        postId === 'author:post'
          ? createPostDetails('author:post', '')
          : postId === 'original-author:original-post'
            ? { ...createPostDetails('original-author:original-post', 'Blurred original content'), is_blurred: true }
            : undefined,
      isLoading: false,
    }));
    vi.mocked(useUserDetails).mockImplementation((userId) => ({
      userDetails: userId
        ? {
            id: userId,
            name: 'Original Author',
            bio: '',
            links: null,
            status: null,
            image: null,
            indexed_at: Date.now(),
          }
        : undefined,
      isLoading: false,
    }));

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={false}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.queryByText('Blurred original content')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-content-blurred')).toHaveAttribute('data-post-id', 'original-author:original-post');
    expect(screen.queryByTestId('post-list-media-thumbnail')).not.toBeInTheDocument();
  });

  it('does not expose deleted original content in compact simple repost rows', () => {
    vi.mocked(useRepostInfo).mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isCurrentUserRepost: true,
      originalPostId: 'original-author:original-post',
      isLoading: false,
      hasError: false,
    });
    vi.mocked(usePostDetails).mockImplementation((postId) => ({
      postDetails:
        postId === 'author:post'
          ? createPostDetails('author:post', '')
          : postId === 'original-author:original-post'
            ? createPostDetails('original-author:original-post', '[DELETED]')
            : undefined,
      isLoading: false,
    }));
    vi.mocked(useUserDetails).mockReturnValue({
      userDetails: undefined,
      isLoading: false,
    });

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={false}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('post-unavailable')).toHaveAttribute(
      'data-message',
      'This post has been deleted by its author.',
    );
    expect(screen.queryByText('[DELETED]')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-list-media-thumbnail')).not.toBeInTheDocument();
  });

  it('falls back to the repost row when original post details are unavailable', () => {
    vi.mocked(useAvatarUrl).mockReturnValue('https://example.com/repost-avatar.png');
    vi.mocked(useRelativeTime).mockReturnValue({ formatRelativeTime: () => '1m' });
    vi.mocked(useRepostInfo).mockReturnValue({
      isRepost: true,
      repostAuthorId: 'author',
      isCurrentUserRepost: true,
      originalPostId: 'original-author:missing-post',
      isLoading: false,
      hasError: false,
    });
    vi.mocked(usePostDetails).mockImplementation((postId) => ({
      postDetails: postId === 'author:post' ? createPostDetails('author:post', '') : null,
      isLoading: false,
    }));
    vi.mocked(useUserDetails).mockReturnValue({
      userDetails: {
        id: 'author',
        name: 'Author',
        bio: '',
        links: null,
        status: null,
        image: null,
        indexed_at: Date.now(),
      },
      isLoading: false,
    });

    render(
      <PostMainListRow
        postId="author:post"
        showFullContent={false}
        shouldShowPostHeader={false}
        onReplyClick={vi.fn()}
        onRepostClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('card-content')).toBeInTheDocument();
    expect(screen.queryByText('Original Author')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-actions-bar')).toHaveAttribute('data-post-id', 'author:post');
    expect(screen.getByTestId('post-list-media-thumbnail')).toHaveAttribute('data-post-id', 'author:post');
  });
});
