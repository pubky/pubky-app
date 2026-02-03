import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SinglePostContent } from './SinglePostContent';
import * as Hooks from '@/hooks';

// Mock hooks
const mockUsePostReplies = vi.fn(() => ({
  replyIds: [],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(),
  refresh: vi.fn(),
  prependReply: vi.fn(),
}));

const mockUseRequireAuth = vi.fn(() => ({
  isAuthenticated: true,
  requireAuth: vi.fn((action: () => unknown) => action()),
}));

const mockUsePostNavigation = vi.fn(() => ({
  navigateToPost: vi.fn(),
}));

const mockUsePostDetails = vi.fn(() => ({
  postDetails: {
    id: 'author:post123',
    indexed_at: Date.now(),
    kind: 'short' as const,
    uri: 'pubky://author/pub/pubky.app/posts/post123',
    content: 'Test post content',
    attachments: [],
    is_blurred: false,
  },
  isLoading: false,
}));

const mockUseInfiniteScroll = vi.fn(() => ({
  sentinelRef: vi.fn(),
}));

const mockUsePostAncestors = vi.fn(() => ({
  ancestors: [],
  isLoading: false,
  hasError: false,
}));

const mockUseUserDetailsFromIds = vi.fn(() => ({
  users: [],
  isLoading: false,
}));

vi.mock('@/hooks', () => ({
  usePostReplies: vi.fn(),
  usePostNavigation: vi.fn(),
  usePostDetails: vi.fn(),
  useInfiniteScroll: vi.fn(),
  useRequireAuth: vi.fn(),
  usePostAncestors: vi.fn(),
  useUserDetailsFromIds: vi.fn(),
}));

// Use vi.hoisted to define mock functions before vi.mock calls
const { mockIsPostDeleted } = vi.hoisted(() => ({
  mockIsPostDeleted: vi.fn(() => false),
}));

// Mock libs - use actual implementations except for isPostDeleted
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    isPostDeleted: mockIsPostDeleted,
  };
});

// Mock atoms
vi.mock('@/atoms', () => ({
  Container: ({
    children,
    className,
    overrideDefaults,
  }: {
    children: React.ReactNode;
    className?: string;
    overrideDefaults?: boolean;
  }) => (
    <div data-testid="container" data-class-name={className} data-override-defaults={overrideDefaults}>
      {children}
    </div>
  ),
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" data-class-name={className}>
      {children}
    </div>
  ),
  Spinner: ({ size }: { size?: string }) => (
    <div data-testid="spinner" data-size={size}>
      Loading...
    </div>
  ),
  Typography: ({ children, as, className }: { children: React.ReactNode; as?: string; className?: string }) => (
    <span data-testid="typography" data-as={as} data-class-name={className}>
      {children}
    </span>
  ),
  PostThreadSpacer: () => <div data-testid="post-thread-spacer" />,
  POST_THREAD_CONNECTOR_VARIANTS: {
    REGULAR: 'regular',
    LAST: 'last',
  },
}));

// Mock molecules
vi.mock('@/molecules', () => ({
  TimelineError: ({ message }: { message: string }) => <div data-testid="timeline-error">{message}</div>,
  TimelineLoadingMore: () => <div data-testid="timeline-loading-more">Loading more...</div>,
  TimelineEndMessage: () => <div data-testid="timeline-end-message">End of replies</div>,
  PostDeleted: () => <div data-testid="post-deleted">Post deleted</div>,
}));

// Mock organisms used by SinglePostContent
vi.mock('../SinglePostArticle', () => ({
  SinglePostArticle: ({
    postId,
    content,
    isBlurred,
  }: {
    postId: string;
    content: string;
    attachments: unknown[];
    isBlurred: boolean;
  }) => (
    <div data-testid="single-post-article" data-post-id={postId} data-content={content} data-is-blurred={isBlurred}>
      SinglePostArticle
    </div>
  ),
}));

vi.mock('../SinglePostCard', () => ({
  SinglePostCard: ({ postId }: { postId: string }) => (
    <div data-testid="single-post-card" data-post-id={postId}>
      SinglePostCard
    </div>
  ),
}));

vi.mock('../PostPageHeader', () => ({
  PostPageHeader: ({ postId }: { postId: string }) => (
    <div data-testid="post-page-header" data-post-id={postId}>
      PostPageHeader
    </div>
  ),
}));

vi.mock('../SinglePostParticipants', () => ({
  SinglePostParticipants: ({ postId }: { postId: string }) => (
    <div data-testid="single-post-participants" data-post-id={postId}>
      SinglePostParticipants
    </div>
  ),
}));

vi.mock('../QuickReply', () => ({
  QuickReply: ({
    parentPostId,
    connectorVariant,
    onReplySubmitted,
  }: {
    parentPostId: string;
    connectorVariant?: string;
    onReplySubmitted?: (replyId: string) => void;
  }) => (
    <div
      data-testid="quick-reply"
      data-parent-post-id={parentPostId}
      data-connector-variant={connectorVariant}
      onClick={() => onReplySubmitted?.('reply-123')}
    >
      QuickReply
    </div>
  ),
}));

vi.mock('../PostMain', () => ({
  PostMain: ({
    postId,
    isReply,
    onClick,
    isLastReply,
  }: {
    postId: string;
    isReply?: boolean;
    onClick?: () => void;
    isLastReply?: boolean;
  }) => (
    <div
      data-testid="post-main"
      data-post-id={postId}
      data-is-reply={isReply}
      data-is-last-reply={isLastReply}
      onClick={onClick}
    >
      PostMain {postId}
    </div>
  ),
}));

describe('SinglePostContent', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPostDeleted.mockReturnValue(false);
    vi.mocked(Hooks.useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(Hooks.usePostReplies).mockReturnValue(mockUsePostReplies());
    vi.mocked(Hooks.usePostNavigation).mockReturnValue(mockUsePostNavigation());
    vi.mocked(Hooks.usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(Hooks.useInfiniteScroll).mockReturnValue(
      mockUseInfiniteScroll() as unknown as ReturnType<typeof Hooks.useInfiniteScroll>,
    );
    vi.mocked(Hooks.usePostAncestors).mockReturnValue(mockUsePostAncestors());
    vi.mocked(Hooks.useUserDetailsFromIds).mockReturnValue(mockUseUserDetailsFromIds());
  });

  describe('rendering', () => {
    it('renders SinglePostCard for short posts', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('single-post-card')).toBeInTheDocument();
      expect(screen.getByTestId('single-post-card')).toHaveAttribute('data-post-id', mockPostId);
      expect(screen.queryByTestId('single-post-article')).not.toBeInTheDocument();
    });

    it('renders SinglePostArticle for long posts', () => {
      vi.mocked(Hooks.usePostDetails).mockReturnValue({
        postDetails: {
          id: mockPostId,
          indexed_at: Date.now(),
          kind: 'long' as const,
          uri: 'pubky://author/pub/pubky.app/posts/post123',
          content: '# Article Title\n\nArticle content',
          attachments: [],
          is_blurred: false,
        },
        isLoading: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('single-post-article')).toBeInTheDocument();
      expect(screen.queryByTestId('single-post-card')).not.toBeInTheDocument();
    });

    it('renders loading text when postDetails is not available', () => {
      vi.mocked(Hooks.usePostDetails).mockReturnValue({
        postDetails: undefined,
        isLoading: true,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByText('Loading post...')).toBeInTheDocument();
    });

    it('renders QuickReply component when parent post is not deleted', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('quick-reply')).toBeInTheDocument();
      expect(screen.getByTestId('quick-reply')).toHaveAttribute('data-parent-post-id', mockPostId);
    });

    it('does not render QuickReply when parent post is deleted', () => {
      mockIsPostDeleted.mockReturnValue(true);

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.queryByTestId('quick-reply')).not.toBeInTheDocument();
    });

    it('renders PostDeleted component instead of post content when post is deleted', () => {
      mockIsPostDeleted.mockReturnValue(true);

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('post-deleted')).toBeInTheDocument();
      expect(screen.queryByTestId('single-post-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('single-post-article')).not.toBeInTheDocument();
    });

    it('renders SinglePostParticipants sidebar', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('single-post-participants')).toBeInTheDocument();
      expect(screen.getByTestId('single-post-participants')).toHaveAttribute('data-post-id', mockPostId);
    });
  });

  describe('loading states', () => {
    it('shows loading spinner when replies are loading', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        loading: true,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('spinner')).toBeInTheDocument();
      expect(screen.getByText('Loading replies...')).toBeInTheDocument();
    });

    it('shows loading more indicator when loading additional replies', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: ['reply-1', 'reply-2'],
        loadingMore: true,
        hasMore: true,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('timeline-loading-more')).toBeInTheDocument();
    });
  });

  describe('error states', () => {
    it('shows error message when there is an error', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        error: 'Failed to load replies',
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('timeline-error')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-error')).toHaveTextContent('Failed to load replies');
    });

    it('does not show error when loading', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        loading: true,
        error: 'Failed to load replies',
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.queryByTestId('timeline-error')).not.toBeInTheDocument();
    });
  });

  describe('replies list', () => {
    it('renders reply items when replies are available', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: ['reply-1', 'reply-2', 'reply-3'],
      });

      render(<SinglePostContent postId={mockPostId} />);

      const replyItems = screen.getAllByTestId('post-main');
      expect(replyItems).toHaveLength(3);
      expect(replyItems[0]).toHaveAttribute('data-post-id', 'reply-1');
      expect(replyItems[1]).toHaveAttribute('data-post-id', 'reply-2');
      expect(replyItems[2]).toHaveAttribute('data-post-id', 'reply-3');
    });

    it('marks reply items as replies', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: ['reply-1'],
      });

      render(<SinglePostContent postId={mockPostId} />);

      const replyItem = screen.getByTestId('post-main');
      expect(replyItem).toHaveAttribute('data-is-reply', 'true');
    });

    it('marks last reply correctly when no more replies', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: ['reply-1', 'reply-2'],
        hasMore: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      const replyItems = screen.getAllByTestId('post-main');
      expect(replyItems[0]).toHaveAttribute('data-is-last-reply', 'false');
      expect(replyItems[1]).toHaveAttribute('data-is-last-reply', 'true');
    });

    it('does not mark last reply when there are more replies to load', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: ['reply-1', 'reply-2'],
        hasMore: true,
      });

      render(<SinglePostContent postId={mockPostId} />);

      const replyItems = screen.getAllByTestId('post-main');
      expect(replyItems[1]).toHaveAttribute('data-is-last-reply', 'false');
    });

    it('shows end message when all replies are loaded', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: ['reply-1'],
        hasMore: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('timeline-end-message')).toBeInTheDocument();
    });

    it('does not show end message when there are no replies', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: [],
        hasMore: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.queryByTestId('timeline-end-message')).not.toBeInTheDocument();
    });
  });

  describe('quick reply connector variant', () => {
    it('uses REGULAR connector when there are replies', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: ['reply-1'],
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('quick-reply')).toHaveAttribute('data-connector-variant', 'regular');
    });

    it('uses REGULAR connector when hasMore is true even with no loaded replies', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: [],
        hasMore: true,
        loading: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('quick-reply')).toHaveAttribute('data-connector-variant', 'regular');
    });

    it('uses LAST connector when there are no replies and no more to load', () => {
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        replyIds: [],
        hasMore: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(screen.getByTestId('quick-reply')).toHaveAttribute('data-connector-variant', 'last');
    });
  });

  describe('hooks integration', () => {
    it('calls usePostReplies with the correct postId when authenticated', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(Hooks.usePostReplies).toHaveBeenCalledWith(mockPostId);
    });

    it('calls usePostReplies with null when not authenticated', () => {
      vi.mocked(Hooks.useRequireAuth).mockReturnValue({
        isAuthenticated: false,
        requireAuth: vi.fn(),
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(Hooks.usePostReplies).toHaveBeenCalledWith(null);
    });

    it('calls usePostDetails with the correct postId', () => {
      render(<SinglePostContent postId={mockPostId} />);

      expect(Hooks.usePostDetails).toHaveBeenCalledWith(mockPostId);
    });

    it('calls useInfiniteScroll with correct parameters', () => {
      const mockLoadMore = vi.fn();
      vi.mocked(Hooks.usePostReplies).mockReturnValue({
        ...mockUsePostReplies(),
        loadMore: mockLoadMore,
        hasMore: true,
        loadingMore: false,
      });

      render(<SinglePostContent postId={mockPostId} />);

      expect(Hooks.useInfiniteScroll).toHaveBeenCalledWith({
        onLoadMore: mockLoadMore,
        hasMore: true,
        isLoading: false,
        threshold: 3000,
        debounceMs: 20,
      });
    });
  });
});

describe('SinglePostContent - Snapshots', () => {
  const mockPostId = 'author:post123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPostDeleted.mockReturnValue(false);
    vi.mocked(Hooks.useRequireAuth).mockReturnValue(mockUseRequireAuth());
    vi.mocked(Hooks.usePostReplies).mockReturnValue(mockUsePostReplies());
    vi.mocked(Hooks.usePostNavigation).mockReturnValue(mockUsePostNavigation());
    vi.mocked(Hooks.usePostDetails).mockReturnValue(mockUsePostDetails());
    vi.mocked(Hooks.useInfiniteScroll).mockReturnValue(
      mockUseInfiniteScroll() as unknown as ReturnType<typeof Hooks.useInfiniteScroll>,
    );
    vi.mocked(Hooks.usePostAncestors).mockReturnValue(mockUsePostAncestors());
    vi.mocked(Hooks.useUserDetailsFromIds).mockReturnValue(mockUseUserDetailsFromIds());
  });

  it('matches snapshot with short post and no replies', () => {
    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with long post (article)', () => {
    vi.mocked(Hooks.usePostDetails).mockReturnValue({
      postDetails: {
        id: mockPostId,
        indexed_at: Date.now(),
        kind: 'long' as const,
        uri: 'pubky://author/pub/pubky.app/posts/post123',
        content: '# Article Title\n\nArticle content',
        attachments: [],
        is_blurred: false,
      },
      isLoading: false,
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with loading replies state', () => {
    vi.mocked(Hooks.usePostReplies).mockReturnValue({
      ...mockUsePostReplies(),
      loading: true,
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with replies', () => {
    vi.mocked(Hooks.usePostReplies).mockReturnValue({
      ...mockUsePostReplies(),
      replyIds: ['reply-1', 'reply-2'],
      hasMore: false,
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with error state', () => {
    vi.mocked(Hooks.usePostReplies).mockReturnValue({
      ...mockUsePostReplies(),
      error: 'Failed to load replies',
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with deleted parent post', () => {
    mockIsPostDeleted.mockReturnValue(true);

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with loading more state', () => {
    vi.mocked(Hooks.usePostReplies).mockReturnValue({
      ...mockUsePostReplies(),
      replyIds: ['reply-1'],
      loadingMore: true,
      hasMore: true,
    });

    const { container } = render(<SinglePostContent postId={mockPostId} />);
    expect(container).toMatchSnapshot();
  });
});
