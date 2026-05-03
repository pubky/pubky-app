import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VisualTimelinePosts } from './VisualTimelinePosts';
import type { VisualRow } from './TimelineFeedVisual.types';

const {
  mockNavigateToPost,
  mockPostHeaderUserInfo,
  mockUseInfiniteScroll,
  mockUseVisualFeedTiles,
  mockUseIsTouchDevice,
} = vi.hoisted(() => ({
  mockNavigateToPost: vi.fn(),
  mockPostHeaderUserInfo: vi.fn(({ timeAgo }: { timeAgo?: string }) => (
    <div data-testid="visual-overlay-header">{timeAgo ? `Header:${timeAgo}` : 'Header'}</div>
  )),
  mockUseInfiniteScroll: vi.fn(),
  mockUseVisualFeedTiles: vi.fn(),
  mockUseIsTouchDevice: vi.fn(() => false),
}));

vi.mock('./useVisualFeedTiles', () => ({
  useVisualFeedTiles: mockUseVisualFeedTiles,
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
  useUserDetails: () => ({ userDetails: { id: 'author', name: 'Author', image: null } }),
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

vi.mock('@/molecules/Timeline/TimelineLoadingMore', () => {
  return {
    TimelineLoadingMore: () => <div data-testid="timeline-loading-more">Loading more</div>,
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
  };
});

vi.mock('@/organisms/ClickableTagsList/ClickableTagsList', () => {
  return {
    ClickableTagsList: () => <div data-testid="visual-overlay-tags">Tags</div>,
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
    mockUseInfiniteScroll.mockReturnValue({
      sentinelRef: vi.fn(),
    });
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRows(),
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
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
  });
});

describe('VisualTimelinePosts - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIsTouchDevice.mockReturnValue(false);
    mockUseInfiniteScroll.mockReturnValue({
      sentinelRef: vi.fn(),
    });
    mockUseVisualFeedTiles.mockReturnValue({
      rows: createRows(),
      tail: [],
      tiles: [],
      hasPendingTiles: false,
      hasPendingFiles: false,
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
});
