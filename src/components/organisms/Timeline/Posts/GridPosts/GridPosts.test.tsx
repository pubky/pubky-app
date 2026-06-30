import { useRouter } from 'next/navigation';
import { render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { TimelineGridPosts } from './GridPosts';
import { GridPostsSkeleton } from './GridPosts.skeleton';

// Mock dependencies
vi.mock('next/navigation');
vi.mock('dexie-react-hooks');

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

// Mock components
vi.mock('@/atoms/Container/Container', () => {
  return {
    Container: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div data-testid="container" {...props}>
        {children}
      </div>
    ),
  };
});

vi.mock('@/molecules/Timeline/TimelineEndMessage', () => {
  return {
    TimelineEndMessage: () => <div data-testid="timeline-end-message">End of timeline</div>,
  };
});

vi.mock('@/molecules/Timeline/TimelineError', () => {
  return {
    TimelineError: ({ message }: { message: string }) => <div data-testid="timeline-error">Error: {message}</div>,
  };
});

vi.mock('@/molecules/Timeline/TimelineLoading', () => {
  return {
    TimelineLoading: () => <div data-testid="timeline-loading">Loading...</div>,
  };
});

vi.mock('@/molecules/Timeline/TimelineLoadingMore', () => {
  return {
    TimelineLoadingMore: () => <div data-testid="timeline-loading-more">Loading more...</div>,
  };
});

vi.mock('@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/molecules/Timeline/TimelineStateWrapper/TimelineStateWrapper')>();
  return {
    ...actual,
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
  };
});

vi.mock('@/organisms/PostMain/PostMain', () => {
  return {
    PostMain: ({ postId, onClick, ...props }: { postId: string; onClick: () => void; [key: string]: unknown }) => (
      <div data-testid={`post-${postId}`} onClick={onClick} {...props} />
    ),
  };
});

vi.mock('@/organisms/PostCardSkeleton/PostCardSkeleton', () => {
  return {
    PostCardSkeleton: () => <div data-testid="post-card-skeleton" />,
  };
});

const mockPush = vi.fn();
const mockUseLiveQuery = vi.mocked(useLiveQuery);
const mockUseRouter = vi.mocked(useRouter);
const mockUseInfiniteScroll = vi.mocked(useInfiniteScroll);

const mockPostIds = ['author1:post1', 'author2:post2', 'author3:post3'];

describe('TimelineGridPosts', () => {
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
        <TimelineGridPosts
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

    it('should show loading more indicator when loadingMore is true', async () => {
      render(
        <TimelineGridPosts
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
        <TimelineGridPosts
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

    it('should render the trailing slot when the feed is empty', async () => {
      render(
        <TimelineGridPosts
          postIds={[]}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          trailingSlot={<div data-testid="grid-trailing-slot">Add content</div>}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('grid-trailing-slot')).toBeInTheDocument();
        expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
      });
    });

    it('should render the empty state above the trailing slot when there are no posts', async () => {
      render(
        <TimelineGridPosts
          postIds={[]}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          emptyState={<div data-testid="custom-empty">Collection is empty</div>}
          trailingSlot={<div data-testid="grid-trailing-slot">Add content</div>}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
        expect(screen.getByTestId('grid-trailing-slot')).toBeInTheDocument();
        expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
      });
    });

    it('should render end message when no more posts to load', async () => {
      render(
        <TimelineGridPosts
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
        expect(screen.queryByTestId('timeline-loading')).not.toBeInTheDocument();
        expect(screen.queryByTestId('timeline-loading-more')).not.toBeInTheDocument();
      });
    });

    it('should not render end message when showEndMessage is false', async () => {
      render(
        <TimelineGridPosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
          showEndMessage={false}
        />,
      );

      await waitFor(() => {
        mockPostIds.forEach((postId) => {
          expect(screen.getByTestId(`post-${postId}`)).toBeInTheDocument();
        });
      });

      expect(screen.queryByTestId('timeline-end-message')).not.toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('should render error state on initial fetch failure', async () => {
      render(
        <TimelineGridPosts
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
        <TimelineGridPosts
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
  });

  describe('Post Rendering', () => {
    it('should render all fetched posts', async () => {
      render(
        <TimelineGridPosts
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

      const postContainers = screen.getAllByTestId(/^post-/);
      expect(postContainers).toHaveLength(mockPostIds.length);
    });

    it('should render the trailing slot as the last grid cell', async () => {
      render(
        <TimelineGridPosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
          trailingSlot={<div data-testid="grid-trailing-slot">Add content</div>}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('grid-trailing-slot')).toBeInTheDocument();
      });

      const postContainers = screen.getAllByTestId(/^post-/);
      expect(postContainers).toHaveLength(mockPostIds.length);
    });

    it('should make all post cards individually tabbable', async () => {
      render(
        <TimelineGridPosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getAllByRole('article')).toHaveLength(mockPostIds.length);
      });

      const cards = screen.getAllByRole('article');
      cards.forEach((card) => {
        expect(card).toHaveAttribute('tabindex', '0');
      });
    });

    it('should render the grid wrapper', async () => {
      const { container } = render(
        <TimelineGridPosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={true}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        const grid = container.querySelector('[data-cy="timeline-posts-grid"]');
        expect(grid).toBeInTheDocument();
        expect(grid).toHaveAttribute('role', 'feed');
      });
    });
  });

  describe('Infinite scroll configuration', () => {
    it('should configure infinite scroll with correct parameters', async () => {
      render(
        <TimelineGridPosts
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

    it('should call loadMore when infinite scroll triggers', async () => {
      const mockLoadMore = vi.fn();
      render(
        <TimelineGridPosts
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

    it('should render sentinel element for infinite scroll', async () => {
      mockUseInfiniteScroll.mockReturnValue({
        sentinelRef: vi.fn(),
      });

      const { container } = render(
        <TimelineGridPosts
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

    it('should not render the sentinel once there are no more posts to load', async () => {
      const { container } = render(
        <TimelineGridPosts
          postIds={mockPostIds}
          loading={false}
          loadingMore={false}
          error={null}
          hasMore={false}
          loadMore={vi.fn()}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('post-author1:post1')).toBeInTheDocument();
      });

      expect(container.querySelector('.h-5')).not.toBeInTheDocument();
    });
  });
});

describe('GridPostsSkeleton', () => {
  it('should render 6 post card skeletons', () => {
    render(<GridPostsSkeleton />);

    expect(screen.getAllByTestId('post-card-skeleton')).toHaveLength(6);
  });
});

describe('TimelineGridPosts - Snapshots', () => {
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
      <TimelineGridPosts
        postIds={[]}
        loading={true}
        loadingMore={false}
        error={null}
        hasMore={true}
        loadMore={vi.fn()}
      />,
    );

    expect(container).toMatchSnapshot();
  });

  it('should match snapshot for empty state', async () => {
    const { container } = render(
      <TimelineGridPosts
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

  it('should match snapshot with posts', async () => {
    const { container } = render(
      <TimelineGridPosts
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
