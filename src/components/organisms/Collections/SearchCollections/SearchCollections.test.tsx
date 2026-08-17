import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_SECTION_PAGE_SIZE, SEARCH_COLLECTIONS_PREVIEW_COUNT } from '@/config/collections';
import { useSearchStreamId } from '@/hooks/useSearchStreamId/useSearchStreamId';
import { useStreamPagination } from '@/hooks/useStreamPagination/useStreamPagination';
import type { PostStreamId } from '@/models/stream/post/postStream.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { SearchCollections } from './SearchCollections';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useSearchStreamId/useSearchStreamId', () => ({
  useSearchStreamId: vi.fn(),
}));

vi.mock('@/hooks/useStreamPagination/useStreamPagination', () => ({
  useStreamPagination: vi.fn(),
}));

const mockToast = vi.fn();
vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => ({
  CollectionCard: ({ authorPubky, postId }: { authorPubky: string; postId: string }) => (
    <div data-testid="collection-card" data-author-pubky={authorPubky} data-post-id={postId} />
  ),
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard.skeleton', () => ({
  CollectionCardSkeleton: () => <div data-testid="collection-card-skeleton" />,
}));

// ---------------------------------------------------------------------------
// Fixtures + helpers
// ---------------------------------------------------------------------------

const AUTHOR = 'o1gg96ewuojmopcjbz8895478wdtxtzzber7aezq6ror5a91j7dy';
const STREAM_ID = asOpaque<PostStreamId>('timeline:all:collection:pubky');
const OTHER_STREAM_ID = asOpaque<PostStreamId>('timeline:all:collection:bitcoin');

const mockUseSearchStreamId = vi.mocked(useSearchStreamId);
const mockUseStreamPagination = vi.mocked(useStreamPagination);

function buildCompositeIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${AUTHOR}:post${index}`);
}

const defaultPagination = {
  postIds: [] as string[],
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
};

function setup({ pagination = {} }: { pagination?: Partial<typeof defaultPagination> } = {}) {
  mockUseSearchStreamId.mockReturnValue(STREAM_ID);
  mockUseStreamPagination.mockReturnValue({ ...defaultPagination, ...pagination });
}

beforeEach(() => {
  vi.clearAllMocks();
  setup();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchCollections', () => {
  it('renders nothing when there is no search stream (no tags)', () => {
    mockUseSearchStreamId.mockReturnValue(undefined);

    const { container } = render(<SearchCollections />);

    expect(container.firstChild).toBeNull();
    expect(mockUseStreamPagination).not.toHaveBeenCalled();
  });

  it('passes the collection stream id and section page size to useStreamPagination', () => {
    setup({ pagination: { postIds: buildCompositeIds(2) } });

    render(<SearchCollections />);

    expect(mockUseStreamPagination).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: STREAM_ID, limit: COLLECTIONS_SECTION_PAGE_SIZE }),
    );
  });

  it('renders the heading and preview-count skeletons while loading with no data', () => {
    setup({ pagination: { loading: true, postIds: [] } });

    render(<SearchCollections />);

    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    expect(screen.getAllByTestId('collection-card-skeleton')).toHaveLength(SEARCH_COLLECTIONS_PREVIEW_COUNT);
    expect(screen.queryByTestId('search-collections-see-all')).not.toBeInTheDocument();
  });

  it('renders nothing when the stream settles empty and is exhausted', () => {
    setup({ pagination: { loading: false, postIds: [], hasMore: false } });

    const { container } = render(<SearchCollections />);

    expect(container.firstChild).toBeNull();
  });

  it('keeps a Show more path when a fully-filtered page settles empty with more on the server', () => {
    const loadMore = vi.fn();
    setup({ pagination: { loading: false, postIds: [], hasMore: true, loadMore } });

    render(<SearchCollections />);

    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('caps the collapsed preview at the preview count and shows the See all pill', () => {
    setup({ pagination: { postIds: buildCompositeIds(6) } });

    render(<SearchCollections />);

    expect(screen.getAllByTestId('collection-card')).toHaveLength(SEARCH_COLLECTIONS_PREVIEW_COUNT);
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });

  it('hides the See all pill when everything already fits the preview', () => {
    setup({ pagination: { postIds: buildCompositeIds(3), hasMore: false } });

    render(<SearchCollections />);

    expect(screen.getAllByTestId('collection-card')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });

  it('shows the See all pill when the preview fits but the server has more', () => {
    setup({ pagination: { postIds: buildCompositeIds(3), hasMore: true } });

    render(<SearchCollections />);

    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('expands to all fetched cards and hides the pill after See all', () => {
    setup({ pagination: { postIds: buildCompositeIds(6) } });

    render(<SearchCollections />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.getAllByTestId('collection-card')).toHaveLength(6);
    expect(screen.queryByRole('button', { name: 'See all' })).not.toBeInTheDocument();
  });

  it('shows Show more when expanded with more on the server, and forwards clicks to loadMore', () => {
    const loadMore = vi.fn();
    setup({ pagination: { postIds: buildCompositeIds(6), hasMore: true, loadMore } });

    render(<SearchCollections />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));

    const showMore = screen.getByRole('button', { name: 'Show more' });
    fireEvent.click(showMore);

    expect(loadMore).toHaveBeenCalledTimes(1);
  });

  it('disables Show more while loading more', () => {
    setup({ pagination: { postIds: buildCompositeIds(6), hasMore: true, loadingMore: true } });

    render(<SearchCollections />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.getByRole('button', { name: 'Show more' })).toBeDisabled();
  });

  it('hides Show more when expanded and the stream is exhausted', () => {
    setup({ pagination: { postIds: buildCompositeIds(6), hasMore: false } });

    render(<SearchCollections />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));

    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('fires the error toast through the onError wiring', () => {
    setup({ pagination: { postIds: buildCompositeIds(2) } });

    render(<SearchCollections />);

    const { onError } = mockUseStreamPagination.mock.calls[0][0];
    onError?.(new Error('boom'));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
  });

  it('collapses back to the preview when the stream id changes (new tags or sort)', () => {
    setup({ pagination: { postIds: buildCompositeIds(6) } });

    const { rerender } = render(<SearchCollections />);
    fireEvent.click(screen.getByRole('button', { name: 'See all' }));
    expect(screen.getAllByTestId('collection-card')).toHaveLength(6);

    mockUseSearchStreamId.mockReturnValue(OTHER_STREAM_ID);
    rerender(<SearchCollections />);

    expect(screen.getAllByTestId('collection-card')).toHaveLength(SEARCH_COLLECTIONS_PREVIEW_COUNT);
    expect(screen.getByRole('button', { name: 'See all' })).toBeInTheDocument();
  });
});

describe('SearchCollections - Snapshots', () => {
  it('matches snapshot in the collapsed preview state', () => {
    setup({ pagination: { postIds: buildCompositeIds(6) } });
    const { container } = render(<SearchCollections />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot while loading', () => {
    setup({ pagination: { loading: true, postIds: [] } });
    const { container } = render(<SearchCollections />);
    expect(container).toMatchSnapshot();
  });
});
