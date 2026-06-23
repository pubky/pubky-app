import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAvatarUrl } from '@/hooks/useAvatarUrl/useAvatarUrl';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { useRelativeTime } from '@/hooks/useRelativeTime/useRelativeTime';
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
  }: {
    children: React.ReactNode;
    className?: string;
    onClick?: React.MouseEventHandler<HTMLDivElement>;
    onAuxClick?: React.MouseEventHandler<HTMLDivElement>;
  }) => (
    <div className={className} onClick={onClick} onAuxClick={onAuxClick}>
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

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: vi.fn(),
}));

vi.mock('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp', () => ({
  PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string }) => <span>{timeAgo}</span>,
}));

vi.mock('@/molecules/PostListMediaThumbnail/PostListMediaThumbnail', () => ({
  PostListMediaThumbnail: () => <div data-testid="post-list-media-thumbnail" />,
}));

vi.mock('@/organisms/AvatarWithFallback/AvatarWithFallback', () => ({
  AvatarWithFallback: () => <div data-testid="avatar" />,
}));

vi.mock('../ClickableTagsList/ClickableTagsList', () => ({
  ClickableTagsList: () => <div data-testid="clickable-tags-list" />,
}));

vi.mock('../PostActionsBar/PostActionsBar', () => ({
  PostActionsBar: () => <div data-testid="post-actions-bar" />,
}));

vi.mock('../PostContent/PostContent', () => ({
  PostContent: ({ postId, textClassName }: { postId: string; textClassName?: string }) => (
    <div data-testid="post-content" data-post-id={postId} data-text-class-name={textClassName}>
      PostContent {postId}
    </div>
  ),
}));

vi.mock('../PostTagsPanel/PostTagsPanel', () => {
  const PostTagsPanel = React.forwardRef<HTMLDivElement>((_props, ref) => (
    <div ref={ref} data-testid="post-tags-panel" />
  ));
  PostTagsPanel.displayName = 'PostTagsPanel';
  return { PostTagsPanel };
});

describe('PostMainListRow', () => {
  const mockPostDetails = (content: string) => {
    vi.mocked(useAvatarUrl).mockReturnValue('https://example.com/avatar.png');
    vi.mocked(useRelativeTime).mockReturnValue({ formatRelativeTime: () => '1m' });
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
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'author:post',
        indexed_at: Date.now(),
        kind: 'short',
        uri: 'pubky://author/pub/pubky.app/posts/post',
        content,
        attachments: [],
        is_moderated: false,
        is_blurred: false,
      },
      isLoading: false,
    });
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
    expect(screen.getByTestId('post-content').parentElement).toHaveClass('ml-14');
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
});
