import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBookmarksStreamId } from '@/hooks/useBookmarksStreamId/useBookmarksStreamId';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostListKeyboard } from '@/hooks/usePostListKeyboard/usePostListKeyboard';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { CONTENT } from '@/stores/home/home.types';
import { BookmarksCollectionPosts } from './BookmarksCollectionPosts';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/hooks/useBookmarksStreamId/useBookmarksStreamId', () => ({
  useBookmarksStreamId: vi.fn(),
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: vi.fn(),
}));

vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: vi.fn(),
}));

vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: vi.fn(() => ({
    handlePostKeyDown: vi.fn(),
  })),
}));

vi.mock('@/hooks/usePostListKeyboard/usePostListKeyboard', () => ({
  usePostListKeyboard: vi.fn(),
}));

vi.mock('@/organisms/PostMain/PostMain', () => ({
  PostMain: ({ postId }: { postId: string }) => <div data-testid={`post-main-${postId}`}>{postId}</div>,
}));

const mockLoadMore = vi.fn();
const mockPrependPosts = vi.fn();
const mockRemovePosts = vi.fn();

const defaultPaginationResult = {
  postIds: ['author1:post1', 'author2:post2'],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: true,
  loadMore: mockLoadMore,
  refresh: vi.fn(),
  prependPosts: mockPrependPosts,
  removePosts: mockRemovePosts,
};

describe('BookmarksCollectionPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBookmarksStreamId).mockReturnValue(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
    vi.mocked(useStreamPagination).mockReturnValue(defaultPaginationResult);
    vi.mocked(useInfiniteScroll).mockReturnValue({ sentinelRef: vi.fn() });
    vi.mocked(usePostListKeyboard).mockReturnValue({
      setCardRef: vi.fn(() => vi.fn()),
      onListKeyDown: vi.fn(),
    });
  });

  it('loads the all-content bookmarks stream', () => {
    render(<BookmarksCollectionPosts emptyComponent={<div>No bookmarks</div>} />);

    expect(useBookmarksStreamId).toHaveBeenCalledWith(CONTENT.ALL);
    expect(useStreamPagination).toHaveBeenCalledWith({
      streamId: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
    });
  });

  it('renders bookmarked posts in a three-column grid without reply threads', () => {
    render(<BookmarksCollectionPosts emptyComponent={<div>No bookmarks</div>} />);

    const feed = screen.getByRole('feed');
    expect(feed).toHaveClass('grid', 'lg:grid-cols-3');
    expect(screen.getAllByRole('article')).toHaveLength(2);
    expect(screen.getByTestId('post-main-author1:post1')).toBeInTheDocument();
    expect(screen.queryByTestId('post-replies-author1:post1')).not.toBeInTheDocument();
  });

  it('renders the provided empty state when the bookmarks stream is empty', () => {
    vi.mocked(useStreamPagination).mockReturnValue({
      ...defaultPaginationResult,
      postIds: [],
      hasMore: false,
    });

    render(<BookmarksCollectionPosts emptyComponent={<div data-testid="bookmarks-empty">No bookmarks</div>} />);

    expect(screen.getByTestId('bookmarks-empty')).toBeInTheDocument();
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
  });

  it('does not render the timeline end message', () => {
    render(<BookmarksCollectionPosts emptyComponent={<div>No bookmarks</div>} />);

    expect(screen.queryByText(/you've reached the end/i)).not.toBeInTheDocument();
  });
});

describe('BookmarksCollectionPosts - Snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBookmarksStreamId).mockReturnValue(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
    vi.mocked(useStreamPagination).mockReturnValue(defaultPaginationResult);
    vi.mocked(useInfiniteScroll).mockReturnValue({ sentinelRef: vi.fn() });
    vi.mocked(usePostListKeyboard).mockReturnValue({
      setCardRef: vi.fn(() => vi.fn()),
      onListKeyDown: vi.fn(),
    });
  });

  it('matches snapshot with bookmarked posts', () => {
    const { container } = render(<BookmarksCollectionPosts emptyComponent={<div>No bookmarks</div>} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
