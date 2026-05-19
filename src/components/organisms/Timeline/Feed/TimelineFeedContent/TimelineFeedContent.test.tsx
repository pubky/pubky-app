import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIMELINE_FEED_VARIANT } from '@/config/feed';
import { useMutedUsers } from '@/hooks/useMutedUsers/useMutedUsers';
import type { UsePullToRefreshResult } from '@/hooks/usePullToRefresh/usePullToRefresh.types';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
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

vi.mock('@/molecules/Toaster/showErrorToast', () => {
  return {
    showErrorToast: vi.fn(),
  };
});

vi.mock('@/organisms/Timeline/Posts/Posts', () => {
  return {
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
  };
});

const mockLoadMore = vi.fn();
const mockRefresh = vi.fn();
const mockPrependPosts = vi.fn();
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
  removePosts: mockRemovePosts,
};
const mockUseStreamPagination = vi.mocked(useStreamPagination);
const mockUseMutedUsers = vi.mocked(useMutedUsers);

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
