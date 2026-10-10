import { createRef, type ReactNode, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { NEXUS_STREAM_MAX_LIMIT } from '@/config/nexus';
import { TtlController } from '@/controllers/ttl/ttl';
import type { FeedLayoutResolution } from '@/hooks/useFeedLayoutResolution/useFeedLayoutResolution';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import type { UsePullToRefreshOptions, UsePullToRefreshResult } from '@/hooks/usePullToRefresh/usePullToRefresh.types';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { useUnreadPosts } from '@/hooks/useUnreadPosts/useUnreadPosts';
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
  vi.fn((_options: UsePullToRefreshOptions): UsePullToRefreshResult => ({
    state: 'idle',
    pullDistance: 0,
  })),
);
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

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/organisms/Timeline/Posts/Posts', () => {
  return {
    TimelinePosts: ({
      postIds,
      loading,
      loadingMore,
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
        data-post-ids={postIds.join(',')}
        data-has-trailing-slot={trailingSlot ? 'true' : undefined}
        data-show-end-message={showEndMessage === undefined ? undefined : String(showEndMessage)}
      >
        <span data-testid="post-count">{postIds.length}</span>
        <span data-testid="loading">{loading.toString()}</span>
        <span data-testid="loading-more">{loadingMore.toString()}</span>
        <span data-testid="has-more">{hasMore.toString()}</span>
        {postIds.length === 0 ? emptyState : null}
        {trailingSlot}
      </div>
    ),
  };
});

vi.mock('@/organisms/Timeline/Posts/CardsPosts/CardsPosts', () => {
  return {
    TimelineCardsPosts: ({
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
        data-testid="timeline-cards-posts"
        data-show-end-message={String(showEndMessage)}
        data-has-trailing-slot={String(Boolean(trailingSlot))}
      >
        <span data-testid="cards-post-count">{postIds.length}</span>
        {postIds.length === 0 ? emptyState : null}
        {trailingSlot}
      </div>
    ),
  };
});

vi.mock('@/organisms/Timeline/Feed/TimelineFeed/VisualTimelinePosts', () => {
  return {
    VisualTimelinePosts: ({
      postIds,
      showEndMessage,
      emptyState,
      trailingSlot,
      hiddenItemsNotice,
      showUnavailablePosts,
    }: {
      postIds: string[];
      showEndMessage?: boolean;
      emptyState?: ReactNode;
      trailingSlot?: ReactNode;
      hiddenItemsNotice?: ReactNode;
      showUnavailablePosts?: boolean;
    }) => (
      <div
        data-testid="visual-timeline-posts"
        data-show-end-message={String(showEndMessage)}
        data-has-trailing-slot={String(Boolean(trailingSlot))}
        data-has-hidden-items-notice={String(Boolean(hiddenItemsNotice))}
        data-show-unavailable-posts={String(Boolean(showUnavailablePosts))}
      >
        <span data-testid="visual-post-count">{postIds.length}</span>
        {postIds.length === 0 ? emptyState : null}
        {hiddenItemsNotice}
        {trailingSlot}
      </div>
    ),
  };
});

const COLLECTION_STREAM_ID = buildCollectionItemsStreamId('author-pubky', 'collection-post');

const cardsLayoutResolution: FeedLayoutResolution = {
  requestedLayout: LAYOUT.CARDS,
  effectiveLayout: LAYOUT.CARDS,
  isCardsActive: true,
  isVisualRequested: false,
  isVisualActive: false,
  isPhoneViewport: false,
};

const visualCollectionLayoutResolution: FeedLayoutResolution = {
  ...cardsLayoutResolution,
  requestedLayout: LAYOUT.VISUAL,
  effectiveLayout: LAYOUT.VISUAL,
  isCardsActive: false,
  isVisualRequested: true,
  isVisualActive: true,
};

const visualLayoutResolution: FeedLayoutResolution = {
  ...visualCollectionLayoutResolution,
};

const listLayoutResolution: FeedLayoutResolution = {
  ...cardsLayoutResolution,
  requestedLayout: LAYOUT.LIST,
  effectiveLayout: LAYOUT.LIST,
  isCardsActive: false,
};

const mockLoadMore = vi.fn();
const mockRefresh = vi.fn();
const mockPrependPosts = vi.fn();
const mockPrependOptimisticPosts = vi.fn();
const mockRemovePosts = vi.fn();
const mockRemoveCommit = vi.fn();
const mockRemovePostsOptimistically = vi.fn(() => ({ commit: mockRemoveCommit, rollback: vi.fn() }));

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
  removePostsOptimistically: mockRemovePostsOptimistically,
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
    vi.mocked(useUnreadPosts).mockReturnValue({ unreadPostIds: [], unreadCount: 0 });
    mockUsePullToRefresh.mockReturnValue({ state: 'idle' as const, pullDistance: 0 });
  });

  it('passes mute-list readiness to the new-posts section', () => {
    vi.mocked(useUnreadPosts).mockReturnValue({ unreadPostIds: ['author:new-post'], unreadCount: 1 });
    mockUseMutedUsers.mockReturnValue({ ...defaultMutedUsersResult, isLoading: true });
    const feed = (
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_ALL_ALL}
        variant={TIMELINE_FEED_VARIANT.HOME}
        tagsLayout="inline"
      />
    );
    const { rerender } = render(feed);
    expect(screen.queryByTestId('new-posts-button')).not.toBeInTheDocument();

    mockUseMutedUsers.mockReturnValue(defaultMutedUsersResult);
    rerender(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_ALL_ALL}
        variant={TIMELINE_FEED_VARIANT.HOME}
        tagsLayout="inline"
      />,
    );
    expect(screen.getByTestId('new-posts-button')).toHaveTextContent('1 new posts');
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
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
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
      expect(screen.getByTestId('child').parentElement).toHaveClass('gap-4');
    });

    it('renders ordinary children before the persistent header and post list', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
          persistentHeader={<div data-testid="persistent-header">Tagged-as headline</div>}
        >
          <div data-testid="child">Post input</div>
        </TimelineFeedWithStream>,
      );

      const child = screen.getByTestId('child');
      const persistentHeader = screen.getByTestId('persistent-header');
      const posts = screen.getByTestId('timeline-posts');

      expect(child.compareDocumentPosition(persistentHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(persistentHeader.compareDocumentPosition(posts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('keeps the persistent header visible while hiding ordinary children in Visual layout', () => {
      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
          layoutResolution={visualLayoutResolution}
          persistentHeader={<div data-testid="persistent-header">Tagged-as headline</div>}
        >
          <div data-testid="child">Post input</div>
        </TimelineFeedWithStream>,
      );

      expect(screen.queryByTestId('child')).not.toBeInTheDocument();
      expect(screen.getByTestId('persistent-header')).toBeInTheDocument();
      expect(screen.getByTestId('visual-timeline-posts')).toBeInTheDocument();
    });
  });

  describe('collection full-membership loading', () => {
    it('requests the Nexus max page size for the collection variant', () => {
      render(
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
        />,
      );

      expect(mockUseStreamPagination).toHaveBeenCalledWith({
        streamId: COLLECTION_STREAM_ID,
        limit: NEXUS_STREAM_MAX_LIMIT,
      });
    });

    it('eagerly loads the next page while the collection stream has more', () => {
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: true });

      render(
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
        />,
      );

      expect(mockLoadMore).toHaveBeenCalled();
    });

    it('stops eager loading once the collection stream reaches its end', () => {
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: false });

      render(
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
        />,
      );

      expect(mockLoadMore).not.toHaveBeenCalled();
    });

    it('does not eager-load while the initial page or a next page is still in flight', () => {
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, loading: true, hasMore: true });
      const { unmount } = render(
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
        />,
      );
      expect(mockLoadMore).not.toHaveBeenCalled();
      unmount();

      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, loadingMore: true, hasMore: true });
      render(
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
        />,
      );
      expect(mockLoadMore).not.toHaveBeenCalled();
    });

    it('caps eager loading as a defensive bound against a misreported stream end', () => {
      // Simulate completed rounds by toggling loadingMore across rerenders while
      // the (mocked) stream keeps claiming more pages exist.
      const renderFeed = () => (
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
          membershipPostIds={['uncached:post']}
        />
      );
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, postIds: [], hasMore: true });
      const { rerender } = render(renderFeed());

      for (let round = 0; round < 6; round++) {
        mockUseStreamPagination.mockReturnValue({
          ...defaultPaginationResult,
          postIds: [],
          hasMore: true,
          loadingMore: true,
        });
        rerender(renderFeed());
        mockUseStreamPagination.mockReturnValue({
          ...defaultPaginationResult,
          postIds: [],
          hasMore: true,
          loadingMore: false,
        });
        rerender(renderFeed());
      }

      // ceil(COLLECTION_ITEMS_MAX_COUNT / NEXUS_STREAM_MAX_LIMIT) + 1 = 3.
      expect(mockLoadMore).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    it('resets the eager-load budget when the stream restarts from an initial load', () => {
      const renderFeed = () => (
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          collectionId="author-pubky:collection-post"
        />
      );
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: true });
      const { rerender } = render(renderFeed());

      for (let round = 0; round < 6; round++) {
        mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: true, loadingMore: true });
        rerender(renderFeed());
        mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: true, loadingMore: false });
        rerender(renderFeed());
      }
      expect(mockLoadMore).toHaveBeenCalledTimes(3);

      // A refresh (pull-to-refresh / unmute) restarts the stream with an
      // initial `loading` phase, which must re-arm the eager budget.
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: true, loading: true });
      rerender(renderFeed());
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: true, loading: false });
      rerender(renderFeed());

      expect(mockLoadMore).toHaveBeenCalledTimes(4);
    });

    it('keeps lazy pagination and the default page size for non-collection variants', () => {
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, hasMore: true });

      render(
        <TimelineFeedWithStream
          streamId={PostStreamTypes.TIMELINE_ALL_ALL}
          variant={TIMELINE_FEED_VARIANT.HOME}
          tagsLayout="inline"
        />,
      );

      expect(mockUseStreamPagination).toHaveBeenCalledWith({ streamId: PostStreamTypes.TIMELINE_ALL_ALL });
      expect(mockLoadMore).not.toHaveBeenCalled();
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

  describe('Collection membership display', () => {
    const collectionFeed = (membershipPostIds: string[] | undefined) => (
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        membershipPostIds={membershipPostIds}
      />
    );

    it('projects the local membership over the stream without issuing feed mutations', () => {
      const { rerender } = render(collectionFeed(undefined));
      rerender(collectionFeed(['post3', 'post1']));
      expect(mockUseStreamPagination).toHaveBeenLastCalledWith({
        streamId: COLLECTION_STREAM_ID,
        limit: NEXUS_STREAM_MAX_LIMIT,
      });
      expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-post-ids', 'post3,post1');
      expect(mockPrependOptimisticPosts).not.toHaveBeenCalled();
      expect(mockRemovePostsOptimistically).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('keeps a card retained by an open picker in its slot after membership drops it', () => {
      function RetainProbe({ postId }: { postId: string }) {
        const retainPost = useTimelineFeedContext()?.retainPost;
        useEffect(() => retainPost?.(postId), [retainPost, postId]);
        return null;
      }
      const retainedFeed = (membershipPostIds: string[]) => (
        <TimelineFeedWithStream
          streamId={COLLECTION_STREAM_ID}
          variant={TIMELINE_FEED_VARIANT.COLLECTION}
          tagsLayout="inline"
          membershipPostIds={membershipPostIds}
        >
          <RetainProbe postId="post2" />
        </TimelineFeedWithStream>
      );
      const { rerender } = render(retainedFeed(['post3', 'post2', 'post1']));
      rerender(retainedFeed(['post3', 'post1']));
      expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-post-ids', 'post3,post2,post1');
    });

    it('shows the loading row while members hydrate behind cards that are already shown', () => {
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, postIds: ['post1'], loading: true });
      const { rerender } = render(collectionFeed(['post1', 'uncached:post']));
      expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-post-ids', 'post1');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.getByTestId('loading-more')).toHaveTextContent('true');

      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, postIds: ['post1'], hasMore: false });
      rerender(collectionFeed(['post1', 'uncached:post']));
      expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-post-ids', 'post1,uncached:post');
      expect(screen.getByTestId('loading-more')).toHaveTextContent('false');
    });

    it('passes the loading-more state while every member is shown and the stream still loads', () => {
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, postIds: ['post1'], loading: true });
      const { rerender } = render(collectionFeed(['post1']));
      // The whole membership is on screen while the stream is still in flight; the
      // loading row (and the disarmed sentinel) cover it instead of a page request.
      expect(screen.getByTestId('post-count')).toHaveTextContent('1');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.getByTestId('loading-more')).toHaveTextContent('true');

      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, postIds: ['post1'], hasMore: false });
      rerender(collectionFeed(['post1']));
      expect(screen.getByTestId('loading-more')).toHaveTextContent('false');
    });

    it('refreshes the collection envelope with the stream on pull-to-refresh', async () => {
      const forceRefresh = vi.spyOn(TtlController, 'forceRefreshPostsByIds').mockResolvedValue(undefined);
      try {
        render(
          <TimelineFeedWithStream
            streamId={COLLECTION_STREAM_ID}
            variant={TIMELINE_FEED_VARIANT.COLLECTION}
            tagsLayout="inline"
            collectionId="author-pubky:collection-post"
            membershipPostIds={['post1']}
          />,
        );
        const { onRefresh } = mockUsePullToRefresh.mock.lastCall![0];
        await act(async () => {
          await onRefresh();
        });
        expect(mockRefresh).toHaveBeenCalledOnce();
        expect(forceRefresh).toHaveBeenCalledWith({ postIds: ['author-pubky:collection-post'], viewerId: undefined });
      } finally {
        forceRefresh.mockRestore();
      }
    });

    it('waits for the local membership, then displays it even while Nexus is loading', () => {
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, loading: true });
      const { rerender } = render(collectionFeed(undefined));
      expect(screen.getByTestId('loading')).toHaveTextContent('true');
      rerender(collectionFeed(['post1', 'post2', 'post3']));
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.getByTestId('post-count')).toHaveTextContent('3');
    });

    it('waits for the mute list and restores unmuted members without another stream fetch', () => {
      const members = ['muted-user:post1', 'other-user:post2'];
      mockUseStreamPagination.mockReturnValue({ ...defaultPaginationResult, postIds: members });
      mockUseMutedUsers.mockReturnValue({ ...defaultMutedUsersResult, isLoading: true });
      const { rerender } = render(collectionFeed(members));
      expect(screen.getByTestId('loading')).toHaveTextContent('true');
      expect(screen.getByTestId('post-count')).toHaveTextContent('0');

      mockUseMutedUsers.mockReturnValue({ ...defaultMutedUsersResult, mutedUserIdSet: new Set(['muted-user']) });
      rerender(collectionFeed(members));
      expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-post-ids', 'other-user:post2');

      mockUseMutedUsers.mockReturnValue(defaultMutedUsersResult);
      rerender(collectionFeed(members));
      expect(screen.getByTestId('timeline-posts')).toHaveAttribute('data-post-ids', members.join(','));
      expect(mockRemovePosts).not.toHaveBeenCalled();
      expect(mockRefresh).not.toHaveBeenCalled();
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

describe('Cards layout dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUseMutedUsers.mockReturnValue(defaultMutedUsersResult);
    mockUsePullToRefresh.mockReturnValue({ state: 'idle' as const, pullDistance: 0 });
  });

  it('renders the Cards renderer (not the vertical list) when isCardsActive', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={cardsLayoutResolution}
      />,
    );
    expect(screen.getByTestId('timeline-cards-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-posts')).not.toBeInTheDocument();
    expect(screen.getByTestId('cards-post-count')).toHaveTextContent('3');
  });

  it('renders ordinary children and the persistent header before the grid', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.HOME}
        tagsLayout="inline"
        layoutResolution={cardsLayoutResolution}
        persistentHeader={<div data-testid="persistent-header">Tagged-as headline</div>}
      >
        <div data-testid="child">Post input</div>
      </TimelineFeedWithStream>,
    );

    const child = screen.getByTestId('child');
    const persistentHeader = screen.getByTestId('persistent-header');
    const grid = screen.getByTestId('timeline-cards-posts');

    expect(child.compareDocumentPosition(persistentHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(persistentHeader.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('suppresses the end-of-feed message for the collection grid', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={cardsLayoutResolution}
      />,
    );
    expect(screen.getByTestId('timeline-cards-posts')).toHaveAttribute('data-show-end-message', 'false');
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
        layoutResolution={cardsLayoutResolution}
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
        layoutResolution={cardsLayoutResolution}
        trailingSlot={<div data-testid="cards-trailing-slot">Add content</div>}
      />,
    );

    expect(screen.getByTestId('timeline-cards-posts')).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(screen.getByTestId('cards-trailing-slot')).toBeInTheDocument();
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
        layoutResolution={cardsLayoutResolution}
      />,
    );

    expect(screen.getByTestId('timeline-cards-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-posts')).not.toBeInTheDocument();
    expect(screen.getByTestId('timeline-cards-posts')).toHaveAttribute('data-show-end-message', 'false');
  });

  it('keeps header children visible for bookmarks in Cards', () => {
    render(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_BOOKMARKS_ALL}
        variant={TIMELINE_FEED_VARIANT.BOOKMARKS}
        tagsLayout="inline"
        layoutResolution={cardsLayoutResolution}
      >
        <div data-testid="bookmarks-header">Bookmarks hero</div>
      </TimelineFeedWithStream>,
    );

    expect(screen.getByTestId('bookmarks-header')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-cards-posts')).toBeInTheDocument();
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
    expect(screen.queryByTestId('timeline-cards-posts')).not.toBeInTheDocument();
  });

  it('enables pull-to-refresh for the collection variant', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={cardsLayoutResolution}
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
        layoutResolution={cardsLayoutResolution}
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
        layoutResolution={cardsLayoutResolution}
      />,
    );
    expect(screen.getByTestId('pull-to-refresh')).toBeInTheDocument();
  });

  it('filters muted collection cards without dismissing their membership', () => {
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
        layoutResolution={cardsLayoutResolution}
      />,
    );
    expect(mockRemovePosts).not.toHaveBeenCalled();

    mutedUserIds = ['muted-user'];
    rerender(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={cardsLayoutResolution}
      />,
    );

    expect(screen.getByTestId('cards-post-count')).toHaveTextContent('1');
    expect(mockRemovePosts).not.toHaveBeenCalled();
  });
});

describe('Visual layout variants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUseMutedUsers.mockReturnValue(defaultMutedUsersResult);
    mockUsePullToRefresh.mockReturnValue({ state: 'idle' as const, pullDistance: 0 });
  });

  it('keeps the collection hero visible when the Visual mosaic is active', () => {
    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={visualLayoutResolution}
      >
        <div data-testid="collection-hero">Collection hero</div>
      </TimelineFeedWithStream>,
    );

    expect(screen.getByTestId('collection-hero')).toBeInTheDocument();
    expect(screen.getByTestId('visual-timeline-posts')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-posts')).not.toBeInTheDocument();
    expect(screen.queryByTestId('timeline-cards-posts')).not.toBeInTheDocument();
  });

  it('hides header children for the home variant when the Visual mosaic is active', () => {
    render(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_ALL_ALL}
        variant={TIMELINE_FEED_VARIANT.HOME}
        tagsLayout="inline"
        layoutResolution={visualLayoutResolution}
      >
        <div data-testid="home-header">Filter bar</div>
      </TimelineFeedWithStream>,
    );

    expect(screen.queryByTestId('home-header')).not.toBeInTheDocument();
    expect(screen.getByTestId('visual-timeline-posts')).toBeInTheDocument();
  });

  it('forwards the empty state, trailing slot, hidden-items notice, and end-message suppression to the visual renderer', () => {
    mockUseStreamPagination.mockReturnValue({
      ...defaultPaginationResult,
      postIds: [],
    });

    render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={visualLayoutResolution}
        emptyState={<div data-testid="custom-visual-empty">Collection is empty</div>}
        trailingSlot={<div data-testid="visual-trailing-slot">Add content</div>}
        visualHiddenItemsNotice={<div data-testid="visual-hidden-items-notice">Some items are hidden</div>}
      />,
    );

    const visualPosts = screen.getByTestId('visual-timeline-posts');
    expect(visualPosts).toHaveAttribute('data-show-end-message', 'false');
    expect(visualPosts).toHaveAttribute('data-has-trailing-slot', 'true');
    expect(visualPosts).toHaveAttribute('data-has-hidden-items-notice', 'true');
    expect(screen.getByTestId('custom-visual-empty')).toBeInTheDocument();
    expect(screen.getByTestId('visual-trailing-slot')).toBeInTheDocument();
    expect(screen.getByTestId('visual-hidden-items-notice')).toBeInTheDocument();
  });

  it('enables unavailable-post placeholders only for the collection variant', () => {
    const { unmount } = render(
      <TimelineFeedWithStream
        streamId={COLLECTION_STREAM_ID}
        variant={TIMELINE_FEED_VARIANT.COLLECTION}
        tagsLayout="inline"
        layoutResolution={visualLayoutResolution}
      />,
    );

    expect(screen.getByTestId('visual-timeline-posts')).toHaveAttribute('data-show-unavailable-posts', 'true');
    unmount();

    render(
      <TimelineFeedWithStream
        streamId={PostStreamTypes.TIMELINE_ALL_ALL}
        variant={TIMELINE_FEED_VARIANT.HOME}
        tagsLayout="inline"
        layoutResolution={visualLayoutResolution}
      />,
    );

    expect(screen.getByTestId('visual-timeline-posts')).toHaveAttribute('data-show-unavailable-posts', 'false');
  });
});
