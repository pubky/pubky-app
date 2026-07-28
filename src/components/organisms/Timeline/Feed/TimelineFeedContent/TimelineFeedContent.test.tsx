import { createRef, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import type { FeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import type { UsePullToRefreshResult } from '@/hooks/usePullToRefresh/usePullToRefresh.types';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import {
  buildAuthorCollectionsStreamId,
  buildCollectionItemsStreamId,
  type PostStreamId,
  PostStreamTypes,
} from '@/models/stream/post/postStream.types';
import { useFeedOptimisticStore } from '@/stores/feedOptimistic/feedOptimistic.store';
import { buildFeedKey } from '@/stores/feedOptimistic/feedOptimistic.types';
import { LAYOUT } from '@/stores/home/home.types';
import { useTimelineFeedContext } from '../TimelineFeed/TimelineFeedContext';
import { TimelineFeedWithStream } from './TimelineFeedContent';

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

vi.mock('@/molecules/NewPostsButton/NewPostsButton', () => {
  return {
    NewPostsButton: ({ visible, count }: { visible: boolean; count: number }) =>
      visible ? <div data-testid="new-posts-button">{count} new posts</div> : null,
  };
});

vi.mock('@/molecules/PullToRefreshIndicator/PullToRefreshIndicator', () => {
  return {
    PullToRefreshIndicator: ({ state }: { state: string }) =>
      state !== 'idle' ? <div data-testid="pull-to-refresh">{state}</div> : null,
  };
});

vi.mock('@/molecules/Timeline/TimelineLoading', () => {
  return {
    TimelineLoading: () => <div data-testid="timeline-loading">Loading...</div>,
  };
});

vi.mock('@/molecules/Toaster/use-toast', () => {
  return {
    toast: vi.fn(),
  };
});

vi.mock('@/organisms/Timeline/Posts/Posts', () => {
  return {
    TimelinePosts: ({
      postIds,
      loading,
      hasMore,
      emptyState,
      trailingSlot,
      showEndMessage,
    }: {
      postIds: string[];
      loading: boolean;
      loadingMore: boolean;
      error: string | null;
      hasMore: boolean;
      loadMore: () => void;
      tagsLayout: string;
      emptyState?: ReactNode;
      trailingSlot?: ReactNode;
      showEndMessage?: boolean;
    }) => (
      <div
        data-testid="timeline-posts"
        data-has-trailing-slot={trailingSlot ? 'true' : undefined}
        data-show-end-message={showEndMessage === undefined ? undefined : String(showEndMessage)}
      >
        <span data-testid="post-count">{postIds.length}</span>
        <span data-testid="loading">{loading.toString()}</span>
        <span data-testid="has-more">{hasMore.toString()}</span>
        {postIds.length === 0 ? emptyState : null}
        {trailingSlot}
      </div>
    ),
  };
});

vi.mock('@/organisms/Timeline/Posts/GridPosts/GridPosts', () => {
  return {
    TimelineGridPosts: ({
      postIds,
      showEndMessage,
      emptyState,
      trailingSlot,
    }: {
      postIds: string[];
      showEndMessage?: boolean;
      emptyState?: ReactNode;
      trailingSlot?: ReactNode;
    }) => (
      <div
        data-testid="timeline-grid-posts"
        data-show-end-message={String(showEndMessage)}
        data-has-trailing-slot={String(Boolean(trailingSlot))}
      >
        <span data-testid="grid-post-count">{postIds.length}</span>
        {postIds.length === 0 ? emptyState : null}
        {trailingSlot}
      </div>
    ),
  };
});

const COLLECTION_STREAM_ID = buildCollectionItemsStreamId('author-pubky', 'collection-post');

const gridLayoutResolution: FeedLayoutResolution = {
  requestedLayout: LAYOUT.COLUMNS,
  effectiveLayout: LAYOUT.COLUMNS,
  isVisualRequested: false,
  isVisualActive: false,
  isGridActive: true,
  isPhoneViewport: false,
};

const visualGridLayoutResolution: FeedLayoutResolution = {
  ...gridLayoutResolution,
  requestedLayout: LAYOUT.VISUAL,
  effectiveLayout: LAYOUT.VISUAL,
  isVisualRequested: true,
  isVisualActive: true,
};

const listLayoutResolution: FeedLayoutResolution = {
  ...gridLayoutResolution,
  requestedLayout: LAYOUT.LIST,
  effectiveLayout: LAYOUT.LIST,
  isGridActive: false,
};

const mockLoadMore = vi.fn();
const mockRefresh = vi.fn();
const mockPrependPosts = vi.fn();
const mockPrependOptimisticPosts = vi.fn();
const mockRemovePosts = vi.fn();

const defaultMutedUsersResult = {
  mutedUserIds: [],
  mutedUserIdSet: new Set<string>(),
  isMuted: vi.fn(() => false),
  isLoading: false,
};

const defaultPaginationResult = {
  postIds: ['post1', 'post2', 'post3'],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  loadMore: mockLoadMore,
  refresh: mockRefresh,
  prependPosts: mockPrependPosts,
  prependOptimisticPosts: mockPrependOptimisticPosts,
  removePosts: mockRemovePosts,
};
const mockUseStreamPagination = vi.mocked(useStreamPagination);
const mockUseMutedUsers = vi.mocked(useMutedUsers);

function ContextProbe() {
  const context = useTimelineFeedContext();

  return <div data-testid="timeline-context-collection-id">{context?.collectionId ?? 'none'}</div>;
}

describe('TimelineFeedContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUseMutedUsers.mockReturnValue(defaultMutedUsersResult);
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

    it('provides collection id in the timeline feed context when passed', () => {
      render(
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
        >
          <ContextProbe />
        </TimelineFeedWithStream>,
      );
      expect(screen.getByTestId('timeline-context-collection-id')).toHaveTextContent('author-pubky:collection-post');
    });
  });

  describe('Optimistic feed inserts (FAB bridge)', () => {
    const collectionId = 'author-pubky:collection-post';
    const collectionKey = buildFeedKey({ type: 'collection', collectionId });

    beforeEach(() => {
      useFeedOptimisticStore.setState({ pendingByKey: {} });
    });

    it('applies queued ids to a single collection feed and clears them', () => {
      useFeedOptimisticStore.setState({ pendingByKey: { [collectionKey]: ['author:new1'] } });

      render(
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId={collectionId}
        />,
      );

      expect(mockPrependOptimisticPosts).toHaveBeenCalledWith(['author:new1']);
      expect(useFeedOptimisticStore.getState().pendingByKey[collectionKey]).toBeUndefined();
    });

    it('applies queued ids to the bookmarks feed', () => {
      useFeedOptimisticStore.setState({ pendingByKey: { bookmarks: ['author:bm1'] } });

      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
          variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
          tagsLayout="inline"
        />,
      );

      expect(mockPrependOptimisticPosts).toHaveBeenCalledWith(['author:bm1']);
      expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toBeUndefined();
    });

    it('ignores queued ids for non-participating feeds (home)', () => {
      useFeedOptimisticStore.setState({ pendingByKey: { bookmarks: ['author:bm1'] } });

      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );

      expect(mockPrependOptimisticPosts).not.toHaveBeenCalled();
      expect(useFeedOptimisticStore.getState().pendingByKey.bookmarks).toEqual(['author:bm1']);
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

  describe('Mute set changes', () => {
    const renderHomeFeed = () =>
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );

    it('does not refresh on initial mount', () => {
      mockUseMutedUsers.mockReturnValue({
        ...defaultMutedUsersResult,
        mutedUserIds: ['muted-user'],
        mutedUserIdSet: new Set(['muted-user']),
      });

      renderHomeFeed();

      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('removes visible posts when a user is muted', () => {
      let mutedUserIds: string[] = [];
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        postIds: ['muted-user:post-1', 'other-user:post-2'],
      });
      mockUseMutedUsers.mockImplementation(() => ({
        ...defaultMutedUsersResult,
        mutedUserIds,
        mutedUserIdSet: new Set(mutedUserIds),
      }));

      const { rerender } = renderHomeFeed();
      expect(mockRemovePosts).not.toHaveBeenCalled();

      mutedUserIds = ['muted-user'];
      rerender(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );

      expect(mockRemovePosts).toHaveBeenCalledWith(['muted-user:post-1']);
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('refreshes the feed when a user is unmuted', () => {
      let mutedUserIds = ['muted-user'];
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        postIds: ['muted-user:post-1', 'other-user:post-2'],
      });
      mockUseMutedUsers.mockImplementation(() => ({
        ...defaultMutedUsersResult,
        mutedUserIds,
        mutedUserIdSet: new Set(mutedUserIds),
      }));

      const { rerender } = renderHomeFeed();
      expect(mockRefresh).not.toHaveBeenCalled();

      mockRemovePosts.mockClear();
      mutedUserIds = [];
      rerender(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );

      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(mockRemovePosts).not.toHaveBeenCalled();
    });

    it('prefers refresh when mute changes both add and remove users', () => {
      let mutedUserIds = ['previous-muted-user'];
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        postIds: ['new-muted-user:post-1', 'other-user:post-2'],
      });
      mockUseMutedUsers.mockImplementation(() => ({
        ...defaultMutedUsersResult,
        mutedUserIds,
        mutedUserIdSet: new Set(mutedUserIds),
      }));

      const { rerender } = renderHomeFeed();

      mockRemovePosts.mockClear();
      mutedUserIds = ['new-muted-user'];
      rerender(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );

      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(mockRemovePosts).not.toHaveBeenCalled();
    });

    it('does not remove or refresh posts for profile feeds', () => {
      let mutedUserIds = ['muted-user'];
      const profileStreamId = 'author:profile-user' as PostStreamId;
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        postIds: ['muted-user:post-1', 'other-user:post-2'],
      });
      mockUseMutedUsers.mockImplementation(() => ({
        ...defaultMutedUsersResult,
        mutedUserIds,
        mutedUserIdSet: new Set(mutedUserIds),
      }));

      const { rerender } = render(
        <TimelineFeedWithStream
          streamId={profileStreamId}
          variant={TIMELINE_FEED_VARIANT.PROFILE}
          tagsLayout="inline"
        />,
      );

      mutedUserIds = [];
      rerender(
        <TimelineFeedWithStream
          streamId={profileStreamId}
          variant={TIMELINE_FEED_VARIANT.PROFILE}
          tagsLayout="inline"
        />,
      );

      expect(mockRefresh).not.toHaveBeenCalled();
      expect(mockRemovePosts).not.toHaveBeenCalled();
    });

    it('does not remove or refresh posts for profile collections feeds', () => {
      let mutedUserIds = ['muted-user'];
      const profileCollectionsStreamId = buildAuthorCollectionsStreamId('profile-user');
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        postIds: ['muted-user:collection-1', 'other-user:collection-2'],
      });
      mockUseMutedUsers.mockImplementation(() => ({
        ...defaultMutedUsersResult,
        mutedUserIds,
        mutedUserIdSet: new Set(mutedUserIds),
      }));

      const { rerender } = render(
        <TimelineFeedWithStream
          streamId={profileCollectionsStreamId}
          variant={TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS}
          tagsLayout="inline"
        />,
      );

      mutedUserIds = [];
      rerender(
        <TimelineFeedWithStream
          streamId={profileCollectionsStreamId}
          variant={TIMELINE_FEED_VARIANT.PROFILE_COLLECTIONS}
          tagsLayout="inline"
        />,
      );

      expect(mockRefresh).not.toHaveBeenCalled();
      expect(mockRemovePosts).not.toHaveBeenCalled();
    });

    it('does not remove or refresh posts for bookmarks feeds', () => {
      let mutedUserIds = ['muted-user'];
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        postIds: ['muted-user:post-1', 'other-user:post-2'],
      });
      mockUseMutedUsers.mockImplementation(() => ({
        ...defaultMutedUsersResult,
        mutedUserIds,
        mutedUserIdSet: new Set(mutedUserIds),
      }));

      const { rerender } = render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
          variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
          tagsLayout="inline"
        />,
      );

      mutedUserIds = [];
      rerender(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
          variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
          tagsLayout="inline"
        />,
      );

      expect(mockRefresh).not.toHaveBeenCalled();
      expect(mockRemovePosts).not.toHaveBeenCalled();
    });
  });
});

describe('Grid layout variants (decisions D5/D7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUseMutedUsers.mockReturnValue(defaultMutedUsersResult);
    mockUsePullToRefresh.mockReturnValue({ state: 'idle' as const, pullDistance: 0 });
  });

  it('renders the grid renderer (not the vertical list) when isGridActive', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
      />,
    );
    expect(screen.getByTestId('timeline-grid-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-posts')).not.toBeInTheDocument();
    expect(screen.getByTestId('grid-post-count')).toHaveTextContent('3');
  });

  it('suppresses the end-of-feed message for the collection grid', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
      />,
    );
    expect(screen.getByTestId('timeline-grid-posts')).toHaveAttribute('data-show-end-message', 'false');
  });

  it('forwards a custom empty state to the grid renderer', () => {
    mockUseStreamPagination.mockReturnValue({
      ...defaultPaginationResult,
      postIds: [],
    });

    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
        emptyState={<div data-testid="custom-empty">Collection is empty</div>}
      />,
    );

    expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
  });

  it('forwards trailingSlot to the grid renderer', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
        trailingSlot={<div data-testid="grid-trailing-slot">Add content</div>}
      />,
    );

    expect(screen.getByTestId('timeline-grid-posts')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('grid-trailing-slot')).toBeInTheDocument();
  });

  it('forwards the custom empty state and trailing slot to the List renderer', () => {
    mockUseStreamPagination.mockReturnValue({
      ...defaultPaginationResult,
      postIds: [],
    });

    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="list"
        layoutResolution={listLayoutResolution}
        emptyState={<div data-testid="custom-list-empty">Collection is empty</div>}
        trailingSlot={<div data-testid="list-trailing-slot">Add content</div>}
      />,
    );

    expect(screen.getByTestId('custom-list-empty')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-show-end-message', 'false');
    expect(screen.getByTestId('list-trailing-slot')).toBeInTheDocument();
  });

  it('renders the bookmarks variant in the grid and suppresses the end-of-feed message', () => {
    render(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
        variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
      />,
    );

    expect(screen.getByTestId('timeline-grid-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-posts')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-grid-posts')).toHaveAttribute('data-show-end-message', 'false');
  });

  it('keeps header children visible for bookmarks when visual layout still resolves to the grid', () => {
    render(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
        variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
        tagsLayout="inline"
        layoutResolution={visualGridLayoutResolution}
      >
        <div data-testid="bookmarks-header">Bookmarks hero</div>
      </TimelineFeedWithStream>,
    );

    expect(screen.getByTestId('bookmarks-header')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-grid-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('visual-timeline-posts')).not.toBeInTheDocument();
  });

  it('falls back to the vertical list when no grid layout resolution is provided', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
      />,
    );
    expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-grid-posts')).not.toBeInTheDocument();
  });

  it('enables pull-to-refresh for the collection variant', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
      />,
    );
    expect(mockUsePullToRefresh).toHaveBeenCalledWith(expect.objectContaining({ disabled: false }));
  });

  it('uses an external pull-to-refresh container ref when provided', () => {
    const pullToRefreshContainerRef = createRef<HTMLElement>();
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
        pullToRefreshContainerRef={pullToRefreshContainerRef}
      />,
    );
    expect(mockUsePullToRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ containerRef: pullToRefreshContainerRef }),
    );
  });

  it('shows pull-to-refresh indicator for the collection variant when pulling', () => {
    mockUsePullToRefresh.mockReturnValue({ state: 'pulling' as const, pullDistance: 50 });
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
      />,
    );
    expect(screen.getByTestId('pull-to-refresh')).toBeInTheDocument();
  });

  it('applies muting for the collection variant (not in the mute skip list, D7)', () => {
    let mutedUserIds: string[] = [];
    mockUseStreamPagination.mockReturnValue({
      ...defaultPaginationResult,
      postIds: ['muted-user:post-1', 'other-user:post-2'],
    });
    mockUseMutedUsers.mockImplementation(() => ({
      ...defaultMutedUsersResult,
      mutedUserIds,
      mutedUserIdSet: new Set(mutedUserIds),
    }));

    const { rerender } = render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
      />,
    );
    expect(mockRemovePosts).not.toHaveBeenCalled();

    mutedUserIds = ['muted-user'];
    rerender(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={gridLayoutResolution}
      />,
    );

    expect(mockRemovePosts).toHaveBeenCalledWith(['muted-user:post-1']);
  });
});

describe('TimelineFeedContent - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUseMutedUsers.mockReturnValue(defaultMutedUsersResult);
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
