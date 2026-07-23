import { act, render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_DISCOVER_BACKFILL_MAX_ROUNDS, COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { Logger } from '@/libs/logger/logger';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { buildDiscoverCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { asOpaque } from '@/test-utils/type-assertions';
import { DiscoverCollections } from './DiscoverCollections';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockAuthState: { hasHydrated: boolean; currentUserPubky: string | null } = {
  hasHydrated: false,
  currentUserPubky: null,
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => `${namespace ?? ''}.${key}`,
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    getOrFetchStreamSlice: vi.fn(),
    prepareStreamForInitialLoad: vi.fn(),
    getCachedLastPostTimestamp: vi.fn(),
  },
}));

vi.mock('@/controllers/bookmark/bookmark', () => ({
  BookmarkController: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/controllers/post/post', () => ({
  PostController: {
    getDetailsByIds: vi.fn(),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mockToast = vi.fn();
vi.mock('@/molecules/Toaster/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/molecules/AvatarStack/AvatarStack', () => ({
  AvatarStack: ({ pubkys }: { pubkys: string[] }) => <div data-testid="avatar-stack" data-pubkys={pubkys.join(',')} />,
}));

vi.mock('@/molecules/AvatarStack/AvatarStack.skeleton', () => ({
  AvatarStackSkeleton: ({ count }: { count: number }) => <div data-testid="avatar-stack-skeleton" data-count={count} />,
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => ({
  CollectionCard: ({
    authorPubky,
    postId,
    initialIsBookmarked,
  }: {
    authorPubky: string;
    postId: string;
    initialIsBookmarked?: boolean;
  }) => (
    <div
      data-testid="collection-card"
      data-author-pubky={authorPubky}
      data-post-id={postId}
      data-initial-bookmarked={String(!!initialIsBookmarked)}
    />
  ),
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard.skeleton', () => ({
  CollectionCardSkeleton: () => <div data-testid="collection-card-skeleton" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const collectionContent = (items: string[] = ['item:1']) =>
  JSON.stringify({ name: 'Test Collection', items, description: '', cover_image: '' });

const mockUseLiveQuery = vi.mocked(useLiveQuery);
const mockGetOrFetchStreamSlice = vi.mocked(StreamPostsController.getOrFetchStreamSlice);
const mockPrepareStreamForInitialLoad = vi.mocked(StreamPostsController.prepareStreamForInitialLoad);
const mockGetCachedLastPostTimestamp = vi.mocked(StreamPostsController.getCachedLastPostTimestamp);
const mockBookmarkGetAll = vi.mocked(BookmarkController.getAll);
const mockGetDetailsByIds = vi.mocked(PostController.getDetailsByIds);

function makeSlice({
  nextPageIds = [],
  reachedEnd = true,
  timestamp = 0,
}: {
  nextPageIds?: string[];
  reachedEnd?: boolean;
  timestamp?: number;
} = {}) {
  return asOpaque<TReadPostStreamChunkResponse>({ nextPageIds, reachedEnd, timestamp });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState = { hasHydrated: false, currentUserPubky: null };
  mockUseLiveQuery.mockReturnValue(undefined);
  mockPrepareStreamForInitialLoad.mockResolvedValue(undefined);
  mockGetCachedLastPostTimestamp.mockResolvedValue(0);
  mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ reachedEnd: true }));
  mockBookmarkGetAll.mockResolvedValue([]);
  mockGetDetailsByIds.mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiscoverCollections', () => {
  it('pre-hydration: renders title + AvatarStackSkeleton, no cards, no fetch', () => {
    mockAuthState = { hasHydrated: false, currentUserPubky: null };

    render(<DiscoverCollections />);

    expect(screen.getByText('collections.discover.title')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-stack-skeleton')).toHaveAttribute('data-count', '3');
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(mockPrepareStreamForInitialLoad).not.toHaveBeenCalled();
    expect(mockGetOrFetchStreamSlice).not.toHaveBeenCalled();
  });

  it('post-hydration: filters out own collections from the slice', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(
      makeSlice({ nextPageIds: ['other:p1', 'me:p2', 'other:p3'], reachedEnd: true }),
    );
    mockBookmarkGetAll.mockResolvedValue([]);

    await act(async () => {
      render(<DiscoverCollections />);
    });

    const expectedStreamId = buildDiscoverCollectionsStreamId();
    await waitFor(() => {
      expect(mockPrepareStreamForInitialLoad).toHaveBeenCalledWith({ streamId: expectedStreamId });
      expect(mockGetCachedLastPostTimestamp).toHaveBeenCalledWith({ streamId: expectedStreamId });
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveAttribute('data-post-id', 'p1');
      expect(cards[1]).toHaveAttribute('data-post-id', 'p3');
    });
  });

  it('filters out already-bookmarked ids using BookmarkController.getAll()', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(
      makeSlice({ nextPageIds: ['otherA:p1', 'otherB:p2'], reachedEnd: true }),
    );
    mockBookmarkGetAll.mockResolvedValue(['otherA:p1']);

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveAttribute('data-author-pubky', 'otherB');
      expect(cards[0]).toHaveAttribute('data-post-id', 'p2');
    });
  });

  it('triggers backfill when an entire slice is filtered out and reachedEnd is false', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    // First slice: all own → filtered out. Second slice: a usable id.
    mockGetOrFetchStreamSlice
      .mockResolvedValueOnce(makeSlice({ nextPageIds: ['me:p1'], reachedEnd: false, timestamp: 10 }))
      .mockResolvedValueOnce(makeSlice({ nextPageIds: ['other:p2'], reachedEnd: true, timestamp: 11 }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveAttribute('data-post-id', 'p2');
    });
  });

  it('caps backfill at COLLECTIONS_DISCOVER_BACKFILL_MAX_ROUNDS when every slice is fully filtered', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    // Every slice is own-only and reachedEnd:false → backfill should be bounded.
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['me:p1'], reachedEnd: false, timestamp: 1 }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(COLLECTIONS_DISCOVER_BACKFILL_MAX_ROUNDS);
    });
    // Spinner clears even with no visible cards.
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
  });

  it('renders empty state when loading: false, reachedEnd: true, and no visible cards', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: [], reachedEnd: true }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      expect(screen.getByText('collections.discover.empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(screen.queryByText('collections.showMore')).not.toBeInTheDocument();
  });

  it('clicking Show More invokes another slice fetch using the last cursor', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    // First slice fills a page (>= COLLECTIONS_SECTION_PAGE_SIZE) so backfill
    // stops after one round and Show More remains visible.
    const firstSliceIds = Array.from({ length: COLLECTIONS_SECTION_PAGE_SIZE }, (_, i) => `other:p${i}`);
    const lastIdOfFirstSlice = firstSliceIds[firstSliceIds.length - 1];
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: firstSliceIds, reachedEnd: false, timestamp: 50 }),
    );
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: ['other:more'], reachedEnd: true, timestamp: 60 }),
    );

    await act(async () => {
      render(<DiscoverCollections />);
    });

    const button = await screen.findByRole('button', { name: 'collections.showMore' });
    const callsBefore = mockGetOrFetchStreamSlice.mock.calls.length;
    await act(async () => {
      button.click();
    });
    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    // The follow-up call should carry the cursor from the first call's result.
    // Discover is an engagement-sorted stream (`total_engagement:all:collection`),
    // so `streamTail` is a *skip offset* (= raw posts pulled so far), NOT the
    // returned `last_post_score` timestamp. After one slice of
    // `COLLECTIONS_SECTION_PAGE_SIZE` raw IDs, the next skip is that length.
    const lastCallArgs = mockGetOrFetchStreamSlice.mock.calls.at(-1)?.[0];
    expect(lastCallArgs).toMatchObject({
      lastPostId: lastIdOfFirstSlice,
      streamTail: COLLECTIONS_SECTION_PAGE_SIZE,
      limit: COLLECTIONS_SECTION_PAGE_SIZE,
    });
  });

  it('live-overlay subtracts ids that were locally bookmarked mid-session', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:1', 'b:2'], reachedEnd: true }));
    // Fetch-time bookmark set is empty; live overlay later includes 'a:1'.
    mockBookmarkGetAll.mockResolvedValue([]);
    // Two `useLiveQuery` calls run inside the component: the bookmarks overlay
    // (deps: `[]`) and the deletions overlay (deps: `[visibleIds]`). Branch on
    // deps so only the bookmarks overlay sees 'a:1' and the deletions overlay
    // gets an empty `Set` (no live-deleted ids in this scenario).
    mockUseLiveQuery.mockImplementation((_fn: unknown, deps?: unknown[]) =>
      Array.isArray(deps) && deps.length === 0 ? ['a:1'] : new Set<string>(),
    );

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveAttribute('data-post-id', '2');
      expect(cards[0]).toHaveAttribute('data-author-pubky', 'b');
    });
  });

  it('fetch-time filter drops slice ids whose local PostDetails is tombstoned', async () => {
    // Defense-in-depth against Nexus eventually-consistent streams: if a slice
    // returns an id whose local PostDetails has `content === '[DELETED]'`,
    // the fetch-time filter must skip it before it lands in `visibleIds`.
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:1', 'b:2'], reachedEnd: true }));
    mockGetDetailsByIds.mockResolvedValue([
      asOpaque<PostDetailsModelSchema>({ id: 'a:1', kind: 'collection', content: '[DELETED]' }),
      asOpaque<PostDetailsModelSchema>({ id: 'b:2', kind: 'collection', content: collectionContent() }),
    ]);

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveAttribute('data-author-pubky', 'b');
      expect(cards[0]).toHaveAttribute('data-post-id', '2');
    });
  });

  it('fetch-time filter drops slice ids whose local PostDetails has zero items', async () => {
    // Fourth filter layer (after own / followed / deleted): collections with
    // an empty `items` array have nothing to discover, so they shouldn't reach
    // `visibleIds`. Unparseable content (null envelope) is treated the same as
    // empty — defensive against malformed content drifting in from Nexus.
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:1', 'b:2', 'c:3'], reachedEnd: true }));
    mockGetDetailsByIds.mockResolvedValue([
      asOpaque<PostDetailsModelSchema>({ id: 'a:1', kind: 'collection', content: collectionContent([]) }),
      asOpaque<PostDetailsModelSchema>({ id: 'b:2', kind: 'collection', content: collectionContent(['x:1']) }),
      asOpaque<PostDetailsModelSchema>({ id: 'c:3', kind: 'collection', content: 'not-json' }),
    ]);

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveAttribute('data-author-pubky', 'b');
      expect(cards[0]).toHaveAttribute('data-post-id', '2');
    });
  });

  it('live-overlay subtracts ids that have flipped to [DELETED] mid-session', async () => {
    // Mirror the bookmarks-overlay test but for the deletions overlay: the
    // second `useLiveQuery` returns the set of locally-deleted ids in the
    // visible window, and `displayIds` must exclude them.
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:1', 'b:2'], reachedEnd: true }));
    mockBookmarkGetAll.mockResolvedValue([]);
    // Fetch-time details are clean (live content); deletion only happens
    // mid-session and is surfaced by the live overlay.
    mockGetDetailsByIds.mockResolvedValue([
      asOpaque<PostDetailsModelSchema>({ id: 'a:1', kind: 'collection', content: collectionContent() }),
      asOpaque<PostDetailsModelSchema>({ id: 'b:2', kind: 'collection', content: collectionContent() }),
    ]);
    // Two live queries — bookmarks (deps: []) returns []; deletions (deps:
    // [visibleIds]) returns the deleted-id Set.
    mockUseLiveQuery.mockImplementation((_fn: unknown, deps?: unknown[]) =>
      Array.isArray(deps) && deps.length === 0 ? [] : new Set<string>(['a:1']),
    );

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(1);
      expect(cards[0]).toHaveAttribute('data-author-pubky', 'b');
      expect(cards[0]).toHaveAttribute('data-post-id', '2');
    });
  });

  it('AvatarStack pubkys are derived from the unique authors of displayIds', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:1', 'a:2', 'b:3'], reachedEnd: true }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      const stack = screen.getByTestId('avatar-stack');
      expect(stack).toHaveAttribute('data-pubkys', 'a,b');
    });
  });

  it('on slice failure: logs error, fires the load-failed toast, hides Show More, and clears loading', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockRejectedValue(new Error('boom'));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      expect(Logger.error).toHaveBeenCalled();
    });
    // Mirror of the `MyCollections` onError toast — keeps failure UX
    // consistent across the three Collections sections.
    expect(mockToast).toHaveBeenCalledWith({
      variant: 'error',
      description: 'collections.loadFailed',
    });
    // No spinner, no Show More, no cards.
    expect(screen.queryByText('collections.showMore')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    // Empty state surfaces.
    expect(screen.getByText('collections.discover.empty')).toBeInTheDocument();
  });

  describe('DiscoverCollections - Snapshots', () => {
    it('matches the snapshot for the pre-hydration skeleton state', () => {
      mockAuthState = { hasHydrated: false, currentUserPubky: null };

      const { container } = render(<DiscoverCollections />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot for the populated state (post-filter cards + Show More)', async () => {
      mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
      mockGetOrFetchStreamSlice.mockResolvedValue(
        makeSlice({ nextPageIds: ['authorA:p1', 'authorB:p2'], reachedEnd: false, timestamp: 100 }),
      );
      mockBookmarkGetAll.mockResolvedValue([]);

      const { container } = await act(async () => render(<DiscoverCollections />));
      await waitFor(() => {
        expect(screen.getAllByTestId('collection-card')).toHaveLength(2);
      });

      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot for the exhausted-empty state', async () => {
      mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
      mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: [], reachedEnd: true, timestamp: 0 }));
      mockBookmarkGetAll.mockResolvedValue([]);

      const { container } = await act(async () => render(<DiscoverCollections />));
      await waitFor(() => {
        expect(screen.getByText('collections.discover.empty')).toBeInTheDocument();
      });

      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
