import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS } from '@/config/feed';
import { TtlCoordinator } from '@/coordinators/ttl/ttl';
import type { VisualLinkVideo, VisualPlaceholderKind, VisualRow, VisualTile } from './TimelineFeedVisual.types';
import { VisualTimelinePosts } from './VisualTimelinePosts';

const {
  mockNavigateToPost,
  mockPostHeaderUserInfo,
  mockUseInfiniteScroll,
  mockUseVisualFeedTiles,
  mockUseIsTouchDevice,
  mockUseOgMetadata,
  mockUseRemoveDeletedPost,
  mockClickableTagsList,
  mockUserDetailsRef,
} = vi.hoisted(() => ({
  mockNavigateToPost: vi.fn(),
  mockUserDetailsRef: {
    current: { id: 'author', name: 'Author', image: null, status: 'vacationing' } as {
      id: string;
      name: string;
      image: string | null;
      status: string | null;
      deleted?: boolean;
    },
  },
  mockPostHeaderUserInfo: vi.fn(({ timeAgo }: { timeAgo?: string }) => (
    <div data-testid="visual-overlay-header">{timeAgo ? `Header:${timeAgo}` : 'Header'}</div>
  )),
  mockUseInfiniteScroll: vi.fn(),
  mockUseVisualFeedTiles: vi.fn(),
  mockUseIsTouchDevice: vi.fn(() => false),
  mockUseOgMetadata: vi.fn(),
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

vi.mock('@/hooks/useOgMetadata/useOgMetadata', () => ({
  useOgMetadata: mockUseOgMetadata,
}));

vi.mock('@/hooks/useIsTouchDevice/useIsTouchDevice', () => ({
  useIsTouchDevice: mockUseIsTouchDevice,
}));

vi.mock('@/hooks/useViewportObserver/useViewportObserver', () => ({
  useViewportObserver: () => ({ ref: vi.fn(), isVisible: true }),
}));

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: () => ({ userDetails: mockUserDetailsRef.current }),
}));

afterEach(() => {
  mockUserDetailsRef.current = { id: 'author', name: 'Author', image: null, status: 'vacationing' };
});

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
      hasMore = false,
      stalled = false,
      loadingComponent,
      emptyComponent,
    }: {
      children: React.ReactNode;
      loading: boolean;
      error: string | null;
      hasItems: boolean;
      hasMore?: boolean;
      stalled?: boolean;
      loadingComponent?: React.ReactNode;
      emptyComponent?: React.ReactNode;
    }) => {
      const loadingNode = loadingComponent ?? <div data-testid="timeline-loading">Loading</div>;
      if (loading) return <>{loadingNode}</>;
      if (error && !hasItems) return <div data-testid="timeline-error-state">{error}</div>;
      // Mirrors the real wrapper: an empty list with more pages keeps the skeleton beside the
      // children (which own the sentinel), and drops it once auto-loading has stalled.
      if (!hasItems && hasMore) {
        return (
          <>
            {!stalled && loadingNode}
            {children}
          </>
        );
      }
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

function createLinkVideoTile(linkVideo: VisualLinkVideo, overrides: Partial<VisualTile> = {}): VisualTile {
  return {
    id: 'author:post-link:link:https://example.com/video',
    postId: 'author:post-link',
    linkVideo,
    attachmentId: '',
    attachmentName: '',
    contentType: '',
    mediaKind: 'video',
    previewSrc: '',
    mainSrc: '',
    metadataWidth: 16,
    metadataHeight: 9,
    sizeOptions: ['wide', 'medium'],
    preferredSize: 'wide',
    rowSize: 'wide',
    probeState: 'ready',
    isBlurred: false,
    content: 'Watch this',
    indexedAt: 1,
    ...overrides,
  };
}

/** The tiles behind `createRows()`: what the tile pipeline tracks for that mosaic. */
function createTiles(): VisualTile[] {
  return createRows().flatMap((row) => row.cells.flatMap((cell) => (cell.tile ? [cell.tile] : [])));
}

describe('VisualTimelinePosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsTouchDevice.mockReturnValue(false);
    mockUseOgMetadata.mockReturnValue({ metadata: null, isLoading: false, error: null });
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
      tiles: createTiles(),
      hasPendingSnapshot: false,
      hasPendingTiles: false,
      hasPendingFiles: false,
      hasPendingPostDetails: false,
    });
  });

  it('subscribes visible visual tiles for TTL refresh and releases them on unmount', () => {
    const coordinator = TtlCoordinator.getInstance();
    const subscribe = vi.spyOn(coordinator, 'subscribePost').mockImplementation(() => {});
    const unsubscribe = vi.spyOn(coordinator, 'unsubscribePost').mockImplementation(() => {});
    try {
      const view = render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );
      expect(subscribe).toHaveBeenCalledWith({ compositePostId: 'author:post1' });
      view.unmount();
      expect(unsubscribe).toHaveBeenCalledWith({ compositePostId: 'author:post1' });
    } finally {
      subscribe.mockRestore();
      unsubscribe.mockRestore();
    }
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

  it('keeps the initial skeleton and arms the sentinel while the first visual rows are unavailable', async () => {
    // The backfill of loaded ids that yield no tile runs through the sentinel, so it shares
    // the unproductive-load budget instead of chaining loadMore from an effect (#2538).
    const mockLoadMore = vi.fn().mockResolvedValue(undefined);
    const sentinelRef = vi.fn();
    mockUseInfiniteScroll.mockReturnValue({ sentinelRef, isStalled: false, resumeAutoLoad: vi.fn() });
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
      hasMore: true,
      isLoading: false,
      threshold: 3000,
      debounceMs: 20,
      // The budget measures mosaic tiles, not ids: no rows yet, so nothing to count.
      itemCount: 0,
      maxUnproductiveLoads: TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS,
    });
    await waitFor(() => {
      expect(sentinelRef).toHaveBeenCalledWith(expect.any(HTMLElement));
    });
    expect(mockLoadMore).not.toHaveBeenCalled();
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
      expect(mockUseInfiniteScroll).toHaveBeenCalledWith(expect.objectContaining({ isLoading: true }));
    });
    expect(mockLoadMore).not.toHaveBeenCalled();
  });

  it('keeps the sentinel armed for the backfill while tile probes are pending', async () => {
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
      expect(mockUseInfiniteScroll).toHaveBeenCalledWith(expect.objectContaining({ hasMore: true, isLoading: false }));
    });
    expect(mockLoadMore).not.toHaveBeenCalled();
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

  it('labels a tombstoned author as [DELETED] in the overlay header', () => {
    mockUserDetailsRef.current = { id: 'author', name: '', image: null, status: null, deleted: true };

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
      expect.objectContaining({ userId: 'author', userName: '[DELETED]' }),
      undefined,
    );
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
          itemCount: 1,
          maxUnproductiveLoads: TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS,
        });
      });
    });

    it('counts a tile still probing as mosaic progress without gating the observer on pending work', async () => {
      // A page whose tiles are unsettled already grew the tracked tiles, so it is not an
      // unproductive load. The pending flags must not feed `isLoading`: a file Nexus no
      // longer returns keeps `hasPendingFiles` set for good, and a gated observer would
      // leave the feed with neither auto-loading nor the manual Load more.
      const [readyTile] = createTiles();
      const probingTile: VisualTile = {
        ...readyTile,
        id: 'tile-2',
        postId: 'author:post2',
        preferredSize: undefined,
        rowSize: undefined,
        probeState: 'pending',
      };
      mockUseVisualFeedTiles.mockReturnValue({
        rows: createRows(),
        tail: [],
        tiles: [readyTile, probingTile],
        hasPendingSnapshot: false,
        hasPendingTiles: true,
        hasPendingFiles: true,
        hasPendingPostDetails: true,
      });

      render(
        <VisualTimelinePosts
          postIds={['author:post1', 'author:post2', 'author:post3']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(mockUseInfiniteScroll).toHaveBeenCalledWith(expect.objectContaining({ isLoading: false, itemCount: 2 }));
      });
    });

    it('hands over to Load more when ids keep growing but the mosaic does not', async () => {
      // Home/Search Visual with content set to All consumes a mixed stream: a page of
      // text-only posts grows `postIds` while the tile pipeline drops every one of them. The
      // budget must count mosaic progress, so those rounds are unproductive and the sentinel
      // stops after the configured number of them.
      const { useInfiniteScroll: realUseInfiniteScroll } = await vi.importActual<
        typeof import('@/hooks/useInfiniteScroll/useInfiniteScroll')
      >('@/hooks/useInfiniteScroll/useInfiniteScroll');
      mockUseInfiniteScroll.mockImplementation(realUseInfiniteScroll);
      const observerCallbacks: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
      const previousObserver = window.IntersectionObserver;
      Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: vi.fn(function (callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          observerCallbacks.push(callback);
          return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
        }),
      });
      const mockLoadMore = vi.fn().mockResolvedValue(undefined);
      const renderFeed = (postIds: string[]) => (
        <VisualTimelinePosts
          postIds={postIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={mockLoadMore}
        />
      );
      const intersect = async () => {
        await act(async () => {
          observerCallbacks.at(-1)?.([{ isIntersecting: true }]);
          await new Promise((resolve) => setTimeout(resolve, 40));
        });
      };

      try {
        const postIds = ['author:post1'];
        const { rerender } = render(renderFeed(postIds));
        await waitFor(() => expect(observerCallbacks.length).toBeGreaterThan(0));

        for (let round = 1; round <= TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS; round += 1) {
          await intersect();
          expect(mockLoadMore).toHaveBeenCalledTimes(round);
          // The page delivered ids but no tiles: the mosaic (createRows) stays the same.
          postIds.push(`author:text-only-${round}`);
          rerender(renderFeed([...postIds]));
        }

        await intersect();
        expect(mockLoadMore).toHaveBeenCalledTimes(TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS);
        expect(document.querySelector('[data-cy="timeline-load-more"]')).toBeInTheDocument();
      } finally {
        Object.defineProperty(window, 'IntersectionObserver', {
          writable: true,
          configurable: true,
          value: previousObserver,
        });
      }
    });

    it('replaces the sentinel with a manual Load more once auto-loading stalls', async () => {
      const resumeAutoLoad = vi.fn();
      mockUseInfiniteScroll.mockReturnValue({
        sentinelRef: vi.fn(),
        isStalled: true,
        resumeAutoLoad,
      });

      const { container } = render(
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
        expect(screen.getByLabelText('Open post author:post1')).toBeInTheDocument();
      });
      expect(container.querySelector('.h-5')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
      expect(resumeAutoLoad).toHaveBeenCalledTimes(1);
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

    it('bounds the backfill by the unproductive-load budget and hands over to Load more', async () => {
      // A text-only profile, a text-heavy custom feed or a content filter that drops every
      // post's media: pages keep delivering ids while the tile pipeline yields no row. The
      // backfill runs through the sentinel's budget, so it stops after the configured rounds
      // instead of chaining to the end of the stream, and the skeleton gives way to the manual
      // Load more, which loads one page and re-arms auto-loading under the same budget (#2538).
      const { useInfiniteScroll: realUseInfiniteScroll } = await vi.importActual<
        typeof import('@/hooks/useInfiniteScroll/useInfiniteScroll')
      >('@/hooks/useInfiniteScroll/useInfiniteScroll');
      mockUseInfiniteScroll.mockImplementation(realUseInfiniteScroll);
      const observerCallbacks: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
      const previousObserver = window.IntersectionObserver;
      Object.defineProperty(window, 'IntersectionObserver', {
        writable: true,
        configurable: true,
        value: vi.fn(function (callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
          observerCallbacks.push(callback);
          return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
        }),
      });
      mockUseVisualFeedTiles.mockReturnValue({
        rows: [],
        tail: [],
        tiles: [],
        hasPendingSnapshot: false,
        hasPendingTiles: false,
        hasPendingFiles: false,
        hasPendingPostDetails: false,
      });
      const mockLoadMore = vi.fn().mockResolvedValue(undefined);
      const renderFeed = (postIds: string[]) => (
        <VisualTimelinePosts
          postIds={postIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={mockLoadMore}
        />
      );
      const intersect = async () => {
        await act(async () => {
          observerCallbacks.at(-1)?.([{ isIntersecting: true }]);
          await new Promise((resolve) => setTimeout(resolve, 40));
        });
      };

      try {
        const postIds = ['author:post1'];
        const { rerender } = render(renderFeed(postIds));
        expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
        await waitFor(() => expect(observerCallbacks.length).toBeGreaterThan(0));

        for (let round = 1; round <= TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS; round += 1) {
          await intersect();
          expect(mockLoadMore).toHaveBeenCalledTimes(round);
          // The page delivered ids but no tiles: the mosaic stays empty and the skeleton holds.
          postIds.push(`author:text-only-${round}`);
          rerender(renderFeed([...postIds]));
          expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();
        }

        await intersect();
        // Within the budget plus the one load that delivered the ids in the first place.
        expect(mockLoadMore).toHaveBeenCalledTimes(TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS);
        expect(screen.queryByTestId('visual-feed-skeleton')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
        expect(mockLoadMore).toHaveBeenCalledTimes(TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS + 1);
        expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
        expect(screen.getByTestId('visual-feed-skeleton')).toBeInTheDocument();

        // Auto-loading is re-armed under the same budget: the next sentinel hit loads again.
        await intersect();
        expect(mockLoadMore).toHaveBeenCalledTimes(TIMELINE_MAX_UNPRODUCTIVE_AUTO_LOADS + 2);
      } finally {
        Object.defineProperty(window, 'IntersectionObserver', {
          writable: true,
          configurable: true,
          value: previousObserver,
        });
      }
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

    it('reports a failed load beside the trailing slot instead of the empty state', () => {
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
          error="Network error"
          hasMore={false}
          loadMore={vi.fn()}
          emptyState={<div data-testid="collection-empty">No content yet</div>}
          trailingSlot={<button data-testid="trailing-cta">Add content</button>}
        />,
      );

      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
      expect(screen.queryByTestId('collection-empty')).not.toBeInTheDocument();
      expect(screen.getByTestId('trailing-cta')).toBeInTheDocument();
    });

    it('renders the provided empty state without a trailing slot (visitor view, Grid/List parity)', () => {
      // Regression: emptyState must reach TimelineStateWrapper's emptyComponent
      // like Posts/CardsPosts do — a visitor whose visual collection feed
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
  describe('link video tiles', () => {
    const YOUTUBE_HQ720 = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hq720.jpg';
    const YOUTUBE_MQDEFAULT = 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg';

    function renderTile(tile: VisualTile) {
      mockUseVisualFeedTiles.mockReturnValue({
        rows: [{ key: 'row-link', cells: [{ key: 'cell-link', size: 'wide', tile }] }],
        tail: [],
        tiles: [tile],
        hasPendingSnapshot: false,
        hasPendingTiles: false,
        hasPendingFiles: false,
        hasPendingPostDetails: false,
      });

      render(
        <VisualTimelinePosts
          postIds={[tile.postId]}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      return screen.getByLabelText(`Open post ${tile.postId}`);
    }

    function loadImage(image: HTMLImageElement, width: number, height: number) {
      Object.defineProperty(image, 'naturalWidth', { configurable: true, value: width });
      Object.defineProperty(image, 'naturalHeight', { configurable: true, value: height });
      fireEvent.load(image);
    }

    const fileTile = () =>
      createLinkVideoTile(
        { provider: 'file', hostLabel: 'cdn.example.com' },
        { previewSrc: 'https://cdn.example.com/clip.mp4', mainSrc: 'https://cdn.example.com/clip.mp4' },
      );

    const youtubeTile = () =>
      createLinkVideoTile(
        { provider: 'youtube', hostLabel: 'youtu.be' },
        { previewSrc: YOUTUBE_HQ720, mainSrc: YOUTUBE_MQDEFAULT },
      );

    describe('with media playback stubbed', () => {
      let playSpy: ReturnType<typeof vi.spyOn>;
      let pauseSpy: ReturnType<typeof vi.spyOn>;

      beforeEach(() => {
        // jsdom's play() returns undefined, so the tile video's `.catch` would throw.
        playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
        pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
      });

      afterEach(() => {
        playSpy.mockRestore();
        pauseSpy.mockRestore();
      });

      it('plays a direct file once the server preview reports a video, and keeps the card when it fails', () => {
        mockUseOgMetadata.mockReturnValue({
          metadata: { url: 'https://cdn.example.com/clip.mp4', title: null, image: null, type: 'video' },
          isLoading: false,
          error: null,
        });
        const tile = renderTile(fileTile());

        expect(mockUseOgMetadata).toHaveBeenCalledWith('https://cdn.example.com/clip.mp4');
        const video = tile.querySelector('video');
        expect(video).toHaveAttribute('src', 'https://cdn.example.com/clip.mp4');
        // Transparent until the first frame, so the card shows while the file loads.
        expect(video).toHaveClass('bg-transparent');
        expect(screen.getByTestId('visual-tile-link-video-fallback')).toHaveTextContent('cdn.example.com');

        fireEvent.error(video!);

        expect(tile.querySelector('video')).toBeNull();
        expect(screen.getByTestId('visual-tile-link-video-fallback')).toBeInTheDocument();
      });

      it('leaves attachment video tiles as they were: opaque, no card, still mounted after an error', () => {
        const tile = renderTile({
          ...createLinkVideoTile({ provider: 'file', hostLabel: '' }),
          linkVideo: undefined,
          attachmentId: 'file-video',
          attachmentName: 'clip.mp4',
          contentType: 'video/mp4',
          previewSrc: '/clip.mp4',
          mainSrc: '/clip.mp4',
        });

        const video = tile.querySelector('video');
        expect(video).not.toHaveClass('bg-transparent');

        fireEvent.error(video!);

        expect(tile.querySelector('video')).toBe(video);
        expect(screen.queryByTestId('visual-tile-link-video-fallback')).not.toBeInTheDocument();
        expect(tile).toHaveClass('bg-black');
      });
    });

    it('shows the fallback card under a hidden YouTube thumbnail until the thumbnail loads', () => {
      const tile = renderTile(youtubeTile());

      expect(screen.getByTestId('visual-tile-link-video-fallback')).toHaveTextContent('youtu.be');
      const image = tile.querySelector('img');
      expect(image).toHaveAttribute('src', YOUTUBE_HQ720);
      expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
      expect(image).toHaveClass('opacity-0');
      expect(screen.queryByTestId('visual-tile-play-badge')).not.toBeInTheDocument();

      loadImage(image!, 1280, 720);

      expect(image).not.toHaveClass('opacity-0');
      expect(screen.getByTestId('visual-tile-play-badge')).toBeInTheDocument();
    });

    it('shows the mqdefault thumbnail with a play badge when hq720 is missing', () => {
      const tile = renderTile(youtubeTile());

      fireEvent.error(tile.querySelector('img')!);

      const fallbackImage = tile.querySelector('img');
      expect(fallbackImage).toHaveAttribute('src', YOUTUBE_MQDEFAULT);
      loadImage(fallbackImage!, 320, 180);

      expect(fallbackImage).not.toHaveClass('opacity-0');
      expect(screen.getByTestId('visual-tile-play-badge')).toBeInTheDocument();
    });

    it("moves past i.ytimg's 120x90 placeholder to mqdefault, then keeps only the card", () => {
      const tile = renderTile(youtubeTile());

      loadImage(tile.querySelector('img')!, 120, 90);

      const fallbackImage = tile.querySelector('img');
      expect(fallbackImage).toHaveAttribute('src', YOUTUBE_MQDEFAULT);
      expect(fallbackImage).toHaveClass('opacity-0');

      loadImage(fallbackImage!, 120, 90);

      expect(tile.querySelector('img')).toBeNull();
      expect(screen.getByTestId('visual-tile-link-video-fallback')).toBeInTheDocument();
      expect(screen.queryByTestId('visual-tile-play-badge')).not.toBeInTheDocument();
    });

    it('moves to mqdefault when hq720 fails, then keeps only the card when that fails too', () => {
      const tile = renderTile(youtubeTile());

      fireEvent.error(tile.querySelector('img')!);
      expect(tile.querySelector('img')).toHaveAttribute('src', YOUTUBE_MQDEFAULT);

      fireEvent.error(tile.querySelector('img')!);

      expect(tile.querySelector('img')).toBeNull();
      expect(screen.getByTestId('visual-tile-link-video-fallback')).toBeInTheDocument();
    });

    it('shows only the fallback card for a Vimeo link', () => {
      const tile = renderTile(createLinkVideoTile({ provider: 'vimeo', hostLabel: 'vimeo.com' }));

      expect(screen.getByTestId('visual-tile-link-video-fallback')).toHaveTextContent('vimeo.com');
      expect(tile.querySelector('img')).toBeNull();
      expect(tile.querySelector('video')).toBeNull();
      expect(mockUseOgMetadata).not.toHaveBeenCalled();
    });

    it.each([
      ['while the server preview is loading', { metadata: null, isLoading: true, error: null }],
      [
        'when the preview request fails',
        { metadata: null, isLoading: false, error: new Error('Failed to fetch metadata') },
      ],
      [
        // The route's answer for a private address, as for any page that is not a video.
        'when the preview is not a video',
        {
          metadata: { url: 'https://cdn.example.com/clip.mp4', title: 'A page', image: null, type: 'website' },
          isLoading: false,
          error: null,
        },
      ],
    ])('never mounts a player for a file link %s', (_label, preview) => {
      mockUseOgMetadata.mockReturnValue(preview);
      const tile = renderTile(fileTile());

      expect(screen.getByTestId('visual-tile-link-video-fallback')).toHaveTextContent('cdn.example.com');
      expect(tile.querySelector('video')).toBeNull();
    });

    it('omits the host line when the host cannot be read', () => {
      renderTile(createLinkVideoTile({ provider: 'vimeo', hostLabel: '' }));

      const fallback = screen.getByTestId('visual-tile-link-video-fallback');
      expect(fallback.querySelector('svg')).toBeInTheDocument();
      expect(fallback.querySelector('span')).toBeNull();
    });

    it('blurs a moderated link tile without loading its media or showing the card', () => {
      const tile = renderTile({ ...youtubeTile(), isBlurred: true });

      expect(tile).toHaveTextContent('author:post-link');
      expect(screen.queryByTestId('visual-tile-link-video-fallback')).not.toBeInTheDocument();
      expect(tile.querySelector('img')).toBeNull();
      expect(screen.queryByTestId('visual-overlay-content-stack')).not.toBeInTheDocument();
    });

    it('never asks the server about the file link of a blurred post', () => {
      renderTile({ ...fileTile(), isBlurred: true });

      expect(mockUseOgMetadata).not.toHaveBeenCalled();
    });

    it('keeps the post overlay and opens the post like any media tile', () => {
      const tile = renderTile(createLinkVideoTile({ provider: 'vimeo', hostLabel: 'vimeo.com' }));

      expect(screen.getByTestId('visual-overlay-content-stack')).toBeInTheDocument();

      fireEvent.click(tile);
      expect(mockNavigateToPost).toHaveBeenCalledWith('author:post-link');

      fireEvent.keyDown(tile, { key: 'Enter' });
      expect(mockNavigateToPost).toHaveBeenCalledTimes(2);
    });
  });
});
