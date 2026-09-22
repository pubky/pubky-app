import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRID_FEED_SKELETON_COUNT } from '@/config/feed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { TimelineMasonryPosts } from './MasonryPosts';

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
  vi.mocked(useInfiniteScroll).mockReturnValue({ sentinelRef: vi.fn(), isStalled: false, resumeAutoLoad: resume });
});

describe('TimelineMasonryPosts', () => {
  it('keeps accessible cards and keyboard navigation in source order', () => {
    render(<TimelineMasonryPosts {...props} />);
    const cards = screen.getAllByRole('article');
    expect(cards.map((card) => card.textContent)).toEqual(props.postIds);
    expect(cards[1]).toHaveAttribute('aria-posinset', '2');
    expect(cards[1]).toHaveAttribute('aria-setsize', '3');
    expect(cards[1].firstChild).toHaveAttribute('data-presentation', 'masonry');
    cards[0].focus();
    fireEvent.keyDown(cards[0], { key: 'ArrowDown' });
    expect(cards[1]).toHaveFocus();
    fireEvent.keyDown(cards[1], { key: 'Enter' });
    expect(navigate).toHaveBeenCalledWith('b:2', expect.anything());
  });

  it('mounts the measured feed after initial loading resolves', () => {
    const { container, rerender } = render(<TimelineMasonryPosts {...props} postIds={[]} loading />);
    const skeleton = container.querySelector('[data-cy="masonry-skeleton"]');
    expect(skeleton?.children).toHaveLength(GRID_FEED_SKELETON_COUNT);
    expect(screen.queryByRole('feed')).not.toBeInTheDocument();
    rerender(<TimelineMasonryPosts {...props} />);
    expect(screen.getByRole('feed')).toBeInTheDocument();
    expect(container.querySelector('[data-cy="masonry-skeleton"]')).not.toBeInTheDocument();
  });

  it('keeps empty copy and the Add Post tile available on an empty owner feed', () => {
    render(
      <TimelineMasonryPosts
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
    render(<TimelineMasonryPosts {...props} hasMore error="Could not load more posts" />);
    const load = screen.getByRole('button', { name: 'Load more' });
    expect(screen.getByRole('feed')).not.toContainElement(load);
    fireEvent.click(load);
    expect(resume).toHaveBeenCalledOnce();
    expect(screen.getByText(/Could not load more posts/)).toBeInTheDocument();
  });
});

describe('TimelineMasonryPosts - Snapshots', () => {
  it('renders initial placeholders using the shared loading count', () => {
    const { container } = render(<TimelineMasonryPosts {...props} postIds={[]} loading />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('TimelineMasonryPosts - Mobile Snapshots', () => {
  beforeEach(() => setMobileViewport());
  afterEach(() => resetViewport());

  it('renders initial placeholders using the shared loading count on mobile', () => {
    const { container } = render(<TimelineMasonryPosts {...props} postIds={[]} loading />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
