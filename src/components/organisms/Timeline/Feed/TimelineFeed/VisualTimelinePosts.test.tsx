import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualTimelinePosts } from './VisualTimelinePosts';
import type { VisualRow } from './TimelineFeedVisual.types';

const mockNavigateToPost = vi.fn();
const mockUseVisualFeedTiles = vi.fn();
const mockUseIsTouchDevice = vi.fn(() => false);
const mockPostHeaderUserInfo = vi.fn(({ timeAgo }: { timeAgo?: string }) => (
  <div data-testid="visual-overlay-header">{timeAgo ? `Header:${timeAgo}` : 'Header'}</div>
));

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    context,
    itemContent,
    components,
    endReached,
  }: {
    data: unknown[];
    context?: Record<string, unknown>;
    itemContent: (index: number, item: unknown) => React.ReactNode;
    components?: { Footer?: (props: { context?: Record<string, unknown> }) => React.ReactNode };
    endReached?: () => void;
  }) => (
    <div data-testid="virtuoso">
      {data?.map((item, index) => (
        <div key={index}>{itemContent(index, item)}</div>
      ))}
      {components?.Footer?.({ context })}
      <button type="button" data-testid="virtuoso-end-reached" onClick={() => endReached?.()} />
    </div>
  ),
}));
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useVisualFeedTiles: undefined,
    usePostNavigation: () => ({ navigateToPost: mockNavigateToPost }),
    useIsTouchDevice: () => mockUseIsTouchDevice(),
    useViewportObserver: () => ({ ref: vi.fn(), isVisible: true }),
    useUserDetails: () => ({ userDetails: { id: 'author', name: 'Author', image: null } }),
    useAvatarUrl: () => null,
    useRelativeTime: () => ({
      formatRelativeTime: () => '1m',
    }),
  };
});

vi.mock('./useVisualFeedTiles', () => ({
  useVisualFeedTiles: (...args: unknown[]) => mockUseVisualFeedTiles(...args),
}));

vi.mock('@/atoms', () => ({
  Container: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { overrideDefaults?: boolean }>(
    function Container({ overrideDefaults: _overrideDefaults, ...props }, ref) {
      return <div ref={ref} {...props} />;
    },
  ),
  Image: ({ fill: _fill, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    <img alt={alt ?? ''} {...props} />
  ),
  Video: React.forwardRef<HTMLVideoElement, React.VideoHTMLAttributes<HTMLVideoElement>>(function Video(props, ref) {
    return <video ref={ref} {...props} />;
  }),
  Typography: (props: React.HTMLAttributes<HTMLElement>) => <span {...props} />,
}));

vi.mock('@/components/molecules/Timeline/TimelineVirtuosoFooter', () => ({
  TimelineVirtuosoFooter: ({
    context,
  }: {
    context?: { loadingMore: boolean; error: string | null; hasMore: boolean; itemCount: number };
  }) => {
    if (!context) return null;
    const { loadingMore, error, hasMore, itemCount } = context;
    return (
      <>
        {loadingMore && <div data-testid="timeline-loading-more">Loading more</div>}
        {error && itemCount > 0 && <div data-testid="timeline-error">{error}</div>}
        {!hasMore && !loadingMore && itemCount > 0 && <div data-testid="timeline-end">End</div>}
      </>
    );
  },
}));
vi.mock('@/molecules', () => ({
  TimelineStateWrapper: ({
    children,
    loading,
    error,
    hasItems,
    emptyComponent,
  }: {
    children: React.ReactNode;
    loading: boolean;
    error: string | null;
    hasItems: boolean;
    emptyComponent?: React.ReactNode;
  }) => {
    if (loading) return <div data-testid="timeline-loading">Loading</div>;
    if (error && !hasItems) return <div data-testid="timeline-error-state">{error}</div>;
    if (!hasItems) return <>{emptyComponent ?? <div data-testid="timeline-empty">Empty</div>}</>;
    return <>{children}</>;
  },
  TimelineLoadingMore: () => <div data-testid="timeline-loading-more">Loading more</div>,
  TimelineError: ({ message }: { message: string }) => <div data-testid="timeline-error">{message}</div>,
  TimelineEndMessage: () => <div data-testid="timeline-end">End</div>,
  PostHeaderUserInfo: (...args: unknown[]) => mockPostHeaderUserInfo(...args),
  PostHeaderTimestamp: ({ timeAgo }: { timeAgo: string; indexedAt: Date }) => (
    <div data-testid="visual-overlay-timestamp">{timeAgo}</div>
  ),
  PostText: ({ content }: { content: string }) => <div data-testid="visual-overlay-text">{content}</div>,
  truncateAtWordBoundary: (content: string, limit: number) => {
    return content.length > limit ? `${content.slice(0, limit)}...` : content;
  },
}));

vi.mock('@/organisms', () => ({
  ClickableTagsList: () => <div data-testid="visual-overlay-tags">Tags</div>,
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
  DialogReply: ({ open }: { postId: string; open: boolean; onOpenChangeAction: (open: boolean) => void }) =>
    open ? <div data-testid="reply-dialog">Reply dialog</div> : null,
  DialogRepost: ({ open }: { postId: string; open: boolean; onOpenChangeAction: (open: boolean) => void }) =>
    open ? <div data-testid="repost-dialog">Repost dialog</div> : null,
  PostContentBlurred: ({ postId }: { postId: string; className?: string }) => <div>{postId}</div>,
}));

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
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRows(),
      tail: [],
      tiles: [],
      hasPendingTiles: false,
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

  describe('Virtuoso endReached', () => {
    it('calls loadMore when hasMore and not loadingMore', () => {
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

      fireEvent.click(screen.getByTestId('virtuoso-end-reached'));
      expect(mockLoadMore).toHaveBeenCalledOnce();
    });

    it('does not call loadMore when loadingMore is true', () => {
      const mockLoadMore = vi.fn().mockResolvedValue(undefined);
      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={true}
          error={null}
          hasMore={true}
          loadMore={mockLoadMore}
        />,
      );

      fireEvent.click(screen.getByTestId('virtuoso-end-reached'));
      expect(mockLoadMore).not.toHaveBeenCalled();
    });

    it('does not call loadMore when hasMore is false', () => {
      const mockLoadMore = vi.fn().mockResolvedValue(undefined);
      render(
        <VisualTimelinePosts
          postIds={['author:post1']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={mockLoadMore}
        />,
      );

      fireEvent.click(screen.getByTestId('virtuoso-end-reached'));
      expect(mockLoadMore).not.toHaveBeenCalled();
    });
  });
});

describe('VisualTimelinePosts - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsTouchDevice.mockReturnValue(false);
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRows(),
      tail: [],
      tiles: [],
      hasPendingTiles: false,
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
});
