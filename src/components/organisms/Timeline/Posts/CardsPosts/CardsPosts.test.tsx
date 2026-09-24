import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { GRID_FEED_SKELETON_COUNT } from '@/config/feed';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll/useInfiniteScroll';
import { usePostDetails } from '@/hooks/usePostDetails/usePostDetails';
import { PostMain } from '@/organisms/PostMain/PostMain';
import { VRT_FEED_POSTS } from '@/test/fixtures/feed/posts';
import { VRT_AUTHOR_PROFILES } from '@/test/fixtures/feed/profiles';
import { asOpaque } from '@/test-utils/type-assertions';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
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
// Snapshot blocks use the real card; renderer tests below replace it with a dispatch stub.
vi.mock('@/organisms/PostMain/PostMain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/organisms/PostMain/PostMain')>();
  return { PostMain: vi.fn(actual.PostMain) };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/collections/bookmarks',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: () => ({ ref: vi.fn() }),
}));
vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: (id: string) => ({ userDetails: VRT_AUTHOR_PROFILES[id] ?? null, isLoading: false }),
}));
vi.mock('@/hooks/useAvatarUrl/useAvatarUrl', () => ({ useAvatarUrl: () => null }));
vi.mock('@/hooks/useRelativeTime/useRelativeTime', () => ({
  useRelativeTime: () => ({ formatRelativeTime: () => '2h' }),
}));
vi.mock('@/hooks/useRepostInfo/useRepostInfo', () => ({
  useRepostInfo: () => ({ isRepost: false, originalPostId: null }),
}));
vi.mock('@/hooks/usePostCounts/usePostCounts', () => ({
  usePostCounts: () => ({ postCounts: { replies: 2, reposts: 3, unique_tags: 0 }, isLoading: false }),
}));
vi.mock('@/hooks/useEntityTags/useEntityTags', () => ({
  useEntityTags: () => ({ tags: [], isViewerTagger: () => false, handleTagToggle: vi.fn(), handleTagAdd: vi.fn() }),
}));
vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ isAuthenticated: true, requireAuth: (action: () => void) => action() }),
}));
vi.mock('@/hooks/usePostSaveTargets/usePostSaveTargets', () => ({
  usePostSaveTargets: () => ({
    isBookmarked: true,
    isBookmarkLoading: false,
    isBookmarkToggling: false,
    collections: [],
    isCollectionsLoading: false,
    isCreatingCollection: false,
    toggleBookmark: vi.fn(),
    toggleCollection: vi.fn(),
    createCollectionWithPost: vi.fn(),
  }),
}));
vi.mock('@/hooks/useDeletePost/useDeletePost', () => ({
  useDeletePost: () => ({ deletePost: vi.fn(), isDeleting: false }),
}));
// Closed dialogs do not contribute to these snapshots.
vi.mock('@/hooks/usePostReplyRepostDialogs/usePostReplyRepostDialogs', () => ({
  usePostReplyRepostDialogs: () => ({ openReplyDialog: vi.fn(), openRepostDialog: vi.fn(), dialogs: null }),
}));
vi.mock('@/organisms/DialogEditPost/DialogEditPost', () => ({ DialogEditPost: () => null }));
vi.mock('@/organisms/DialogReportPost/DialogReportPost', () => ({ DialogReportPost: () => null }));

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
  vi.mocked(PostMain).mockReset();
  vi.mocked(usePostDetails).mockImplementation((id) => {
    const details = VRT_FEED_POSTS.find((post) => post.compositeId === id)?.details;
    return {
      postDetails: details ? { ...details, is_moderated: false, is_blurred: false } : null,
      isLoading: false,
    };
  });
  vi.mocked(useInfiniteScroll).mockReturnValue({ sentinelRef: vi.fn(), isStalled: false, resumeAutoLoad: resume });
});

describe('TimelineCardsPosts', () => {
  beforeEach(() => {
    vi.mocked(PostMain).mockImplementation(({ postId, presentation }) => (
      <div data-presentation={presentation}>{postId}</div>
    ));
  });

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

const snapshotProps = { ...props, postIds: [VRT_FEED_POSTS[0].compositeId] };

describe('TimelineCardsPosts - Snapshots', () => {
  it('renders a complete Cards post', () => {
    const { container } = render(<TimelineCardsPosts {...snapshotProps} />, { wrapper: TooltipProvider });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('TimelineCardsPosts - Mobile Snapshots', () => {
  beforeEach(() => setMobileViewport());
  afterEach(() => resetViewport());

  it('renders the same complete Cards post on mobile', () => {
    const { container } = render(<TimelineCardsPosts {...snapshotProps} />, { wrapper: TooltipProvider });
    expect(container.firstChild).toMatchSnapshot();
  });
});
