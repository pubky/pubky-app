import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TIMELINE_FEED_VARIANT } from '@/config';
import { TimelineFeedWithStream } from './TimelineFeedContent';
import type { UsePullToRefreshResult } from '@/hooks/usePullToRefresh/usePullToRefresh.types';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
const mockUsePullToRefresh = vi.hoisted(() =>
  vi.fn(
    (): UsePullToRefreshResult => ({
      state: 'idle',
      pullDistance: 0,
    }),
  ),
);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: vi.fn(),
}));

vi.mock('@/hooks/useMutedUsers/useMutedUsers', () => ({
  useMutedUsers: vi.fn(() => ({
    mutedUserIds: [],
    mutedUserIdSet: new Set(),
    isMuted: vi.fn(() => false),
    isLoading: false,
  })),
}));

vi.mock('@/hooks/useUnreadPosts/useUnreadPosts', () => ({
  useUnreadPosts: vi.fn(() => ({ unreadPostIds: [], unreadCount: 0 })),
}));

vi.mock('@/hooks/useIsScrolledFromTop/useIsScrolledFromTop', () => ({
  useIsScrolledFromTop: vi.fn(() => false),
}));

vi.mock('@/hooks/usePullToRefresh/usePullToRefresh', () => ({
  usePullToRefresh: mockUsePullToRefresh,
}));

vi.mock('@/molecules', () => ({
  TimelineLoading: () => <div data-testid="timeline-loading">Loading...</div>,
  NewPostsButton: ({ visible, count }: { visible: boolean; count: number }) =>
    visible ? <div data-testid="new-posts-button">{count} new posts</div> : null,
  PullToRefreshIndicator: ({ state }: { state: string }) =>
    state !== 'idle' ? <div data-testid="pull-to-refresh">{state}</div> : null,
  showErrorToast: vi.fn(),
}));

vi.mock('@/organisms', () => ({
  TimelinePosts: ({
    postIds,
    loading,
    hasMore,
  }: {
    postIds: string[];
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    hasMore: boolean;
    loadMore: () => void;
    tagsLayout: string;
  }) => (
    <div data-testid="timeline-posts">
      <span data-testid="post-count">{postIds.length}</span>
      <span data-testid="loading">{loading.toString()}</span>
      <span data-testid="has-more">{hasMore.toString()}</span>
    </div>
  ),
}));

const mockLoadMore = vi.fn();
const mockRefresh = vi.fn();
const mockPrependPosts = vi.fn();
const mockRemovePosts = vi.fn();

const defaultPaginationResult = {
  postIds: ['post1', 'post2', 'post3'],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  loadMore: mockLoadMore,
  refresh: mockRefresh,
  prependPosts: mockPrependPosts,
  removePosts: mockRemovePosts,
};
const mockUseStreamPagination = vi.mocked(useStreamPagination);

describe('TimelineFeedContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUsePullToRefresh.mockReturnValue({ state: 'idle' as const, pullDistance: 0 });
  });

  describe('TimelineFeedWithStream guard', () => {
    it('shows loading when streamId is undefined', () => {
      render(<TimelineFeedWithStream streamId={undefined} variant={TIMELINE_FEED_VARIANT.HOME} tagsLayout="inline" />);
      expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
      expect(mockUseStreamPagination).not.toHaveBeenCalled();
    });

    it('renders content when streamId is provided', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );
      expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
      expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
    });

    it('renders children above post list', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        >
          <div data-testid="child">Child Content</div>
        </TimelineFeedWithStream>,
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
    });
  });

  describe('Pagination', () => {
    it('passes streamId to useStreamPagination', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );
      expect(mockUseStreamPagination).toHaveBeenCalledWith({
        streamId: PostStreamTypes.TIMELINE_ALL_ALL,
      });
    });

    it('deduplicates post IDs', () => {
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        postIds: ['post1', 'post2', 'post1'],
      });
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );
      expect(screen.getByTestId('post-count')).toHaveTextContent('2');
    });

    it('passes post count to TimelinePosts', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );
      expect(screen.getByTestId('post-count')).toHaveTextContent('3');
    });
  });

  describe('Pull to refresh', () => {
    it('enables pull-to-refresh for home variant', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );
      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: false,
          containerRef: expect.objectContaining({ current: expect.any(Object) }),
        }),
      );
    });

    it('disables pull-to-refresh for bookmarks variant', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
          variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
          tagsLayout="inline"
        />,
      );
      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({ disabled: true, containerRef: expect.any(Object) }),
      );
    });

    it('shows pull-to-refresh indicator when pulling', () => {
      mockUsePullToRefresh.mockReturnValue({ state: 'pulling' as const, pullDistance: 50 });
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );
      expect(screen.getByTestId('pull-to-refresh')).toBeInTheDocument();
    });

    it('hides pull-to-refresh indicator for disabled variants even when pulling', () => {
      mockUsePullToRefresh.mockReturnValue({ state: 'pulling' as const, pullDistance: 50 });
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
          variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
          tagsLayout="inline"
        />,
      );
      expect(screen.queryByTestId('pull-to-refresh')).not.toBeInTheDocument();
    });
  });
});

describe('TimelineFeedContent - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUsePullToRefresh.mockReturnValue({ state: 'idle' as const, pullDistance: 0 });
  });

  it('matches snapshot for loading state', () => {
    const { container } = render(
      <TimelineFeedWithStream streamId={undefined} variant={TIMELINE_FEED_VARIANT.HOME} tagsLayout="inline" />,
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with posts', () => {
    const { container } = render(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_ALL_ALL}
        variant={TIMELINE_FEED_VARIANT.HOME}
        tagsLayout="inline"
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with children', () => {
    const { container } = render(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_ALL_ALL}
        variant={TIMELINE_FEED_VARIANT.HOME}
        tagsLayout="inline"
      >
        <div>Filter bar</div>
      </TimelineFeedWithStream>,
    );
    expect(container).toMatchSnapshot();
  });
});
