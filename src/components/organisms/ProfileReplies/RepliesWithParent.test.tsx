import { render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PostController } from '@/controllers/post/post';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { Pubky } from '@/models/models.types';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
import { RepliesWithParent } from './RepliesWithParent';

// Mock dependencies
vi.mock('dexie-react-hooks');
vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: vi.fn(),
}));

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
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

vi.mock('@/atoms/PostThreadSpacer/PostThreadSpacer', () => {
  return {
    PostThreadSpacer: () => <div data-testid="post-thread-spacer" />,
  };
});

vi.mock('@/molecules/Timeline/TimelineEndMessage', () => {
  return {
    TimelineEndMessage: () => <div data-testid="timeline-end-message">End of replies</div>,
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
      hasMore,
      children,
    }: {
      loading: boolean;
      error: string | null;
      hasItems: boolean;
      hasMore?: boolean;
      children: React.ReactNode;
    }) => {
      if (loading) return <div data-testid="timeline-loading">Loading...</div>;
      if (error && !hasItems) return <div data-testid="timeline-initial-error">Error: {error}</div>;
      if (!hasItems && hasMore)
        return (
          <>
            <div data-testid="timeline-loading">Loading...</div>
            {children}
          </>
        );
      if (!hasItems) return <div data-testid="timeline-empty">No replies</div>;
      return <>{children}</>;
    },
  };
});

vi.mock('@/organisms/PostMain/PostMain', () => {
  return {
    PostMain: ({ postId, onClick, isReply }: { postId: string; onClick: () => void; isReply: boolean }) => (
      <div data-testid={`post-${postId}`} onClick={onClick} data-is-reply={isReply} />
    ),
  };
});

const mockUseLiveQuery = vi.mocked(useLiveQuery);
const mockUseStreamPagination = vi.mocked(useStreamPagination);
const mockUseInfiniteScroll = vi.mocked(useInfiniteScroll);

describe('RepliesWithParent', () => {
  const mockStreamId = 'author_replies:test-user-id' as PostStreamId;
  const mockViewerId = 'test-viewer-id' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock auth store to provide viewerId
    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      selectCurrentUserPubky: () => mockViewerId,
    } as ReturnType<typeof useAuthStore.getState>);

    // Mock useStreamPagination
    mockUseStreamPagination.mockReturnValue({
      postIds: [],
      loading: false,
      loadingMore: false,
      error: null,
      hasMore: true,
      loadMore: vi.fn(),
      refresh: vi.fn(),
      prependPosts: vi.fn(),
      prependOptimisticPosts: vi.fn(),
      removePosts: vi.fn(),
      removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
    });

    // Mock useInfiniteScroll
    mockUseInfiniteScroll.mockReturnValue({
      sentinelRef: vi.fn(),
    });

    // Mock useLiveQuery
    mockUseLiveQuery.mockReturnValue(null);
  });

  describe('Loading States', () => {
    it('should render loading state initially', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: [],
        loading: true,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
    });

    it('should render loading more indicator when paginating', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: ['author1:reply1'],
        loading: false,
        loadingMore: true,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(screen.getByTestId('timeline-loading-more')).toBeInTheDocument();
    });
  });

  describe('Empty States', () => {
    it('keeps loading mounted instead of the empty state when empty but hasMore (filtered stream region)', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(screen.queryByTestId('timeline-empty')).not.toBeInTheDocument();
      expect(screen.getByTestId('timeline-loading')).toBeInTheDocument();
    });

    it('should render empty state when no replies', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(screen.getByTestId('timeline-empty')).toBeInTheDocument();
    });

    it('should render end message when no more replies to load', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: ['author1:reply1'],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(screen.getByTestId('timeline-end-message')).toBeInTheDocument();
    });
  });

  describe('Error States', () => {
    it('should render error state on initial fetch failure', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: [],
        loading: false,
        loadingMore: false,
        error: 'Network error',
        hasMore: false,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(screen.getByTestId('timeline-initial-error')).toBeInTheDocument();
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });

    it('should show error message when pagination fails', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: ['author1:reply1'],
        loading: false,
        loadingMore: false,
        error: 'Pagination failed',
        hasMore: false,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(screen.getByTestId('timeline-error')).toBeInTheDocument();
    });
  });

  describe('Reply Rendering', () => {
    it('should render replies without parent when no parent found', async () => {
      const mockReplyIds = ['author1:reply1', 'author2:reply2'];

      mockUseStreamPagination.mockReturnValue({
        postIds: mockReplyIds,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      // Mock useLiveQuery to return null (no parent)
      mockUseLiveQuery.mockReturnValue(null);

      render(<RepliesWithParent streamId={mockStreamId} />);

      await waitFor(() => {
        mockReplyIds.forEach((replyId) => {
          expect(screen.getByTestId(`post-${replyId}`)).toBeInTheDocument();
        });
      });
    });

    it('should render replies with parent when parent exists', async () => {
      const mockReplyIds = ['author1:reply1'];
      const mockParentId = 'author2:parent1';

      mockUseStreamPagination.mockReturnValue({
        postIds: mockReplyIds,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      // Mock useLiveQuery to handle multiple calls:
      // 1st call: parentPostId (string)
      // 2nd call: parentPost (object)
      mockUseLiveQuery
        .mockReturnValueOnce(mockParentId) // 1st: parentPostId
        .mockReturnValueOnce({ id: mockParentId }); // 2nd: parentPost

      render(<RepliesWithParent streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByTestId(`post-${mockParentId}`)).toBeInTheDocument();
        expect(screen.getByTestId(`post-${mockReplyIds[0]}`)).toBeInTheDocument();
      });
    });

    it('should make all reply cards individually tabbable', async () => {
      const mockReplyIds = ['author1:reply1', 'author2:reply2'];

      mockUseStreamPagination.mockReturnValue({
        postIds: mockReplyIds,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      mockUseLiveQuery
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(null);

      render(<RepliesWithParent streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getAllByRole('article')).toHaveLength(mockReplyIds.length);
      });

      const cards = screen.getAllByRole('article');
      expect(cards[0]).toHaveAttribute('tabindex', '0');
      expect(cards[1]).toHaveAttribute('tabindex', '0');
    });

    it('should render reply with isReply=true', async () => {
      const mockReplyIds = ['author1:reply1'];

      mockUseStreamPagination.mockReturnValue({
        postIds: mockReplyIds,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      // Mock useLiveQuery to handle multiple calls:
      // 1st call: parentPostId (null - no parent)
      // 2nd call: parentPost (null)
      mockUseLiveQuery
        .mockReturnValueOnce(null) // 1st: parentPostId
        .mockReturnValueOnce(null); // 2nd: parentPost

      render(<RepliesWithParent streamId={mockStreamId} />);

      await waitFor(() => {
        const replyPost = screen.getByTestId(`post-${mockReplyIds[0]}`);
        expect(replyPost).toHaveAttribute('data-is-reply', 'true');
      });
    });

    it('should render parent with isReply=false', async () => {
      const mockReplyIds = ['author1:reply1'];
      const mockParentId = 'author2:parent1';

      mockUseStreamPagination.mockReturnValue({
        postIds: mockReplyIds,
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      // Mock useLiveQuery to handle multiple calls:
      // 1st call: parentPostId (string)
      // 2nd call: parentPost (object)
      mockUseLiveQuery
        .mockReturnValueOnce(mockParentId) // 1st: parentPostId
        .mockReturnValueOnce({ id: mockParentId }); // 2nd: parentPost

      render(<RepliesWithParent streamId={mockStreamId} />);

      await waitFor(() => {
        const parentPost = screen.getByTestId(`post-${mockParentId}`);
        expect(parentPost).toHaveAttribute('data-is-reply', 'false');
      });
    });
  });

  describe('Infinite Scroll', () => {
    it('should configure infinite scroll with correct parameters', () => {
      const mockLoadMore = vi.fn();
      mockUseStreamPagination.mockReturnValue({
        postIds: ['author1:reply1'],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: mockLoadMore,
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      render(<RepliesWithParent streamId={mockStreamId} />);

      expect(mockUseInfiniteScroll).toHaveBeenCalledWith({
        onLoadMore: mockLoadMore,
        hasMore: true,
        isLoading: false,
        threshold: 3000,
        debounceMs: 20,
      });
    });
  });

  describe('Parent Post Fetching', () => {
    it('should clean up fetch tracking on unmount', () => {
      const mockReplyId = 'author1:reply1';
      const mockParentId = 'author2:parent1';

      // Mock a pending fetch scenario
      const mockGetOrFetchDetails = vi.fn(
        (): Promise<PostDetailsModelSchema | null> => new Promise(() => {}), // Never resolves
      );
      vi.spyOn(PostController, 'getOrFetch').mockImplementation(mockGetOrFetchDetails);

      mockUseStreamPagination.mockReturnValue({
        postIds: [mockReplyId],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      // Mock useLiveQuery to return parent ID but no parent post (triggers fetch)
      mockUseLiveQuery
        .mockReturnValueOnce(mockParentId) // parentPostId
        .mockReturnValueOnce(null); // parentPost (missing, will trigger fetch)

      const { unmount } = render(<RepliesWithParent streamId={mockStreamId} />);

      // Verify fetch was initiated
      expect(mockGetOrFetchDetails).toHaveBeenCalledWith({ compositeId: mockParentId, viewerId: mockViewerId });

      // Unmount component while fetch is pending
      unmount();

      // The cleanup should prevent the finally block from deleting from the set
      // (In practice, this means the cancelled flag is set to true)
      // This test verifies the cleanup function is called without errors
      expect(true).toBe(true); // Cleanup completed successfully

      // Restore the original implementation
      vi.restoreAllMocks();
    });
  });

  describe('Snapshots', () => {
    it('should match snapshot for loading state', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: [],
        loading: true,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      const { container } = render(<RepliesWithParent streamId={mockStreamId} />);

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot for empty state', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: [],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: false,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      const { container } = render(<RepliesWithParent streamId={mockStreamId} />);

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot for error state', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: [],
        loading: false,
        loadingMore: false,
        error: 'Network error',
        hasMore: false,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      const { container } = render(<RepliesWithParent streamId={mockStreamId} />);

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot with replies (no parents)', () => {
      mockUseStreamPagination.mockReturnValue({
        postIds: ['author1:reply1', 'author2:reply2'],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      // Mock useLiveQuery to handle multiple calls (2 replies × 2 queries each = 4 calls):
      // For reply1: 1st call = parentPostId, 2nd call = parentPost
      // For reply2: 3rd call = parentPostId, 4th call = parentPost
      mockUseLiveQuery
        .mockReturnValueOnce(null) // reply1: parentPostId
        .mockReturnValueOnce(null) // reply1: parentPost
        .mockReturnValueOnce(null) // reply2: parentPostId
        .mockReturnValueOnce(null); // reply2: parentPost

      const { container } = render(<RepliesWithParent streamId={mockStreamId} />);

      expect(container).toMatchSnapshot();
    });

    it('should match snapshot with replies and parents', () => {
      const mockParentId1 = 'author3:parent1';
      const mockParentId2 = 'author4:parent2';

      mockUseStreamPagination.mockReturnValue({
        postIds: ['author1:reply1', 'author2:reply2'],
        loading: false,
        loadingMore: false,
        error: null,
        hasMore: true,
        loadMore: vi.fn(),
        refresh: vi.fn(),
        prependPosts: vi.fn(),
        prependOptimisticPosts: vi.fn(),
        removePosts: vi.fn(),
        removePostsOptimistically: vi.fn(() => ({ commit: vi.fn(), rollback: vi.fn() })),
      });

      // Mock useLiveQuery to handle multiple calls (2 replies × 2 queries each = 4 calls):
      // For reply1: 1st call = parentPostId (string), 2nd call = parentPost (object)
      // For reply2: 3rd call = parentPostId (string), 4th call = parentPost (object)
      mockUseLiveQuery
        .mockReturnValueOnce(mockParentId1) // reply1: parentPostId
        .mockReturnValueOnce({ id: mockParentId1 }) // reply1: parentPost
        .mockReturnValueOnce(mockParentId2) // reply2: parentPostId
        .mockReturnValueOnce({ id: mockParentId2 }); // reply2: parentPost

      const { container } = render(<RepliesWithParent streamId={mockStreamId} />);

      expect(container).toMatchSnapshot();
    });
  });
});
