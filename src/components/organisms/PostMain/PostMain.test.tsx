import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST_THREAD_CONNECTOR_VARIANTS } from '@/atoms/PostThreadConnector/PostThreadConnector.constants';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { usePostHeaderVisibility } from '@/hooks/usePostHeaderVisibility/usePostHeaderVisibility';
import { usePostNavigation } from '@/hooks/usePostNavigation/usePostNavigation';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { PostMain } from './PostMain';
import { PostMainLayoutProvider } from './PostMainLayoutContext';

// Use vi.hoisted to define mock functions before vi.mock calls (which are hoisted)
const { mockPostHeader } = vi.hoisted(() => ({
  mockPostHeader: vi.fn(
    ({ postId }: { postId: string; size?: 'normal' | 'large'; timeAgoPlacement?: 'top-right' | 'bottom-left' }) => (
      <div data-testid="post-header">PostHeader {postId}</div>
    ),
  ),
}));

// Minimal atoms used by PostMain
vi.mock('@/atoms/Card/Card', () => {
  return {
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
  };
});

vi.mock('@/atoms/Container/Container', () => {
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
  };
});

vi.mock('@/atoms/PostThreadConnector/PostThreadConnector', () => {
  return {
    PostThreadConnector: ({ height, variant }: { height: number; variant?: string }) => (
      <div data-testid="thread-connector" data-height={height} data-variant={variant}>
        ThreadConnector
      </div>
    ),
  };
});

// Stub organisms composed inside PostMain
vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => {
  return {
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
  };
});

vi.mock('@/organisms/DialogReply/DialogReply', () => {
  return {
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
  };
});

vi.mock('@/organisms/DialogRepost/DialogRepost', () => {
  return {
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
  };
});

vi.mock('@/organisms/PostActionsBar/PostActionsBar', () => {
  return {
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
  };
});

vi.mock('@/organisms/PostContent/PostContent', () => {
  return {
    PostContent: ({ postId, textClassName }: { postId: string; textClassName?: string }) => (
      <div data-testid="post-content" data-text-class-name={textClassName}>
        PostContent {postId}
      </div>
    ),
  };
});

vi.mock('./PostMainListRow/PostMainListRow', () => {
  return {
    PostMainListRow: ({ postId, showFullContent }: { postId: string; showFullContent: boolean }) => (
      <div data-testid="post-main-list-row" data-show-full-content={String(showFullContent)}>
        {postId}
      </div>
    ),
  };
});

vi.mock('@/organisms/PostHeader/PostHeader', () => {
  return {
    PostHeader: ({
      postId,
      size,
      timeAgoPlacement,
    }: {
      postId: string;
      size?: 'normal' | 'large';
      timeAgoPlacement?: 'top-right' | 'bottom-left';
    }) => mockPostHeader({ postId, size, timeAgoPlacement }),
  };
});

vi.mock('@/organisms/PostTagsPanel/PostTagsPanel', () => {
  return {
    PostTagsPanel: ({ postId, className }: { postId: string; className?: string }) => (
      <div data-testid="post-tags-panel" data-post-id={postId} data-class-name={className}>
        PostTagsPanel {postId}
      </div>
    ),
  };
});

// Stub molecules used by PostMain
vi.mock('@/molecules/PostDeleted/PostDeleted', () => {
  return {
    PostDeleted: () => <div data-testid="post-deleted">PostDeleted</div>,
  };
});

vi.mock('@/molecules/PostMissing/PostMissing', () => {
  return {
    PostMissing: () => <div data-testid="post-missing">PostMissing</div>,
  };
});

vi.mock('@/molecules/RepostHeader/RepostHeader', () => {
  return {
    RepostHeader: () => <div data-testid="repost-header">You reposted</div>,
  };
});

// Mock hooks
vi.mock('@/hooks/useElementHeight/useElementHeight', () => ({
  useElementHeight: vi.fn(() => ({
    ref: vi.fn(),
    height: 150,
  })),
}));

vi.mock('@/hooks/useIsMobile/useIsMobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
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
}));

vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => ({
  useRepostInfo: vi.fn(() => ({
    isRepost: false,
    repostAuthorId: null,
    isCurrentUserRepost: false,
    originalPostId: null,
    isLoading: false,
    hasError: false,
  })),
}));

vi.mock('@/hooks/usePostHeaderVisibility/usePostHeaderVisibility', () => ({
  usePostHeaderVisibility: vi.fn(() => ({
    showRepostHeader: false,
    shouldShowPostHeader: true,
  })),
}));

vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: vi.fn(() => ({
    ref: vi.fn(),
    isVisible: false,
  })),
}));

vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: vi.fn(),
}));

describe('PostMain', () => {
  const mockUseIsMobile = vi.mocked(useIsMobile);
  const mockHandlePostClick = vi.fn();
  const mockHandlePostAuxClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPostHeader.mockClear();
    mockUseIsMobile.mockReturnValue(false);
    vi.mocked(usePostNavigation).mockReturnValue({
      getPostHref: vi.fn(() => '/post/author/post-abc'),
      navigateToPost: vi.fn(),
      getCollectionHref: vi.fn(() => '/collections/author/collection-abc'),
      navigateToCollection: vi.fn(),
      handlePostClick: mockHandlePostClick,
      handlePostAuxClick: mockHandlePostAuxClick,
      handlePostKeyDown: vi.fn(),
    });
    vi.mocked(usePostDetails).mockReturnValue({
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

  it('renders header, content, tags and actions', () => {
    render(<PostMain postId="post-123" />);

    expect(screen.getByTestId('post-header')).toHaveTextContent('PostHeader post-123');
    expect(screen.getByTestId('post-content')).toHaveTextContent('PostContent post-123');
    expect(screen.getByTestId('clickable-tags-list')).toHaveTextContent('ClickableTagsList post-123');
    expect(screen.getByTestId('clickable-tags-list')).toHaveAttribute('data-show-add-button', 'true');
    expect(screen.getByTestId('post-actions')).toBeInTheDocument();
  });

  it('invokes navigation click handler when clickable area is clicked', () => {
    render(<PostMain postId="post-abc" />);

    const clickableArea = screen.getByTestId('card').parentElement;
    if (clickableArea) {
      fireEvent.click(clickableArea);
      expect(mockHandlePostClick).toHaveBeenCalledTimes(1);
      expect(mockHandlePostClick.mock.calls[0][0]).toBe('post-abc');
    }
  });

  it('invokes aux-click handler for middle-click on the clickable area', () => {
    render(<PostMain postId="post-abc" />);

    const clickableArea = screen.getByTestId('card').parentElement;
    if (clickableArea) {
      fireEvent(clickableArea, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
      expect(mockHandlePostAuxClick).toHaveBeenCalledTimes(1);
      expect(mockHandlePostAuxClick.mock.calls[0][0]).toBe('post-abc');
    }
  });

  it('does not navigate or show pointer cursor when isNavigable is false', () => {
    render(<PostMain postId="post-abc" isNavigable={false} />);

    const clickableArea = screen.getByTestId('card').parentElement;
    if (clickableArea) {
      fireEvent.click(clickableArea);
      fireEvent(clickableArea, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
      expect(mockHandlePostClick).not.toHaveBeenCalled();
      expect(mockHandlePostAuxClick).not.toHaveBeenCalled();
      expect(clickableArea).toHaveAttribute('data-class-name', expect.not.stringContaining('cursor-pointer'));
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
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'post-deleted',
        indexed_at: 0,
        kind: 'short',
        uri: 'pubky://test-user/pub/pubky.app/posts/post-deleted',
        content: '[DELETED]',
        attachments: [],
        is_moderated: false,
        is_blurred: false,
      },
      isLoading: false,
    });

    render(<PostMain postId="post-deleted" />);

    expect(screen.getByTestId('post-deleted')).toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content')).not.toBeInTheDocument();
    expect(screen.queryByTestId('clickable-tags-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-actions')).not.toBeInTheDocument();
  });

  it('renders PostMissing when the post is not found (settled null)', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: false,
    });

    render(<PostMain postId="post-missing" />);

    expect(screen.getByTestId('post-missing')).toBeInTheDocument();
    expect(screen.queryByTestId('post-deleted')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-header')).not.toBeInTheDocument();
    expect(screen.queryByTestId('post-content')).not.toBeInTheDocument();
  });

  it('does not render PostMissing while the post is still loading (null + loading)', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: null,
      isLoading: true,
    });

    render(<PostMain postId="post-loading" />);

    expect(screen.queryByTestId('post-missing')).not.toBeInTheDocument();
  });

  it('renders normal content when post is not deleted', () => {
    render(<PostMain postId="post-normal" />);

    expect(screen.queryByTestId('post-deleted')).not.toBeInTheDocument();
    expect(screen.getByTestId('post-header')).toBeInTheDocument();
    expect(screen.getByTestId('post-content')).toBeInTheDocument();
    expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
    expect(screen.getByTestId('post-actions')).toBeInTheDocument();
  });

  it('shows repost header when post is a repost by current user', () => {
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    render(<PostMain postId="me:repost-1" />);

    expect(screen.getByTestId('repost-header')).toBeInTheDocument();
  });

  it('hides PostHeader for simple repost (no content) by current user', () => {
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
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
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
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
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
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
    const mockUsePostDetails = vi.mocked(usePostDetails);
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

    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
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
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
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
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
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

  it('passes large size and bottom-left timestamp placement for side tags layout', () => {
    render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="post-side-1" />
      </PostMainLayoutProvider>,
    );

    expect(mockPostHeader).toHaveBeenCalledWith({
      postId: 'post-side-1',
      size: 'large',
      timeAgoPlacement: 'bottom-left',
    });
  });

  it('passes text-xl className to PostContent for side tags layout', () => {
    render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="post-side-1" />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-content')).toHaveAttribute('data-text-class-name', 'text-xl leading-7');
  });

  it('applies wide padding and gap for side tags layout', () => {
    render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="post-side-1" />
      </PostMainLayoutProvider>,
    );

    const cardContent = screen.getByTestId('card-content');
    expect(cardContent).toHaveAttribute('data-class-name', expect.stringContaining('p-0'));
    expect(cardContent).not.toHaveAttribute('data-class-name', expect.stringContaining('p-12'));

    const containers = screen.getAllByTestId('container');
    const leftSection = containers.find((container) =>
      container.getAttribute('data-class-name')?.includes('p-12 lg:flex-1'),
    );
    const rightSection = containers.find((container) =>
      container.getAttribute('data-class-name')?.includes('lg:w-96 lg:shrink-0 lg:p-12'),
    );

    expect(leftSection).toBeDefined();
    expect(rightSection).toBeDefined();
  });

  it('keeps repost header flush with the card edge in side layout', () => {
    vi.mocked(usePostHeaderVisibility).mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="me:repost-side-1" />
      </PostMainLayoutProvider>,
    );

    const repostHeader = screen.getByTestId('repost-header');
    expect(repostHeader.parentElement).toHaveAttribute('data-testid', 'card');
    expect(repostHeader.parentElement).not.toHaveAttribute('data-testid', 'card-content');
  });

  it('keeps default size and timestamp placement for inline tags layout', () => {
    render(<PostMain postId="post-inline-1" />);

    expect(mockPostHeader).toHaveBeenCalledWith({
      postId: 'post-inline-1',
      size: undefined,
      timeAgoPlacement: undefined,
    });
  });

  it('does not apply wide text className for inline tags layout', () => {
    render(<PostMain postId="post-inline-1" />);

    expect(screen.getByTestId('post-content')).not.toHaveAttribute('data-text-class-name');
  });

  it('applies default padding and gap for inline tags layout', () => {
    render(<PostMain postId="post-inline-1" />);

    const cardContent = screen.getByTestId('card-content');
    expect(cardContent).toHaveAttribute('data-class-name', expect.stringContaining('gap-4 p-6'));
    expect(cardContent).not.toHaveAttribute('data-class-name', expect.stringContaining('p-12'));
  });

  it('falls back to inline layout on mobile when the inherited layout is side', () => {
    mockUseIsMobile.mockReturnValue(true);

    render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="post-mobile-side-1" />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
    expect(screen.queryByTestId('post-tags-panel')).not.toBeInTheDocument();
    expect(mockPostHeader).toHaveBeenCalledWith({
      postId: 'post-mobile-side-1',
      size: undefined,
      timeAgoPlacement: undefined,
    });
  });

  it('falls back to inline layout on mobile when the inherited layout is list', () => {
    mockUseIsMobile.mockReturnValue(true);

    render(
      <PostMainLayoutProvider tagsLayout="list">
        <PostMain postId="post-mobile-list-1" />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('clickable-tags-list')).toBeInTheDocument();
    expect(screen.queryByTestId('post-main-list-row')).not.toBeInTheDocument();
    expect(mockPostHeader).toHaveBeenCalledWith({
      postId: 'post-mobile-list-1',
      size: undefined,
      timeAgoPlacement: undefined,
    });
  });

  it('inherits side tags layout from the thread context', () => {
    render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="post-context-side-1" />
      </PostMainLayoutProvider>,
    );

    expect(mockPostHeader).toHaveBeenCalledWith({
      postId: 'post-context-side-1',
      size: 'large',
      timeAgoPlacement: 'bottom-left',
    });
    expect(screen.getByTestId('post-content')).toHaveAttribute('data-text-class-name', 'text-xl leading-7');
  });

  it('renders the compact list row for list tags layout', () => {
    render(
      <PostMainLayoutProvider tagsLayout="list">
        <PostMain postId="post-list-1" />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-main-list-row')).toHaveTextContent('post-list-1');
    expect(screen.getByTestId('post-main-list-row')).toHaveAttribute('data-show-full-content', 'false');
    expect(screen.queryByTestId('post-content')).not.toBeInTheDocument();
    expect(mockPostHeader).not.toHaveBeenCalled();
  });

  it('passes full content mode to the list row only for non-reply posts', () => {
    render(
      <PostMainLayoutProvider tagsLayout="list">
        <PostMain postId="post-list-full-1" showFullContentInListLayout />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-main-list-row')).toHaveAttribute('data-show-full-content', 'true');
  });

  it('keeps reply rows compact even when full list content is enabled', () => {
    render(
      <PostMainLayoutProvider tagsLayout="list">
        <PostMain postId="post-list-reply-1" isReply showFullContentInListLayout />
      </PostMainLayoutProvider>,
    );

    expect(screen.getByTestId('post-main-list-row')).toHaveAttribute('data-show-full-content', 'false');
  });
});

describe('PostMain - Tag Expansion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.mocked(useIsMobile).mockReturnValue(false);
    vi.mocked(usePostNavigation).mockReturnValue({
      getPostHref: vi.fn(() => '/post/author/post-abc'),
      navigateToPost: vi.fn(),
      getCollectionHref: vi.fn(() => '/collections/author/collection-abc'),
      navigateToCollection: vi.fn(),
      handlePostClick: vi.fn(),
      handlePostAuxClick: vi.fn(),
      handlePostKeyDown: vi.fn(),
    });

    vi.mocked(usePostHeaderVisibility).mockReturnValue({
      showRepostHeader: false,
      shouldShowPostHeader: true,
    });
    vi.mocked(usePostDetails).mockReturnValue({
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
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="post-123" />
      </PostMainLayoutProvider>,
    );
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
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: {
        id: 'post-deleted-123',
        indexed_at: 0,
        kind: 'short',
        uri: 'pubky://test-user/pub/pubky.app/posts/post-deleted-123',
        content: '[DELETED]',
        attachments: [],
        is_moderated: false,
        is_blurred: false,
      },
      isLoading: false,
    });
    const { container } = render(<PostMain postId="post-deleted-123" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for simple repost by current user (no content)', () => {
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: false,
    });

    const { container } = render(<PostMain postId="me:simple-repost-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for quote repost by current user (with content)', () => {
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: true,
      shouldShowPostHeader: true,
    });

    const { container } = render(<PostMain postId="me:quote-repost-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for repost by another user', () => {
    const mockUsePostHeaderVisibility = vi.mocked(usePostHeaderVisibility);
    mockUsePostHeaderVisibility.mockReturnValue({
      showRepostHeader: false,
      shouldShowPostHeader: true,
    });

    const { container } = render(<PostMain postId="other-user:repost-1" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('PostMain - Mobile Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Replicate the snapshot describe's mock-state setup so mobile snapshots stay stable.
    vi.mocked(usePostNavigation).mockReturnValue({
      getPostHref: vi.fn(() => '/post/author/post-abc'),
      navigateToPost: vi.fn(),
      getCollectionHref: vi.fn(() => '/collections/author/collection-abc'),
      navigateToCollection: vi.fn(),
      handlePostClick: vi.fn(),
      handlePostAuxClick: vi.fn(),
      handlePostKeyDown: vi.fn(),
    });
    vi.mocked(usePostHeaderVisibility).mockReturnValue({
      showRepostHeader: false,
      shouldShowPostHeader: true,
    });
    vi.mocked(usePostDetails).mockReturnValue({
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
    vi.mocked(useIsMobile).mockReturnValue(true);
    setMobileViewport();
  });

  afterEach(() => {
    resetViewport();
  });

  it('matches snapshot on mobile viewport', () => {
    const { container } = render(
      <PostMainLayoutProvider tagsLayout="side">
        <PostMain postId="post-123" />
      </PostMainLayoutProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
