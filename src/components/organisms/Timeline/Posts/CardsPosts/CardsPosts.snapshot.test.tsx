import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/atoms/Tooltip/Tooltip';
import { VRT_FEED_POSTS } from '@/test/fixtures/feed/posts';
import { VRT_AUTHOR_PROFILES } from '@/test/fixtures/feed/profiles';
import { resetViewport, setMobileViewport } from '@/test-utils/viewport';
import { TimelineCardsPosts } from './CardsPosts';

// Keep the card, author, timestamp, tags, and actions real. Only data and side effects are mocked.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/collections/bookmarks',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('@/hooks/useInfiniteScroll/useInfiniteScroll', () => ({
  useInfiniteScroll: () => ({ sentinelRef: vi.fn(), isStalled: false, resumeAutoLoad: vi.fn() }),
}));
vi.mock('@/hooks/useTtlSubscription/useTtlSubscription', () => ({
  useTtlSubscription: () => ({ ref: vi.fn() }),
}));
vi.mock('@/hooks/usePostHeaderVisibility/usePostHeaderVisibility', () => ({
  usePostHeaderVisibility: () => ({ showRepostHeader: false, shouldShowPostHeader: true, originalPostId: null }),
}));
vi.mock('@/hooks/usePostDetails/usePostDetails', () => ({
  usePostDetails: (id: string) => ({
    postDetails: VRT_FEED_POSTS.find((post) => post.compositeId === id)?.details ?? null,
    isLoading: false,
  }),
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
  postIds: [VRT_FEED_POSTS[0].compositeId],
  loading: false,
  loadingMore: false,
  error: null,
  hasMore: false,
  loadMore: vi.fn(),
  showEndMessage: false,
};

describe('TimelineCardsPosts composition - Snapshots', () => {
  it('renders a complete Cards post', () => {
    const { container } = render(<TimelineCardsPosts {...props} />, { wrapper: TooltipProvider });
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe('TimelineCardsPosts composition - Mobile Snapshots', () => {
  beforeEach(() => setMobileViewport());
  afterEach(() => resetViewport());

  it('renders the same complete Cards post on mobile', () => {
    const { container } = render(<TimelineCardsPosts {...props} />, { wrapper: TooltipProvider });
    expect(container.firstChild).toMatchSnapshot();
  });
});
