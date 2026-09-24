import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRID_FEED_SKELETON_COUNT } from '@/config/feed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { asOpaque } from '@/test-utils/type-assertions';
import { TimelineCardsPosts } from './CardsPosts';

vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({ usePostDetails: vi.fn() }));
vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => ({
  CollectionCard: ({ authorPubky, postId }: { authorPubky: string; postId: string }) => (
    <div data-testid="standalone-collection">
      {authorPubky}:{postId}
    </div>
  ),
}));
vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({ useInfiniteScroll: vi.fn() }));
vi.mock('@/hooks/usePostHeaderVisibility/usePostHeaderVisibility', () => ({
  usePostHeaderVisibility: () => ({ showRepostHeader: false, shouldShowPostHeader: true, originalPostId: null }),
}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/usePostNavigation/usePostNavigation', () => ({
  usePostNavigation: () => ({ handlePostKeyDown: navigate }),
}));
// Post behavior is covered in PostMain and the browser tests; this boundary verifies renderer dispatch.
vi.mock('@/organisms/PostMain/PostMain', () => ({
  PostMain: ({ postId, presentation }: { postId: string; presentation: string }) => (
    <div data-presentation={presentation}>{postId}</div>
  ),
}));

const props = {
  postIds: ['a:1', 'b:2', 'c:3'],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(),
  showEndMessage: false,
};
const resume = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usePostDetails).mockReturnValue({ postDetails: null, isLoading: false });
  vi.mocked(useInfiniteScroll).mockReturnValue({ sentinelRef: vi.fn(), isStalled: false, resumeAutoLoad: resume });
});

describe('TimelineCardsPosts', () => {
  it('keeps accessible cards and keyboard navigation in source order', () => {
    render(<TimelineCardsPosts {...props} />);
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => card.textContent)).toEqual(props.postIds);
    expect(cards[1]).toHaveAttribute('aria-posinset', '2');
    expect(cards[1]).toHaveAttribute('aria-setsize', '3');
    expect(cards[1].firstChild).toHaveAttribute('data-presentation', 'cards');
    cards[0].focus();
    fireEvent.keyDown(cards[0], { key: 'ArrowDown' });
    expect(cards[1]).toHaveFocus();
    fireEvent.keyDown(cards[1], { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('b:2', expect.anything());
  });

  it('renders collection posts as standalone cards without post chrome', () => {
    vi.mocked(usePostDetails).mockReturnValue({ postDetails: asOpaque({ kind: 'collection' }), isLoading: false });
    render(<TimelineCardsPosts {...props} postIds={['a:1']} />);
    expect(screen.getByTestId('standalone-collection')).toHaveTextContent('a:1');
    expect(screen.getByRole('article').querySelector('[data-presentation]')).toBeNull();
  });

  it('retains PostMain unavailable actions if a collection entry becomes a tombstone', () => {
    vi.mocked(usePostDetails).mockReturnValue({
      postDetails: asOpaque({ kind: 'collection', content: '[DELETED]' }),
      isLoading: false,
    });
    render(<TimelineCardsPosts {...props} postIds={['a:1']} />);
    expect(screen.queryByTestId('standalone-collection')).not.toBeInTheDocument();
    expect(screen.getByRole('article').firstChild).toHaveAttribute('data-presentation', 'cards');
  });

  it('mounts the measured feed after initial loading resolves', () => {
    const { container, rerender } = render(<TimelineCardsPosts {...props} postIds={[]} loading />);
    const skeleton = container.querySelector('[data-cy="cards-skeleton"]');
    expect(skeleton?.children).toHaveLength(GRID_FEED_SKELETON_COUNT);
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
    rerender(<TimelineCardsPosts {...props} />);
    expect(screen.getByRole('feed')).toBeInTheDocument();
    expect(container.querySelector('[data-cy="cards-skeleton"]')).not.toBeInTheDocument();
  });

  it('keeps empty copy and the Add Post tile available on an empty owner feed', () => {
    render(
      <TimelineCardsPosts
        {...props}
        postIds={[]}
        emptyState={<p>No saved posts</p>}
        trailingSlot={<button>Add Post</button>}
      />,
    );
    expect(screen.getByText('No saved posts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Post' })).toBeInTheDocument();
  });

  it('places loading and stalled-pagination controls outside the measured feed', () => {
    vi.mocked(useInfiniteScroll).mockReturnValue({ sentinelRef: vi.fn(), isStalled: true, resumeAutoLoad: resume });
    render(<TimelineCardsPosts {...props} hasMore error="Could not load more posts" />);
    const load = screen.getByRole('button', { name: 'Load more' });
    expect(screen.getByRole('feed')).not.toContainElement(load);
    fireEvent.click(load);
    expect(resume).toHaveBeenCalledOnce();
    expect(screen.getByText(/Could not load more posts/)).toBeInTheDocument();
  });
});
