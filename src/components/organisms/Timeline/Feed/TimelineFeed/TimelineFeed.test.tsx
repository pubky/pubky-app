import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TIMELINE_FEED_VARIANT } from '@/config';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort } from 'pubky-app-specs';
import { TimelineFeed, useTimelineFeedContext } from './TimelineFeed';
import * as Hooks from '@/hooks';
import * as Providers from '@/providers';
import * as Core from '@/core';

// Mock next/navigation for useSearchParams used by useSearchStreamId
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
  usePathname: () => '/',
  useParams: () => ({ id: '' }),
}));

// Mock dependencies
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    useStreamIdFromFilters: vi.fn(),
    useBookmarksStreamId: vi.fn(),
    useHotStreamId: vi.fn(() => 'total_engagement:all:all' as Core.PostStreamId),
    useCustomFeed: vi.fn(),
    useCustomStreamId: vi.fn(),
    useStreamPagination: vi.fn(),
    useFeedLayoutResolution: vi.fn(() => ({
      requestedLayout: 'columns',
      effectiveLayout: 'columns',
      isVisualRequested: false,
      isVisualActive: false,
      isPhoneViewport: false,
    })),
    useMutedUsers: vi.fn(() => ({
      mutedUserIds: [],
      mutedUserIdSet: new Set(),
      isMuted: vi.fn(() => false),
      isLoading: false,
    })),
  };
});

// Mock useSearchStreamId hook
vi.mock('@/hooks/useSearchStreamId', () => ({
  useSearchStreamId: vi.fn(() => 'tags:test' as Core.PostStreamId),
  useSearchTags: vi.fn(() => []),
}));

// Mock the new hooks used in TimelineFeed
vi.mock('@/hooks/useUnreadPosts', () => ({
  useUnreadPosts: vi.fn(() => ({ unreadPostIds: [], unreadCount: 0 })),
}));

vi.mock('@/hooks/useIsScrolledFromTop', () => ({
  useIsScrolledFromTop: vi.fn(() => false),
}));

const { mockUsePullToRefresh } = vi.hoisted(() => ({
  mockUsePullToRefresh: vi.fn(() => ({
    state: 'idle' as const,
    pullDistance: 0,
  })),
}));

vi.mock('@/hooks/usePullToRefresh', () => ({
  usePullToRefresh: mockUsePullToRefresh,
}));

vi.mock('@/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/providers')>();
  return {
    ...actual,
    ProfileContext: actual.ProfileContext,
  };
});

// Mock components
vi.mock('@/molecules', () => ({
  TimelineLoading: () => <div data-testid="timeline-loading">Loading...</div>,
  NewPostsButton: ({
    count,
    visible,
  }: {
    count: number;
    onClick: () => void;
    visible: boolean;
    isScrolled?: boolean;
  }) => (visible && count > 0 ? <div data-testid="new-posts-button">{count} new posts</div> : null),
  PullToRefreshIndicator: ({ state }: { state: string; pullDistance: number }) =>
    state !== 'idle' ? <div data-testid="pull-to-refresh-indicator">{state}</div> : null,
}));

vi.mock('@/organisms', () => ({
  TimelinePosts: ({
    postIds,
    loading,
    loadingMore,
    error,
    hasMore,
  }: {
    postIds: string[];
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    hasMore: boolean;
  }) => (
    <div data-testid="timeline-posts">
      <span data-testid="post-count">{postIds.length}</span>
      <span data-testid="loading">{loading.toString()}</span>
      <span data-testid="loading-more">{loadingMore.toString()}</span>
      <span data-testid="error">{error || 'none'}</span>
      <span data-testid="has-more">{hasMore.toString()}</span>
    </div>
  ),
}));

vi.mock('./VisualTimelinePosts', () => ({
  VisualTimelinePosts: ({
    postIds,
    loading,
    loadingMore,
    error,
    hasMore,
  }: {
    postIds: string[];
    loading: boolean;
    loadingMore: boolean;
    error: string | null;
    hasMore: boolean;
  }) => (
    <div data-testid="visual-timeline-posts">
      <span data-testid="visual-post-count">{postIds.length}</span>
      <span data-testid="visual-loading">{loading.toString()}</span>
      <span data-testid="visual-loading-more">{loadingMore.toString()}</span>
      <span data-testid="visual-error">{error || 'none'}</span>
      <span data-testid="visual-has-more">{hasMore.toString()}</span>
    </div>
  ),
}));

const mockUseStreamIdFromFilters = vi.mocked(Hooks.useStreamIdFromFilters);
const mockUseCustomFeed = vi.mocked(Hooks.useCustomFeed);
const mockUseCustomStreamId = vi.mocked(Hooks.useCustomStreamId);
const mockUseBookmarksStreamId = vi.mocked(Hooks.useBookmarksStreamId);
const mockUseStreamPagination = vi.mocked(Hooks.useStreamPagination);
const mockUseFeedLayoutResolution = vi.mocked(Hooks.useFeedLayoutResolution);

const mockPrependPosts = vi.fn();
const mockLoadMore = vi.fn();
const mockRefresh = vi.fn();
const defaultPaginationResult = {
  postIds: ['post1', 'post2', 'post3'],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  loadMore: mockLoadMore,
  refresh: mockRefresh,
  prependPosts: mockPrependPosts,
  removePosts: vi.fn(),
};

describe('TimelineFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Core.useHomeStore.setState({
      layout: Core.LAYOUT.COLUMNS,
      sort: Core.SORT.TIMELINE,
      reach: Core.REACH.ALL,
      content: Core.CONTENT.ALL,
    });

    // Default mock implementations
    mockUseStreamIdFromFilters.mockReturnValue(Core.PostStreamTypes.TIMELINE_ALL_ALL);
    mockUseCustomFeed.mockReturnValue({
      id: 'test-feed',
      name: 'Test Feed',
      tags: ['all'],
      reach: PubkyAppFeedReach.All,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Columns,
      created_at: 0,
      updated_at: 0,
    });
    mockUseCustomStreamId.mockReturnValue('timeline:all:all:all' as Core.PostStreamId);
    mockUseBookmarksStreamId.mockReturnValue(Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUseFeedLayoutResolution.mockReturnValue({
      requestedLayout: 'columns',
      effectiveLayout: 'columns',
      isVisualRequested: false,
      isVisualActive: false,
      isPhoneViewport: false,
    });
    // Reset pull-to-refresh mock to idle state
    mockUsePullToRefresh.mockReturnValue({
      state: 'idle' as const,
      pullDistance: 0,
    });
  });

  describe('Home Variant', () => {
    it('should render timeline with home stream', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
      expect(mockUseStreamPagination).toHaveBeenCalledWith({
        streamId: Core.PostStreamTypes.TIMELINE_ALL_ALL,
      });
    });

    it('should render timeline with other steam type', () => {
      mockUseStreamIdFromFilters.mockReturnValue(Core.PostStreamTypes.TIMELINE_FRIENDS_VIDEO);
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
      expect(mockUseStreamPagination).toHaveBeenCalledWith({
        streamId: Core.PostStreamTypes.TIMELINE_FRIENDS_VIDEO,
      });
    });

    it('should render children above timeline', () => {
      render(
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
          <div data-testid="child-component">Child Content</div>
        </TimelineFeed>,
      );

      expect(screen.getByTestId('child-component')).toBeInTheDocument();
      expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
    });

    it('should render the visual renderer when visual layout is active', () => {
      mockUseFeedLayoutResolution.mockReturnValue({
        requestedLayout: 'visual',
        effectiveLayout: 'visual',
        isVisualRequested: true,
        isVisualActive: true,
        isPhoneViewport: false,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('visual-timeline-posts')).toBeInTheDocument();
      expect(screen.queryByTestId('timeline-posts')).not.toBeInTheDocument();
    });

    it('should resolve the home stream against all content before persisting visual content coercion', () => {
      Core.useHomeStore.setState({ content: Core.CONTENT.SHORT });
      mockUseStreamIdFromFilters.mockImplementation((contentOverride?: Core.ContentType) => {
        return contentOverride === Core.CONTENT.ALL
          ? Core.PostStreamTypes.TIMELINE_ALL_ALL
          : Core.PostStreamTypes.TIMELINE_ALL_SHORT;
      });
      mockUseFeedLayoutResolution.mockReturnValue({
        requestedLayout: 'visual',
        effectiveLayout: 'visual',
        isVisualRequested: true,
        isVisualActive: true,
        isPhoneViewport: false,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(mockUseStreamIdFromFilters).toHaveBeenCalledWith(Core.CONTENT.ALL);
      expect(mockUseStreamPagination).toHaveBeenCalledWith({
        streamId: Core.PostStreamTypes.TIMELINE_ALL_ALL,
      });
    });

    it('should persist visual content coercion from the timeline controller', async () => {
      Core.useHomeStore.setState({ content: Core.CONTENT.SHORT });
      mockUseFeedLayoutResolution.mockReturnValue({
        requestedLayout: 'visual',
        effectiveLayout: 'visual',
        isVisualRequested: true,
        isVisualActive: true,
        isPhoneViewport: false,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      await waitFor(() => {
        expect(Core.useHomeStore.getState().content).toBe(Core.CONTENT.ALL);
      });
    });

    it('should hide children while visual layout is active', () => {
      mockUseFeedLayoutResolution.mockReturnValue({
        requestedLayout: 'visual',
        effectiveLayout: 'visual',
        isVisualRequested: true,
        isVisualActive: true,
        isPhoneViewport: false,
      });

      render(
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
          <div data-testid="child-component">Child Content</div>
        </TimelineFeed>,
      );

      expect(screen.queryByTestId('child-component')).not.toBeInTheDocument();
    });

    it('should enable pull-to-refresh for home variant', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: false,
        }),
      );
    });

    it('should pass correct props to TimelinePosts', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('post-count')).toHaveTextContent('3');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
      expect(screen.getByTestId('loading-more')).toHaveTextContent('false');
      expect(screen.getByTestId('error')).toHaveTextContent('none');
      expect(screen.getByTestId('has-more')).toHaveTextContent('true');
    });
  });

  describe('Bookmarks Variant', () => {
    it('should render timeline with bookmarks stream', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />);

      expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
      expect(mockUseStreamPagination).toHaveBeenCalledWith({
        streamId: Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
      });
    });

    it('should disable pull-to-refresh for bookmarks variant', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />);

      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
        }),
      );
    });

    it('should persist visual content coercion for bookmarks feeds', async () => {
      Core.useHomeStore.setState({ content: Core.CONTENT.SHORT });
      mockUseBookmarksStreamId.mockImplementation((contentOverride?: Core.ContentType) => {
        return contentOverride === Core.CONTENT.ALL
          ? Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL
          : Core.PostStreamTypes.TIMELINE_BOOKMARKS_SHORT;
      });
      mockUseFeedLayoutResolution.mockReturnValue({
        requestedLayout: 'visual',
        effectiveLayout: 'visual',
        isVisualRequested: true,
        isVisualActive: true,
        isPhoneViewport: false,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />);

      expect(mockUseBookmarksStreamId).toHaveBeenCalledWith(Core.CONTENT.ALL);

      await waitFor(() => {
        expect(Core.useHomeStore.getState().content).toBe(Core.CONTENT.ALL);
      });
    });
  });

  describe('Custom Variant', () => {
    it('should render timeline with custom stream', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM} />);

      expect(screen.getByTestId('timeline-posts')).toBeInTheDocument();
      expect(mockUseStreamPagination).toHaveBeenCalledWith({
        streamId: 'timeline:all:all:all',
      });
    });

    it('should enable pull-to-refresh for custom variant', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM} />);

      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: false,
        }),
      );
    });

    it('should not sync custom feeds into the home content store', async () => {
      Core.useHomeStore.setState({ content: Core.CONTENT.SHORT });
      mockUseFeedLayoutResolution.mockReturnValue({
        requestedLayout: 'visual',
        effectiveLayout: 'visual',
        isVisualRequested: true,
        isVisualActive: true,
        isPhoneViewport: false,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM} />);

      await waitFor(() => {
        expect(Core.useHomeStore.getState().content).toBe(Core.CONTENT.SHORT);
      });
    });
  });

  describe('Hot Variant', () => {
    it('should enable pull-to-refresh for hot variant', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOT} />);

      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: false,
        }),
      );
    });
  });

  describe('Search Variant', () => {
    it('should disable pull-to-refresh for search variant', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.SEARCH} />);

      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          disabled: true,
        }),
      );
    });
  });

  describe('Pull to Refresh', () => {
    it('should show pull-to-refresh indicator when pulling on home variant', () => {
      mockUsePullToRefresh.mockReturnValue({
        state: 'pulling' as const,
        pullDistance: 50,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('pull-to-refresh-indicator')).toBeInTheDocument();
    });

    it('should show pull-to-refresh indicator when refreshing', () => {
      mockUsePullToRefresh.mockReturnValue({
        state: 'refreshing' as const,
        pullDistance: 56,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('pull-to-refresh-indicator')).toBeInTheDocument();
      expect(screen.getByTestId('pull-to-refresh-indicator')).toHaveTextContent('refreshing');
    });

    it('should not show pull-to-refresh indicator when idle', () => {
      mockUsePullToRefresh.mockReturnValue({
        state: 'idle' as const,
        pullDistance: 0,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.queryByTestId('pull-to-refresh-indicator')).not.toBeInTheDocument();
    });

    it('should not render pull-to-refresh indicator for disabled variants', () => {
      mockUsePullToRefresh.mockReturnValue({
        state: 'pulling' as const,
        pullDistance: 50,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />);

      expect(screen.queryByTestId('pull-to-refresh-indicator')).not.toBeInTheDocument();
    });

    it('should pass refresh function to usePullToRefresh', () => {
      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(mockUsePullToRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          onRefresh: mockRefresh,
        }),
      );
    });
  });

  describe('Profile Variant', () => {
    it('should show loading when profile context has no pubky', () => {
      render(
        <Providers.ProfileProvider>
          <TimelineFeed variant={TIMELINE_FEED_VARIANT.PROFILE} />
        </Providers.ProfileProvider>,
      );

      // When pubky is not available, streamId is undefined
      // TimelineFeed shows loading state and doesn't call useStreamPagination
      expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
      expect(mockUseStreamPagination).not.toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should show loading when streamId is undefined', () => {
      mockUseStreamIdFromFilters.mockReturnValue(undefined as unknown as Core.PostStreamTypes);

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
      // Should not call useStreamPagination when streamId is undefined
      expect(mockUseStreamPagination).not.toHaveBeenCalled();
    });

    it('should pass loading state to TimelinePosts', () => {
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        loading: true,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('loading')).toHaveTextContent('true');
    });

    it('should pass loadingMore state to TimelinePosts', () => {
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        loadingMore: true,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('loading-more')).toHaveTextContent('true');
    });

    it('should not pass loading and loadingMore state to TimelinePosts when loading is false', () => {
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        loading: false,
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('loading-more')).not.toHaveTextContent('true');
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });
  });

  describe('Error States', () => {
    it('should pass error to TimelinePosts', () => {
      mockUseStreamPagination.mockReturnValue({
        ...defaultPaginationResult,
        error: 'Network error',
      });

      render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);

      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
    });
  });

  describe('Context', () => {
    it('should provide prependPosts via context', async () => {
      const contextValues: ReturnType<typeof useTimelineFeedContext>[] = [];

      function ContextConsumer() {
        const value = useTimelineFeedContext();
        contextValues.push(value);
        return <div data-testid="consumer">Consumer</div>;
      }

      render(
        <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
          <ContextConsumer />
        </TimelineFeed>,
      );

      await waitFor(() => {
        const lastValue = contextValues[contextValues.length - 1];
        expect(lastValue).not.toBeNull();
        expect(lastValue?.prependPosts).toBe(mockPrependPosts);
      });
    });

    it('should return null when useTimelineFeedContext is used outside provider', () => {
      const contextValues: ReturnType<typeof useTimelineFeedContext>[] = [];

      function ContextConsumer() {
        const value = useTimelineFeedContext();
        contextValues.push(value);
        return <div>Consumer</div>;
      }

      render(<ContextConsumer />);

      expect(contextValues[contextValues.length - 1]).toBeNull();
    });
  });
});

describe('TimelineFeed - Snapshots', () => {
  beforeEach(() => {
    // Ensure snapshot tests are deterministic even when the non-snapshot tests in this file run too.
    // (In CI we run the full suite, not just testNamePattern="Snapshots".)
    vi.clearAllMocks();
    mockUseStreamIdFromFilters.mockReturnValue(Core.PostStreamTypes.TIMELINE_ALL_ALL);
    mockUseCustomFeed.mockReturnValue({
      id: 'test-feed',
      name: 'Test Feed',
      tags: ['all'],
      reach: PubkyAppFeedReach.All,
      sort: PubkyAppFeedSort.Recent,
      content: null,
      layout: PubkyAppFeedLayout.Columns,
      created_at: 0,
      updated_at: 0,
    });
    mockUseCustomStreamId.mockReturnValue('timeline:all:all:all' as Core.PostStreamId);
    mockUseBookmarksStreamId.mockReturnValue(Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
    mockUseStreamPagination.mockReturnValue(defaultPaginationResult);
    mockUseFeedLayoutResolution.mockReturnValue({
      requestedLayout: 'columns',
      effectiveLayout: 'columns',
      isVisualRequested: false,
      isVisualActive: false,
      isPhoneViewport: false,
    });
    // Reset pull-to-refresh mock to idle state for snapshots
    mockUsePullToRefresh.mockReturnValue({
      state: 'idle' as const,
      pullDistance: 0,
    });
  });

  it('should match snapshot for home variant', () => {
    const { container } = render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);
    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for custom variant', () => {
    const { container } = render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.CUSTOM} />);
    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for bookmarks variant', () => {
    const { container } = render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.BOOKMARKS} />);
    expect(container).toMatchSnapshot();
  });

  it('should match snapshot with children', () => {
    const { container } = render(
      <TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME}>
        <div>Child Component</div>
      </TimelineFeed>,
    );
    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for loading state', () => {
    mockUseStreamIdFromFilters.mockReturnValue(undefined as unknown as Core.PostStreamTypes);

    const { container } = render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);
    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for error state', () => {
    mockUseStreamPagination.mockReturnValue({
      ...defaultPaginationResult,
      error: 'Network error',
    });

    const { container } = render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);
    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for empty state', () => {
    mockUseStreamPagination.mockReturnValue({
      ...defaultPaginationResult,
      postIds: [],
    });

    const { container } = render(<TimelineFeed variant={TIMELINE_FEED_VARIANT.HOME} />);
    expect(container).toMatchSnapshot();
  });
});
