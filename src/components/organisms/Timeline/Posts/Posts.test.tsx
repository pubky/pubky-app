import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { TimelinePosts } from './Posts';
import * as Hooks from '@/hooks';

// Mock dependencies
vi.mock('next/navigation');
vi.mock('dexie-react-hooks');
vi.mock('@/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks')>();
  return {
    ...actual,
    usePostNavigation: vi.fn(),
    useInfiniteScroll: vi.fn(),
  };
});
vi.mock('@/libs', async () => {
  const actual = await vi.importActual('@/libs');
  return {
    ...actual,
    Logger: {
      error: vi.fn(),
    },
  };
});

// Mock components
vi.mock('@/atoms', () => ({
  Container: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
    <div data-testid="container" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('@/molecules', () => ({
  TimelineLoading: () => <div data-testid="timeline-loading">Loading...</div>,
  TimelineLoadingMore: () => <div data-testid="timeline-loading-more">Loading more...</div>,
  TimelineError: ({ message }: { message: string }) => <div data-testid="timeline-error">Error: {message}</div>,
  TimelineEndMessage: () => <div data-testid="timeline-end-message">End of timeline</div>,
  TimelineStateWrapper: ({
    loading,
    error,
    hasItems,
    children,
  }: {
    loading: boolean;
    error: string | null;
    hasItems: boolean;
    children: React.ReactNode;
  }) => {
    if (loading) return <div data-testid="timeline-loading">Loading...</div>;
    if (error && !hasItems) return <div data-testid="timeline-initial-error">Error: {error}</div>;
    if (!hasItems) return <div data-testid="timeline-empty">No posts</div>;
    return <>{children}</>;
  },
}));

vi.mock('@/organisms', () => ({
  PostMain: ({ postId, onClick, ...props }: { postId: string; onClick: () => void; [key: string]: unknown }) => (
    <div data-testid={`post-${postId}`} onClick={onClick} {...props} />
  ),
  TimelinePostReplies: ({ postId }: { postId: string }) => <div data-testid={`replies-${postId}`} />,
}));

const mockPush = vi.fn();
const mockUseLiveQuery = vi.mocked(useLiveQuery);
const mockUseRouter = vi.mocked(useRouter);
const mockUsePostNavigation = vi.mocked(Hooks.usePostNavigation);
const mockUseInfiniteScroll = vi.mocked(Hooks.useInfiniteScroll);

const mockPostIds = ['author1:post1', 'author2:post2', 'author3:post3'];
describe('TimelinePosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock router
    mockUseRouter.mockReturnValue({
      push: mockPush,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    } as ReturnType<typeof useRouter>);

    // Mock usePostNavigation
    mockUsePostNavigation.mockReturnValue({
      navigateToPost: mockPush,
    });

    mockUseInfiniteScroll.mockReturnValue({
      sentinelRef: vi.fn(),
    });

    // Mock useLiveQuery to return no replies by default
    mockUseLiveQuery.mockReturnValue({ id: 'test', replies: 0, tags: 0, unique_tags: 0, reposts: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading States', () => {
    it('should render loading state initially', async () => {
      render(
        <TimelinePosts
          postIds={[]}
          loading={true}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
    });

    it('should render posts after successful fetch', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading-more')).not.toBeInTheDocument();
      });
    });

    it('should show loading more indicator when paginating', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={true}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-loading-more')).toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('should render empty state when no posts are returned', async () => {
      render(
        <TimelinePosts
          postIds={[]}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading-more')).not.toBeInTheDocument();
      });
    });

    it('should render end message when no more posts to load', async () => {
      const fewPosts = ['author1:post1', 'author2:post2']; // Less than NEXUS_POSTS_PER_PAGE

      render(
        <TimelinePosts
          postIds={fewPosts}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-end-message')).toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading-more')).not.toBeInTheDocument();
      });
    });
  });

  describe('Error States', () => {
    it('should render error state on initial fetch failure', async () => {
      render(
        <TimelinePosts
          postIds={[]}
          loading={false}
          loadingMore={false}
          error="Network error"
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-initial-error')).toBeInTheDocument();
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading-more')).not.toBeInTheDocument();
      });
    });

    it('should show error message when pagination fails', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error="Pagination failed"
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-error')).toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading-more')).not.toBeInTheDocument();
      });
    });

    it('should stop loading more posts after pagination error', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error="Pagination failed"
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-error')).toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading-more')).not.toBeInTheDocument();
      });
    });
  });

  describe('Post Rendering', () => {
    it('should render all fetched posts', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        mockPostIds.forEach((postId) => {
          expect(screen.getByTestId(`post-${postId}`)).toBeInTheDocument();
        });
      });
    });

    it('should render PostWithReplies for each post', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const postContainers = screen.getAllByTestId(/^post-/);
        expect(postContainers).toHaveLength(mockPostIds.length);
      });
    });

    it('should render posts with correct keys', async () => {
      const { container } = render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const posts = container.querySelectorAll('[data-testid^="post-"]');
        expect(posts).toHaveLength(mockPostIds.length);
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to post detail when post is clicked', async () => {
      render(
        <TimelinePosts
          postIds={['author1:post123']}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const post = screen.getByTestId('post-author1:post123');
        post.click();
      });

      expect(mockPush).toHaveBeenCalledWith('author1:post123');
    });

    it('should navigate with correct URL format for different posts', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const post1 = screen.getByTestId('post-author1:post1');
        post1.click();
      });

      expect(mockPush).toHaveBeenCalledWith('author1:post1');
    });
  });

  describe('Pagination', () => {
    it('should call loadMore when infinite scroll triggers', async () => {
      const mockLoadMore = vi.fn();
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={mockLoadMore}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('post-author1:post1')).toBeInTheDocument();
      });

      const { onLoadMore } = mockUseInfiniteScroll.mock.calls[0][0];
      await onLoadMore();

      expect(mockLoadMore).toHaveBeenCalled();
    });

    it('should show end message when hasMore is false', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-end-message')).toBeInTheDocument();
      });
    });

    it('should show loading more indicator when loadingMore is true', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={true}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('timeline-loading-more')).toBeInTheDocument();
      });
    });
  });

  describe('Stream Changes', () => {
    it('should render posts with provided props', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('post-author1:post1')).toBeInTheDocument();
      });
    });

    it('should handle large number of posts in list', async () => {
      const largePostCount = 2100;
      const largePostIds = Array.from({ length: largePostCount }, (_, i) => `author${i + 1}:post${i + 1}`);
      render(
        <TimelinePosts
          postIds={largePostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const postContainers = screen.getAllByTestId(/^post-/);
        expect(postContainers).toHaveLength(largePostCount);
        expect(screen.getByTestId('post-author1:post1')).toBeInTheDocument();
        expect(screen.getByTestId(`post-author${largePostCount}:post${largePostCount}`)).toBeInTheDocument();
      });
    });
  });

  describe('Infinite scroll configuration', () => {
    it('should configure infinite scroll with correct parameters', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
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
          hasMore: expect.any(Boolean),
          isLoading: expect.any(Boolean),
          threshold: 3000,
          debounceMs: 20,
        });
      });
    });

    it('should render sentinel element for infinite scroll', async () => {
      mockUseInfiniteScroll.mockReturnValue({
        sentinelRef: vi.fn(),
      });

      const { container } = render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const sentinel = container.querySelector('.h-5');
        expect(sentinel).toBeInTheDocument();
      });
    });

    it('should pass hasMore to infinite scroll hook', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const { hasMore } = mockUseInfiniteScroll.mock.calls[0][0];
        expect(hasMore).toBe(false);
      });
    });

    it('should pass loadingMore to infinite scroll hook', async () => {
      render(
        <TimelinePosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={true}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const { isLoading } = mockUseInfiniteScroll.mock.calls[0][0];
        expect(isLoading).toBe(true);
      });
    });
  });
});

describe('TimelinePosts - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock router
    mockUseRouter.mockReturnValue({
      push: mockPush,
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
    } as ReturnType<typeof useRouter>);

    // Mock usePostNavigation
    mockUsePostNavigation.mockReturnValue({
      navigateToPost: mockPush,
    });

    mockUseInfiniteScroll.mockReturnValue({
      sentinelRef: vi.fn(),
    });

    // Mock useLiveQuery
    mockUseLiveQuery.mockReturnValue({ id: 'test', replies: 0, tags: 0, unique_tags: 0, reposts: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should match snapshot for loading state', () => {
    const { container } = render(
      <TimelinePosts postIds={[]} loading={true} loadingMore={false} error={null} hasMore={true} loadMore={vi.fn()} />,
    );

    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for empty state', async () => {
    const { container } = render(
      <TimelinePosts
        postIds={[]}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('timeline-empty')).toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for error state', async () => {
    const { container } = render(
      <TimelinePosts
        postIds={[]}
        loading={false}
        loadingMore={false}
        error="Network error"
        hasMore={false}
        loadMore={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('timeline-initial-error')).toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });

  it('should match snapshot with posts', async () => {
    const { container } = render(
      <TimelinePosts
        postIds={mockPostIds}
        loading={false}
        loadingMore={false}
        error={null}
        hasMore={true}
        loadMore={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
    });

    expect(container).toMatchSnapshot();
  });
});
