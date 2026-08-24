import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualPlaceholderKind, VisualRow, VisualTile } from './TimelineFeedVisual.types';
import { VisualTimelinePosts } from './VisualTimelinePosts';

const {
  mockNavigateToPost,
  mockPostHeaderUserInfo,
  mockUseInfiniteScroll,
  mockUseVisualFeedTiles,
  mockUseIsTouchDevice,
  mockUseRemoveDeletedPost,
  mockClickableTagsList,
} = vi.hoisted(() => ({
  mockNavigateToPost: vi.fn(),
  mockPostHeaderUserInfo: vi.fn(({ timeAgo }: { timeAgo?: string }) => (
    <div data-testid="visual-overlay-header">{timeAgo ? `Header:${timeAgo}` : 'Header'}</div>
  )),
  mockUseInfiniteScroll: vi.fn(),
  mockUseVisualFeedTiles: vi.fn(),
  mockUseIsTouchDevice: vi.fn(() => false),
  mockUseRemoveDeletedPost: vi.fn(),
  mockClickableTagsList: vi.fn(({ className }: { className?: string }) => (
    <div data-testid="visual-overlay-tags" className={className}>
      Tags
    </div>
  )),
}));

vi.mock('./useVisualFeedTiles', () => ({
  useVisualFeedTiles: mockUseVisualFeedTiles,
}));

vi.mock('@/hooks/useRemoveDeletedPost/useRemoveDeletedPost', () => ({
  useRemoveDeletedPost: mockUseRemoveDeletedPost,
}));

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: mockUseInfiniteScroll,
}));

vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({ navigateToPost: mockNavigateToPost }),
}));

vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: mockUseIsTouchDevice,
}));

vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: vi.fn(), isVisible: true }),
}));

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: () => ({ userDetails: { id: 'author', name: 'Author', image: null, status: 'vacationing' } }),
}));

vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({
  useAvatarUrl: () => null,
}));

vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => ({
  useRelativeTime: () => ({
    formatRelativeTime: () => '1m',
  }),
}));

vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { overrideDefaults?: boolean }>(
      function Container({ overrideDefaults: _overrideDefaults, ...props }, ref) {
        return <div ref={ref} {...props} />;
      },
    ),
  };
});

vi.mock('@/atoms/Image/Image', () => {
  return {
    Image: ({ fill: _fill, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
      <img alt={alt ?? ''} {...props} />
    ),
  };
});

vi.mock('@/atoms/Typography/Typography', () => {
  return {
    Typography: (props: React.HTMLAttributes<HTMLElement>) => <span {...props} />,
  };
});

vi.mock('@/atoms/Video/Video', () => {
  return {
    Video: React.forwardRef<HTMLVideoElement, React.VideoHTMLAttributes<HTMLVideoElement>>(function Video(props, ref) {
      return <video ref={ref} {...props} />;
    }),
  };
});

vi.mock('@/molecules/PostHeaderTimestamp/PostHeaderTimestamp', () => {
  return {
    PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string; indexedAt: Date }) => (
      <div data-testid="visual-overlay-timestamp">{timeAgo}</div>
    ),
  };
});

vi.mock('@/molecules/PostHeaderUserInfo/PostHeaderUserInfo', () => {
  return {
    PostHeaderUserInfo:
      mockPostHeaderUserInfo as typeof import('@/molecules/PostHeaderUserInfo/PostHeaderUserInfo').PostHeaderUserInfo,
  };
});

vi.mock('@/molecules/PostText/PostText', () => {
  return {
    PostText: ({ content }: { content: string }) => <div data-testid="visual-overlay-text">{content}</div>,
  };
});

vi.mock('@/molecules/PostText/PostText.utils', () => {
  return {
    truncateAtWordBoundary: (content: string, limit: number) => {
      return content.length > limit ? `${content.slice(0, limit)}...` : content;
    },
  };
});

vi.mock('@/molecules/Timeline/TimelineEndMessage', () => {
  return {
    TimelineEndMessage: () => <div data-testid="timeline-end">End</div>,
  };
});

vi.mock('@/molecules/Timeline/TimelineError', () => {
  return {
    TimelineError: ({ message }: { message: string }) => <div data-testid="timeline-error">{message}</div>,
  };
});

vi.mock('@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper')>();
  return {
    ...actual,
    TimelineStateWrapper: ({
      children,
      loading,
      error,
      hasItems,
      loadingComponent,
      emptyComponent,
    }: {
      children: React.ReactNode;
      loading: boolean;
      error: string | null;
      hasItems: boolean;
      loadingComponent?: React.ReactNode;
      emptyComponent?: React.ReactNode;
    }) => {
      if (loading) return <>{loadingComponent ?? <div data-testid="timeline-loading">Loading</div>}</>;
      if (error && !hasItems) return <div data-testid="timeline-error-state">{error}</div>;
      if (!hasItems) return <>{emptyComponent ?? <div data-testid="timeline-empty">Empty</div>}</>;
      return <>{children}</>;
    },
  };
});

vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => {
  return {
    ClickableTagsList: mockClickableTagsList,
  };
});

vi.mock('@/organisms/DialogReply/DialogReply', () => {
  return {
    DialogReply: ({ open }: { postId: string; open: boolean; onOpenChangeAction: (open: boolean) => void }) =>
      open ? <div data-testid="reply-dialog">Reply dialog</div> : null,
  };
});

vi.mock('@/organisms/DialogRepost/DialogRepost', () => {
  return {
    DialogRepost: ({ open }: { postId: string; open: boolean; onOpenChangeAction: (open: boolean) => void }) =>
      open ? <div data-testid="repost-dialog">Repost dialog</div> : null,
  };
});

vi.mock('@/organisms/PostActionsBar/PostActionsBar', () => {
  return {
    PostActionsBar: ({
      onReplyClick,
    }: {
      onTagClick?: () => void;
      onReplyClick?: () => void;
      onRepostClick?: () => void;
    }) => (
      <button data-testid="visual-overlay-reply" onClick={onReplyClick}>
        Reply
      </button>
    ),
  };
});

vi.mock('@/organisms/PostContentBlurred/PostContentBlurred', () => {
  return {
    PostContentBlurred: ({ postId }: { postId: string; className?: string }) => <div>{postId}</div>,
  };
});

function createRowsWithTrailingSpacer(): VisualRow[] {
  const [row] = createRows();

  return [
    {
      key: 'row-1-spacer',
      cells: [row.cells[0], { key: 'spacer:tile-1', size: 'medium', isSpacer: true }],
    },
  ];
}

function createPlaceholderTile(postId: string, placeholderKind: VisualPlaceholderKind): VisualTile {
  return {
    id: `${postId}:placeholder:${placeholderKind}`,
    postId,
    placeholderKind,
    attachmentId: '',
    attachmentName: '',
    contentType: '',
    mediaKind: 'image',
    previewSrc: '',
    mainSrc: '',
    preferredSize: 'square',
    rowSize: 'square',
    probeState: 'ready',
    isBlurred: false,
    content: '',
    indexedAt: 1,
  };
}

function createRows(): VisualRow[] {
  return [
    {
      key: 'row-1',
      cells: [
        {
          key: 'cell-1',
          size: 'medium',
          tile: {
            id: 'tile-1',
            postId: 'author:post1',
            attachmentId: 'file-1',
            attachmentName: 'image.jpg',
            contentType: 'image/jpeg',
            mediaKind: 'image',
            previewSrc: '/image.jpg',
            mainSrc: '/image.jpg',
            preferredSize: 'medium',
            rowSize: 'medium',
            probeState: 'ready',
            isBlurred: false,
            content: 'Hello world',
            indexedAt: Date.now(),
          },
        },
      ],
    },
  ];
}

describe('VisualTimelinePosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsTouchDevice.mockReturnValue(false);
    mockUseRemoveDeletedPost.mockReturnValue({
      canRemove: false,
      isRemoving: false,
      remove: vi.fn(),
    });
    mockUseInfiniteScroll.mockReturnValue({
      sentinelRef: vi.fn(),
      isStalled: false,
      resumeAutoLoad: vi.fn(),
    });
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRows(),
      tail: [],
      tiles: [],
      hasPendingSnapshot: false,
      hasPendingTiles: false,
      hasPendingFiles: false,
      hasPendingPostDetails: false,
    });
  });

  it('navigates to the parent post when the tile is clicked', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText('Open post author:post1'));

    expect(mockNavigateToPost).toHaveBeenCalledWith('author:post1');
  });

  it('does not navigate when an overlay action is clicked', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('visual-overlay-reply'));

    expect(mockNavigateToPost).not.toHaveBeenCalled();
    expect(screen.getByTestId('reply-dialog')).toBeInTheDocument();
  });

  it('skips the hover overlay on touch devices', () => {
    mockUseIsTouchDevice.mockReturnValue(true);

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('visual-overlay-reply')).not.toBeInTheDocument();
    expect(screen.queryByTestId('visual-overlay-tags')).not.toBeInTheDocument();
  });

  it('does not render the filtered empty state while tile probes are still pending', () => {
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingTiles: true,
      hasPendingFiles: false,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
  });

  it('shows the loading skeleton, not the empty state, while the tile snapshot is still resolving', () => {
    // Regression: switching a fully-loaded collection (hasMore=false) to the
    // Visual layout mounts this component before the first liveQuery emission —
    // that frame flashed "No posts found" instead of reading as loading.
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingSnapshot: true,
      hasPendingTiles: false,
      hasPendingFiles: false,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
  });

  it('renders deleted and not-found items as clickable placeholder cards', () => {
    // Grid/List parity: deleted and not-found collection items keep their slot
    // so item counts match across layouts, and navigate to the post page on
    // click like the Grid/List cards do.
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [
        {
          key: 'row-placeholders',
          cells: [
            { key: 'cell-deleted', size: 'square', tile: createPlaceholderTile('author:post-del', 'deleted') },
            { key: 'cell-missing', size: 'square', tile: createPlaceholderTile('author:post-miss', 'missing') },
          ],
        },
      ],
      tail: [],
      tiles: [],
      hasPendingSnapshot: false,
      hasPendingTiles: false,
      hasPendingFiles: false,
      hasPendingPostDetails: false,
    });

    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post-del', 'author:post-miss']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
        showUnavailablePosts
      />,
    );

    expect(mockUseVisualFeedTiles).toHaveBeenCalledWith(expect.objectContaining({ showUnavailablePosts: true }));
    expect(screen.getByText('This post has been deleted by its author.')).toBeInTheDocument();
    expect(screen.getByText('Post not found.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-cy="visual-feed-placeholder-tile"]')).toHaveLength(2);

    // The placeholder carries no aria-label, so its accessible name is the
    // localized deleted/missing copy itself (unlike media tiles' `Open post`).
    fireEvent.click(screen.getByRole('button', { name: 'This post has been deleted by its author.' }));
    expect(mockNavigateToPost).toHaveBeenCalledWith('author:post-del');

    fireEvent.keyDown(screen.getByRole('button', { name: 'Post not found.' }), { key: 'Enter' });
    expect(mockNavigateToPost).toHaveBeenCalledWith('author:post-miss');

    // Non-removable placeholders carry no Remove CTA at all.
    expect(container.querySelector('[data-cy="post-deleted-remove-btn"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-cy="post-missing-remove-btn"]')).not.toBeInTheDocument();
  });

  it('wires the Remove CTA into placeholder tiles for removable posts', () => {
    // Grid/List parity for owners: the same Remove flow PostMain offers on
    // unavailable cards must be reachable from the visual mosaic placeholders.
    const removeByPostId: Record<string, ReturnType<typeof vi.fn>> = {
      'author:post-del': vi.fn().mockResolvedValue(true),
      'author:post-miss': vi.fn().mockResolvedValue(true),
    };
    mockUseRemoveDeletedPost.mockImplementation((postId: string) => ({
      canRemove: true,
      isRemoving: false,
      remove: removeByPostId[postId] ?? vi.fn(),
    }));
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [
        {
          key: 'row-placeholders',
          cells: [
            { key: 'cell-deleted', size: 'square', tile: createPlaceholderTile('author:post-del', 'deleted') },
            { key: 'cell-missing', size: 'square', tile: createPlaceholderTile('author:post-miss', 'missing') },
          ],
        },
      ],
      tail: [],
      tiles: [],
      hasPendingSnapshot: false,
      hasPendingTiles: false,
      hasPendingFiles: false,
      hasPendingPostDetails: false,
    });

    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post-del', 'author:post-miss']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
        showUnavailablePosts
      />,
    );

    const deletedRemoveButton = container.querySelector('[data-cy="post-deleted-remove-btn"]');
    const missingRemoveButton = container.querySelector('[data-cy="post-missing-remove-btn"]');
    expect(deletedRemoveButton).toBeInTheDocument();
    expect(missingRemoveButton).toBeInTheDocument();

    // Clicking Remove must trigger the removal, not the tile's navigation.
    fireEvent.click(deletedRemoveButton as Element);
    expect(removeByPostId['author:post-del']).toHaveBeenCalledTimes(1);
    expect(removeByPostId['author:post-miss']).not.toHaveBeenCalled();
    expect(mockNavigateToPost).not.toHaveBeenCalled();
  });

  it('disables the placeholder Remove CTA while removal is pending', () => {
    mockUseRemoveDeletedPost.mockReturnValue({
      canRemove: true,
      isRemoving: true,
      remove: vi.fn(),
    });
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [
        {
          key: 'row-placeholders',
          cells: [{ key: 'cell-deleted', size: 'square', tile: createPlaceholderTile('author:post-del', 'deleted') }],
        },
      ],
      tail: [],
      tiles: [],
      hasPendingSnapshot: false,
      hasPendingTiles: false,
      hasPendingFiles: false,
      hasPendingPostDetails: false,
    });

    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post-del']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
        showUnavailablePosts
      />,
    );

    const removeButton = container.querySelector('[data-cy="post-deleted-remove-btn"]');
    expect(removeButton).toBeDisabled();
    expect(removeButton).toHaveAttribute('aria-busy', 'true');
  });

  it('does not render the filtered empty state while post details are still being ensured', () => {
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingSnapshot: false,
      hasPendingTiles: false,
      hasPendingFiles: false,
      hasPendingPostDetails: true,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
  });

  it('does not render the filtered empty state while file metadata is being fetched', () => {
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: true,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
  });

  it('keeps the initial skeleton and backfills while the first visual rows are unavailable', async () => {
    const mockLoadMore = vi.fn().mockResolvedValue(undefined);
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={true}
        loadMore={mockLoadMore}
      />,
    );

    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
    expect(mockUseInfiniteScroll).toHaveBeenCalledWith({
      onLoadMore: expect.any(Function),
      hasMore: false,
      isLoading: true,
      threshold: 3000,
      debounceMs: 20,
    });

    await waitFor(() => {
      expect(mockLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  it('does not backfill while the tile snapshot is still resolving', async () => {
    // Regression: before the first liveQuery emission, empty rows say nothing
    // about whether the already-loaded posts will fill the mosaic — firing
    // loadMore() then fetches a page that may not be needed (e.g. on a
    // Grid→Visual switch of a partially-paged collection with cached tiles).
    const mockLoadMore = vi.fn().mockResolvedValue(undefined);
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingSnapshot: true,
      hasPendingTiles: false,
      hasPendingFiles: false,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={true}
        loadMore={mockLoadMore}
      />,
    );

    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
    await waitFor(() => {
      expect(mockUseInfiniteScroll).toHaveBeenCalled();
    });
    expect(mockLoadMore).not.toHaveBeenCalled();
  });

  it('backfills initial rows while tile probes are pending', async () => {
    const mockLoadMore = vi.fn().mockResolvedValue(undefined);
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingTiles: true,
      hasPendingFiles: false,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={true}
        loadMore={mockLoadMore}
      />,
    );

    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  it('renders visual grid skeletons during initial loading', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={true}
        loadingMore={false}
        error={null}
        hasMore={true}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
    expect(screen.getAllByTestId('visual-feed-skeleton-row')).toHaveLength(3);
    expect(screen.getAllByTestId('visual-feed-skeleton-tile').length).toBeGreaterThan(0);
  });

  it('does not add full-row skeletons while loading more posts', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={true}
        error={null}
        hasMore={true}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Open post author:post1')).toBeInTheDocument();
    expect(screen.queryByTestId('visual-feed-skeleton')).not.toBeInTheDocument();
  });

  it('falls back to the main image when the preview image fails', () => {
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [
        {
          key: 'row-fallback',
          cells: [
            {
              key: 'cell-fallback',
              size: 'medium',
              tile: {
                id: 'tile-fallback',
                postId: 'author:post1',
                attachmentId: 'file-fallback',
                attachmentName: 'broken-preview.jpg',
                contentType: 'image/jpeg',
                mediaKind: 'image',
                previewSrc: '/broken-preview.jpg',
                mainSrc: '/main-image.jpg',
                preferredSize: 'medium',
                rowSize: 'medium',
                probeState: 'ready',
                isBlurred: false,
                content: 'Hello world',
                indexedAt: Date.now(),
              },
            },
          ],
        },
      ],
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
    });

    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    const image = screen.getByAltText('broken-preview.jpg');

    expect(image).toHaveAttribute('src', '/broken-preview.jpg');

    fireEvent.error(image);

    expect(image).toHaveAttribute('src', '/main-image.jpg');
  });

  it('uses the black tile background while media loads', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    const tile = screen.getByLabelText('Open post author:post1');

    expect(tile).toHaveClass('bg-black');
    expect(tile).not.toHaveClass('animate-pulse');
  });

  it('renders the timestamp in a separate top-right timestamp block', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.getByTestId('visual-overlay-header')).toHaveTextContent('Header');
    expect(screen.getByTestId('visual-overlay-timestamp')).toHaveTextContent('1m');
  });

  it('keeps the user info popover enabled in visual mode', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(mockPostHeaderUserInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'author',
        userName: 'Author',
        status: 'vacationing',
        avatarUrl: null,
      }),
      undefined,
    );
    expect(mockPostHeaderUserInfo.mock.calls[0][0]).not.toHaveProperty('showPopover', false);
  });

  it('renders the header and text inside a vertical stack with spacing', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(screen.getByTestId('visual-overlay-content-stack')).toHaveClass('flex', 'flex-col', 'gap-4');
  });

  it('does not force a selected-looking border on overlay tags', () => {
    render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    const tags = screen.getByTestId('visual-overlay-tags');
    expect(tags).toHaveClass('text-white');
    expect(tags.className).not.toContain('[&_[role=button]]:border-white/20');
    expect(mockClickableTagsList).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.not.stringContaining('[&_[role=button]]:border-white/20'),
      }),
      undefined,
    );
  });

  describe('Infinite scroll configuration', () => {
    it('calls loadMore when infinite scroll onLoadMore runs', async () => {
      const mockLoadMore = vi.fn().mockResolvedValue(undefined);
      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={mockLoadMore}
        />,
      );

      await waitFor(() => {
        expect(screen.getByLabelText('Open post author:post1')).toBeInTheDocument();
      });

      const { onLoadMore } = mockUseInfiniteScroll.mock.calls[0][0];
      await onLoadMore();

      expect(mockLoadMore).toHaveBeenCalled();
    });

    it('configures useInfiniteScroll with threshold 3000 and debounceMs 20', async () => {
      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(mockUseInfiniteScroll).toHaveBeenCalledWith({
          onLoadMore: expect.any(Function),
          hasMore: true,
          isLoading: false,
          threshold: 3000,
          debounceMs: 20,
        });
      });
    });

    it('arms the observer when postIds is empty but hasMore (filtered stream region)', () => {
      // A fully-filtered stream region leaves postIds itself empty — the sentinel
      // must stay armed so load rounds chain toward the first visible posts.
      mockUseVisualFeedTiles.mockReturnValue({
        rows: [],
        tail: [],
        tiles: [],
        hasPendingSnapshot: false,
        hasPendingTiles: false,
        hasPendingFiles: false,
        hasPendingPostDetails: false,
      });

      render(
        <VisualTimelinePosts
          postIds={[]}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      expect(mockUseInfiniteScroll).toHaveBeenCalledWith(expect.objectContaining({ hasMore: true }));
    });

    it('keeps the observer quiet while rows resolve for existing postIds (backfill effect owns that case)', () => {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: [],
        tail: [],
        tiles: [],
        hasPendingSnapshot: false,
        hasPendingTiles: false,
        hasPendingFiles: false,
        hasPendingPostDetails: false,
      });

      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      expect(mockUseInfiniteScroll).toHaveBeenCalledWith(expect.objectContaining({ hasMore: false }));
    });
  });

  describe('Trailing slot, empty state, and hidden items', () => {
    it('renders the trailing slot inside the last-row spacer cell', () => {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: createRowsWithTrailingSpacer(),
        tail: [],
        tiles: [],
        hasPendingTiles: false,
        hasPendingFiles: false,
        hiddenPostCount: 0,
      });

      const { container } = render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          trailingSlot={<button data-testid="trailing-cta">Add content</button>}
        />,
      );

      expect(container.querySelectorAll('.grid.grid-cols-12')).toHaveLength(1);
      expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
      expect(screen.getByTestId('trailing-cta').parentElement).toHaveAttribute('style', 'aspect-ratio: 588 / 384;');
    });

    it('appends the trailing slot as its own row when the last row is full', () => {
      const { container } = render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          trailingSlot={<button data-testid="trailing-cta">Add content</button>}
        />,
      );

      const rowsInDom = container.querySelectorAll('.grid.grid-cols-12');
      expect(rowsInDom).toHaveLength(2);
      expect(rowsInDom[1].contains(screen.getByTestId('trailing-cta'))).toBe(true);
      expect(screen.getByLabelText('Open post author:post1')).toBeInTheDocument();
    });

    it('renders the hidden items notice above the mosaic when posts are hidden', () => {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: createRows(),
        tail: [],
        tiles: [],
        hasPendingTiles: false,
        hasPendingFiles: false,
        hiddenPostCount: 2,
      });

      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          hiddenItemsNotice={<div data-testid="hidden-notice">2 items hidden</div>}
        />,
      );

      expect(screen.getByTestId('hidden-notice')).toBeInTheDocument();
    });

    it('does not render the hidden items notice when no posts are hidden', () => {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: createRows(),
        tail: [],
        tiles: [],
        hasPendingTiles: false,
        hasPendingFiles: false,
        hiddenPostCount: 0,
      });

      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          hiddenItemsNotice={<div data-testid="hidden-notice">0 items hidden</div>}
        />,
      );

      expect(screen.queryByTestId('hidden-notice')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Open post author:post1')).toBeInTheDocument();
    });

    it('renders no notice when posts are hidden but no notice is provided', () => {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: createRows(),
        tail: [],
        tiles: [],
        hasPendingTiles: false,
        hasPendingFiles: false,
        hiddenPostCount: 3,
      });

      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      expect(screen.queryByTestId('hidden-notice')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Open post author:post1')).toBeInTheDocument();
    });

    it('renders the empty state alongside the trailing slot when the feed has no posts', () => {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: [],
        tail: [],
        tiles: [],
        hasPendingTiles: false,
        hasPendingFiles: false,
        hiddenPostCount: 0,
      });

      render(
        <VisualTimelinePosts
          postIds={[]}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          emptyState={<div data-testid="collection-empty">No content yet</div>}
          trailingSlot={<button data-testid="trailing-cta">Add content</button>}
        />,
      );

      expect(screen.getByTestId('collection-empty')).toBeInTheDocument();
      expect(screen.getByTestId('trailing-cta')).toBeInTheDocument();
      expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
    });

    it('renders the provided empty state without a trailing slot (visitor view, Grid/List parity)', () => {
      // Regression: emptyState must reach TimelineStateWrapper's emptyComponent
      // like Posts/GridPosts do — a visitor whose visual collection feed
      // resolves to zero posts sees CollectionItemsEmpty, not generic copy.
      mockUseVisualFeedTiles.mockReturnValue({
        rows: [],
        tail: [],
        tiles: [],
        hasPendingTiles: false,
        hasPendingFiles: false,
        hiddenPostCount: 0,
      });

      render(
        <VisualTimelinePosts
          postIds={[]}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          emptyState={<div data-testid="collection-empty">No content yet</div>}
        />,
      );

      expect(screen.getByTestId('collection-empty')).toBeInTheDocument();
      expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
    });

    it('renders the notice and trailing slot instead of the filtered empty state when every post is hidden', () => {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: [],
        tail: [],
        tiles: [],
        hasPendingTiles: false,
        hasPendingFiles: false,
        hiddenPostCount: 2,
      });

      render(
        <VisualTimelinePosts
          postIds={['author:post1', 'author:post2']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          hiddenItemsNotice={<div data-testid="hidden-notice">2 items hidden</div>}
          trailingSlot={<button data-testid="trailing-cta">Add content</button>}
        />,
      );

      expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
      expect(screen.getByTestId('hidden-notice')).toBeInTheDocument();
      expect(screen.getByTestId('trailing-cta')).toBeInTheDocument();
    });

    it('suppresses the end message when showEndMessage is false', () => {
      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          showEndMessage={false}
        />,
      );

      expect(screen.getByLabelText('Open post author:post1')).toBeInTheDocument();
      expect(screen.queryByTestId('timeline-end')).not.toBeInTheDocument();
    });
  });
});

describe('VisualTimelinePosts - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsTouchDevice.mockReturnValue(false);
    mockUseInfiniteScroll.mockReturnValue({
      sentinelRef: vi.fn(),
      isStalled: false,
      resumeAutoLoad: vi.fn(),
    });
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRows(),
      tail: [],
      tiles: [],
      hasPendingSnapshot: false,
      hasPendingTiles: false,
      hasPendingFiles: false,
      hasPendingPostDetails: false,
    });
  });

  it('matches snapshot for a populated visual feed', () => {
    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for the filtered empty state', () => {
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
    });

    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for touch devices without the hover overlay', () => {
    mockUseIsTouchDevice.mockReturnValue(true);

    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for a trailing CTA occupying the last-row spacer', () => {
    mockUseIsTouchDevice.mockReturnValue(true);
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRowsWithTrailingSpacer(),
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
      hiddenPostCount: 0,
    });

    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
        trailingSlot={<button data-testid="trailing-cta">Add content</button>}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for an empty collection with empty state and trailing CTA', () => {
    mockUseVisualFeedTiles.mockReturnValue({
      rows: [],
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
      hiddenPostCount: 0,
    });

    const { container } = render(
      <VisualTimelinePosts
        postIds={[]}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
        emptyState={<div data-testid="collection-empty">No content yet</div>}
        trailingSlot={<button data-testid="trailing-cta">Add your first post</button>}
        showEndMessage={false}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches snapshot for the hidden items notice above the mosaic', () => {
    mockUseIsTouchDevice.mockReturnValue(true);
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRows(),
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
      hiddenPostCount: 2,
    });

    const { container } = render(
      <VisualTimelinePosts
        postIds={['author:post1']}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
        hiddenItemsNotice={<div data-testid="hidden-notice">2 items hidden</div>}
      />,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
