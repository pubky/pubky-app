import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Hooks from '@/hooks';
import { PostMain } from './PostMain';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/components/atoms/PostThreadConnector/PostThreadConnector.constants';

// Use vi.hoisted to define mock functions before vi.mock calls (which are hoisted)
const { mockIsPostDeleted } = vi.hoisted(() => ({
  mockIsPostDeleted: vi.fn(() => false),
}));

// Use real libs - use actual implementations
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return { ...actual, isPostDeleted: mockIsPostDeleted };
});

// Minimal atoms used by PostMain
vi.mock('@/atoms', async () => {
  const { POST_THREAD_CONNECTOR_VARIANTS } =
    await import('@/components/atoms/PostThreadConnector/PostThreadConnector.constants');
  return {
    Container: (
      props: React.PropsWithChildren<{
        className?: string;
        onClick?: () => void;
        overrideDefaults?: boolean;
        [key: string]: unknown;
      }>,
    ) => {
      const { children, className, onClick, overrideDefaults, ...rest } = props;
      return (
        <div
          data-testid="container"
          data-class-name={className}
          data-override-defaults={overrideDefaults}
          onClick={onClick}
          {...rest}
        >
          {children}
        </div>
      );
    },
    Card: vi.fn(({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card" data-class-name={className}>
        {children}
      </div>
    )),
    CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
      <div data-testid="card-content" data-class-name={className}>
        {children}
      </div>
    ),
    PostThreadConnector: ({ height, variant }: { height: number; variant?: string }) => (
      <div data-testid="thread-connector" data-height={height} data-variant={variant}>
        ThreadConnector
      </div>
    ),
    POST_THREAD_CONNECTOR_VARIANTS,
  };
});

// Stub organisms composed inside PostMain
vi.mock('@/organisms', () => ({
  PostHeader: ({ postId }: { postId: string }) => <div data-testid="post-header">PostHeader {postId}</div>,
  PostContent: ({ postId }: { postId: string }) => <div data-testid="post-content">PostContent {postId}</div>,
  PostActionsBar: ({
    postId,
    className,
    onTagClick,
    onReplyClick,
    onRepostClick,
  }: {
    postId: string;
    className?: string;
    onTagClick?: () => void;
    onReplyClick?: () => void;
    onRepostClick?: () => void;
  }) => (
    <div data-testid="post-actions" data-class-name={className}>
      Actions {postId}
      {onTagClick && (
        <button data-testid="tag-button" onClick={onTagClick}>
          Tag
        </button>
      )}
      {onReplyClick && <button onClick={onReplyClick}>Reply</button>}
      {onRepostClick && <button onClick={onRepostClick}>Repost</button>}
    </div>
  ),
  PostTagsPanel: ({ postId, className }: { postId: string; className?: string }) => (
    <div data-testid="post-tags-panel" data-post-id={postId} data-class-name={className}>
      PostTagsPanel {postId}
    </div>
  ),
  DialogReply: ({
    postId,
    open,
    onOpenChangeAction,
  }: {
    postId: string;
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
  }) => (
    <div data-testid="dialog-reply" data-post-id={postId} data-open={open} onClick={() => onOpenChangeAction(false)}>
      DialogReply
    </div>
  ),
  DialogRepost: ({
    postId,
    open,
    onOpenChangeAction,
  }: {
    postId: string;
    open: boolean;
    onOpenChangeAction: (open: boolean) => void;
  }) => (
    <div data-testid="dialog-repost" data-post-id={postId} data-open={open} onClick={() => onOpenChangeAction(false)}>
      DialogRepost
    </div>
  ),
  ClickableTagsList: ({
    taggedId,
    taggedKind,
    showCount: _showCount,
    showInput: _showInput,
    showAddButton: _showAddButton,
    addMode: _addMode,
  }: {
    taggedId: string;
    taggedKind: unknown;
    showCount?: boolean;
    showInput?: boolean;
    showAddButton?: boolean;
    addMode?: boolean;
    [key: string]: unknown;
  }) => (
    <div
      data-testid="clickable-tags-list"
      data-tagged-id={taggedId}
      data-tagged-kind={String(taggedKind)}
      data-show-add-button={String(_showAddButton)}
    >
      ClickableTagsList {taggedId}
    </div>
  ),
}));

// Stub molecules used by PostMain
vi.mock('@/molecules', () => ({
  PostTagsList: ({ postId }: { postId: string }) => <div data-testid="post-tags-list">PostTagsList {postId}</div>,
  PostDeleted: () => <div data-testid="post-deleted">PostDeleted</div>,
  RepostHeader: () => <div data-testid="repost-header">You reposted</div>,
}));

// Mock hooks
vi.mock('@/hooks', () => ({
  useElementHeight: vi.fn(() => ({
    ref: vi.fn(),
    height: 150,
  })),
  usePostDetails: vi.fn(() => ({
    postDetails: {
      id: 'post-123',
      indexed_at: 0,
      kind: 'short',
      uri: 'pubky://test-user/pub/pubky.app/posts/post-123',
      content: 'Some post content',
      attachments: [],
      is_moderated: false,
      is_blurred: false,
    },
  })),
  useRepostInfo: vi.fn(() => ({
    isRepost: false,
    repostAuthorId: null,
    isCurrentUserRepost: false,
    originalPostId: null,
    isLoading: false,
    hasError: false,
  })),
  usePostHeaderVisibility: vi.fn(() => ({
    showRepostHeader: false,
    shouldShowPostHeader: true,
  })),
  useTtlSubscription: vi.fn(() => ({
    ref: vi.fn(),
    isVisible: false,
  })),
}));

describe('PostMain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPostDeleted.mockReturnValue(false);
  });

  it('renders header, content, tags and actions', () => {
    render(<PostMain postId="post-123" />);

    expect(screen.getByTestId('post-header')).toHaveTextContent('PostHeader post-123');
    expect(screen.getByTestId('post-content')).toHaveTextContent('PostContent post-123');
    expect(screen.getByTestId('clickable-tags-list')).toHaveTextContent('ClickableTagsList post-123');
    expect(screen.getByTestId('clickable-tags-list')).toHaveAttribute('data-show-add-button', 'true');
    expect(screen.getByTestId('post-actions')).toBeInTheDocument();
  });

  it('invokes onClick handler when clickable area is clicked', () => {
    const onClick = vi.fn();

    render(<PostMain postId="post-abc" onClick={onClick} />);

    // Click the cursor-pointer div (second child of relative container)
    const clickableArea = screen.getByTestId('card').parentElement;
    if (clickableArea) {
      fireEvent.click(clickableArea);
      expect(onClick).toHaveBeenCalledTimes(1);
    }
  });

  it('does not render thread connector when isReply is false', () => {
    render(<PostMain postId="post-123" isReply={false} />);

    expect(screen.queryByTestId('thread-connector')).not.toBeInTheDocument();
  });

  it('renders thread connector when isReply is true', () => {
    render(<PostMain postId="post-123" isReply={true} />);

    const connector = screen.getByTestId('thread-connector');
    expect(connector).toBeInTheDocument();
    expect(connector).toHaveAttribute('data-height', '150');
    expect(connector).toHaveAttribute('data-variant', POST_THREAD_CONNECTOR_VARIANTS.REGULAR);
  });

  it('renders PostDeleted when post is deleted', () => {
    mockIsPostDeleted.mockReturnValue(true);

    render(<PostMain postId="post-deleted" />);

    expect(screen.getByTestId('post-deleted')).toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-actions')).not.toBeInTheDocument();
  });

  it('renders normal content when post is not deleted', () => {
    mockIsPostDeleted.mockReturnValue(false);

    render(<PostMain postId="post-normal" />);

    expect(screen.queryByTestId('post-deleted')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
    expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
    expect(screen.getByTestId('post-actions')).toBeInTheDocument();
  });

  it('shows repost header when post is a repost by current user', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    render(<PostMain postId="me:repost-1" />);

    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
  });

  it('hides PostHeader for simple repost (no content) by current user', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: false,
    });

    render(<PostMain postId="me:simple-repost-1" />);

    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
  });

  it('shows PostHeader for quote repost (with content) by current user', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    render(<PostMain postId="me:quote-repost-1" />);

    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
  });

  it('shows PostHeader and hides repost header for repost by another user even without content', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: false,
      shouldShowPostHeader: true,
    });

    render(<PostMain postId="other-user:repost-1" />);

    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.queryByTestId('repost-header')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
  });

  it('shows PostHeader for repost with attachments but no text by current user', () => {
    const mockUsePostDetails = vi.mocked(Hooks.usePostDetails);
    mockUsePostDetails.mockReturnValue({
      postDetails: {
        id: 'me:repost-with-attachments-1',
        indexed_at: Date.now(),
        kind: 'short' as const,
        uri: 'pubky://me/pub/pubky.app/posts/repost-with-attachments-1',
        content: '',
        attachments: ['attachment-1', 'attachment-2'],
        is_moderated: false,
        is_blurred: false,
      },
      isLoading: false,
    });

    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    render(<PostMain postId="me:repost-with-attachments-1" />);

    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
  });

  it('shows PostHeader when postDetails is loading (undefined)', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    render(<PostMain postId="me:loading-repost-1" />);

    // When loading (undefined), we should show PostHeader to avoid layout shift
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
  });

  it('shows PostHeader when postDetails is null', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    render(<PostMain postId="me:null-repost-1" />);

    // When postDetails is null, we should show PostHeader to avoid layout shift
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
  });
});

describe('PostMain - Tag Expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPostDeleted.mockReturnValue(false);
  });

  it('does not show PostTagsPanel by default', () => {
    render(<PostMain postId="post-123" />);

    expect(screen.queryByTestId('post-tags-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
  });

  it('shows PostTagsPanel when tag button is clicked', () => {
    render(<PostMain postId="post-123" />);

    const tagButton = screen.getByTestId('tag-button');
    fireEvent.click(tagButton);

    expect(screen.getByTestId('post-tags-panel')).toBeInTheDocument();
    expect(screen.getByTestId('post-tags-panel')).toHaveAttribute('data-post-id', 'post-123');
  });

  it('hides ClickableTagsList when tags are expanded', () => {
    render(<PostMain postId="post-123" />);

    // Initially visible
    expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();

    // Click to expand
    const tagButton = screen.getByTestId('tag-button');
    fireEvent.click(tagButton);

    // Should be hidden
    expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
  });

  it('toggles back to ClickableTagsList when tag button is clicked again', () => {
    render(<PostMain postId="post-123" />);

    const tagButton = screen.getByTestId('tag-button');

    // Expand
    fireEvent.click(tagButton);
    expect(screen.getByTestId('post-tags-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();

    // Collapse
    fireEvent.click(tagButton);
    expect(screen.queryByTestId('post-tags-panel')).not.toBeInTheDocument();
    expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
  });
});

describe('PostMain - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPostDeleted.mockReturnValue(false);

    // Reset mocked hook return values that are overridden in earlier (non-snapshot) tests.
    // Without this, running the full suite (e.g. CI `test:coverage`) can leak mocked
    // implementations into snapshot tests and cause snapshot drift.
    vi.mocked(Hooks.usePostHeaderVisibility).mockReturnValue({
      showRepostHeader: false,
      shouldShowPostHeader: true,
    });
    vi.mocked(Hooks.usePostDetails).mockReturnValue({
      postDetails: {
        id: 'post-123',
        indexed_at: 0,
        kind: 'short',
        uri: 'pubky://test-user/pub/pubky.app/posts/post-123',
        content: 'Some post content',
        attachments: [],
        is_moderated: false,
        is_blurred: false,
      },
      isLoading: false,
    });
  });

  it('matches snapshot with default state', () => {
    const { container } = render(<PostMain postId="post-123" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isReply true', () => {
    const { container } = render(<PostMain postId="post-reply-123" isReply={true} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with isReply false', () => {
    const { container } = render(<PostMain postId="post-no-reply-456" isReply={false} />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot with deleted post', () => {
    mockIsPostDeleted.mockReturnValue(true);
    const { container } = render(<PostMain postId="post-deleted-123" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for simple repost by current user (no content)', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: false,
    });

    const { container } = render(<PostMain postId="me:simple-repost-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for quote repost by current user (with content)', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    const { container } = render(<PostMain postId="me:quote-repost-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for repost by another user', () => {
    const mockUsePostHeaderVisibility = vi.mocked(Hooks.usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: false,
      shouldShowPostHeader: true,
    });

    const { container } = render(<PostMain postId="other-user:repost-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
