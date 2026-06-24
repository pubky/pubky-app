import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
import { useRepostInfo } from '@/hooks/useRepostInfo/useRepostInfo';
import { useUserDetails } from '@/hooks/useUserDetails/useUserDetails';
import { PostMainListRow } from './PostMainListRow';

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

vi.mock('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp', () => ({
  PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string }) => <span>{timeAgo}</span>,
}));

vi.mock('@/molecules/PostListMediaThumbnail/PostListMediaThumbnail', () => ({
  PostListMediaThumbnail: ({ postId }: { postId: string }) => (
    <div data-testid="post-list-media-thumbnail" data-post-id={postId} />
  ),
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: () => <div data-testid="avatar" />,
}));

vi.mock('../ClickableTagsList/ClickableTagsList', () => ({
  ClickableTagsList: ({ taggedId }: { taggedId: string }) => (
    <div data-testid="clickable-tags-list" data-tagged-id={taggedId} />
  ),
}));

vi.mock('../PostActionsBar/PostActionsBar', () => ({
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

vi.mock('../PostContent/PostContent', () => ({
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

vi.mock('../PostTagsPanel/PostTagsPanel', () => {
  const PostTagsPanel = React.forwardRef<HTMLDivElement, { postId: string }>(({ postId }, ref) => (
    <div ref={ref} data-testid="post-tags-panel" data-post-id={postId} />
  ));
  PostTagsPanel.displayName = 'PostTagsPanel';
  return { PostTagsPanel };
});

describe('PostMainListRow', () => {
  const createPostDetails = (postId: string, content: string, indexedAt = Date.now()) => ({
    id: postId,
    indexed_at: indexedAt,
    kind: 'short' as const,
    uri: `pubky://${postId.split(':')[0]}/pub/pubky.app/posts/${postId.split(':')[1]}`,
    content,
    attachments: [],
    is_moderated: false,
    is_blurred: false,
  });

  const mockPostDetails = (content: string) => {
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
      postDetails: postId === 'author:post' ? createPostDetails('author:post', content) : undefined,
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
