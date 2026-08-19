import { act, render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { Logger } from '@/libs/logger/logger';
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
vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    getOrFetchStreamSlice: vi.fn(),
    prepareStreamForInitialLoad: vi.fn(),
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
  CollectionCard: ({ authorPubky, postId }: { authorPubky: string; postId: string }) => (
    <div data-testid="collection-card" data-author-pubky={authorPubky} data-post-id={postId} />
  ),
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard.skeleton', () => ({
  CollectionCardSkeleton: () => <div data-testid="collection-card-skeleton" />,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockUseLiveQuery = vi.mocked(useLiveQuery);
const mockGetOrFetchStreamSlice = vi.mocked(StreamPostsController.getOrFetchStreamSlice);
const mockPrepareStreamForInitialLoad = vi.mocked(StreamPostsController.prepareStreamForInitialLoad);

function makeSlice({
  nextPageIds = [],
  reachedEnd = true,
  nextCursor = 0,
  lastRawPostId,
}: {
  nextPageIds?: string[];
  reachedEnd?: boolean;
  nextCursor?: number;
  lastRawPostId?: string;
} = {}) {
  return asOpaque<TReadPostStreamChunkResponse>({ nextPageIds, reachedEnd, nextCursor, lastRawPostId });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthState = { hasHydrated: false, currentUserPubky: null };
  mockUseLiveQuery.mockReturnValue(undefined);
  mockPrepareStreamForInitialLoad.mockResolvedValue(undefined);
  mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ reachedEnd: true }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
// Own / bookmarked / deleted / empty filtering for this stream lives in the
// shared stream layer (`PostStreamApplication.filterDiscoverOwnAndBookmarked`
// + the Discover branch of `filterStreamPosts`), unit-tested there. The
// component receives `nextPageIds` already filtered and renders them.

describe('DiscoverCollections', () => {
  it('pre-hydration: renders title + AvatarStackSkeleton, no cards, no fetch', () => {
    mockAuthState = { hasHydrated: false, currentUserPubky: null };

    render(<DiscoverCollections />);

    expect(screen.getByText('Discover Collections')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-stack-skeleton')).toHaveAttribute('data-count', '3');
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(mockPrepareStreamForInitialLoad).not.toHaveBeenCalled();
    expect(mockGetOrFetchStreamSlice).not.toHaveBeenCalled();
  });

  it('post-hydration: prepares the stream, fetches at offset 0, and renders the returned ids', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['other:p1', 'other:p3'], reachedEnd: true }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    const expectedStreamId = buildDiscoverCollectionsStreamId();
    await waitFor(() => {
      expect(mockPrepareStreamForInitialLoad).toHaveBeenCalledWith({ streamId: expectedStreamId });
    });
    // Discover is skip-paginated: the initial fetch starts at offset 0.
    expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: expectedStreamId, streamTail: 0, limit: COLLECTIONS_SECTION_PAGE_SIZE }),
    );

    await waitFor(() => {
      const cards = screen.getAllByTestId('collection-card');
      expect(cards).toHaveLength(2);
      expect(cards[0]).toHaveAttribute('data-post-id', 'p1');
      expect(cards[1]).toHaveAttribute('data-post-id', 'p3');
    });
  });

  it('renders empty state when loading: false, reachedEnd: true, and no visible cards', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: [], reachedEnd: true }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    await waitFor(() => {
      expect(screen.getByText('No collections to discover right now.')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  it('clicking Show More resumes from the raw skip offset threaded back as nextCursor', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    const firstSliceIds = Array.from({ length: COLLECTIONS_SECTION_PAGE_SIZE }, (_, i) => `other:p${i}`);
    const lastIdOfFirstSlice = firstSliceIds[firstSliceIds.length - 1];
    // The stream layer consumed 26 raw posts to produce 20 visible ones — the
    // resume offset is the raw count (26), NOT the visible count (20).
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: firstSliceIds, reachedEnd: false, nextCursor: 26 }),
    );
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: ['other:more'], reachedEnd: true, nextCursor: 30 }),
    );

    await act(async () => {
      render(<DiscoverCollections />);
    });

    const button = await screen.findByRole('button', { name: 'Show more' });
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
    });
    expect(mockGetOrFetchStreamSlice.mock.calls.at(-1)?.[0]).toMatchObject({
      lastPostId: lastIdOfFirstSlice,
      streamTail: 26,
      limit: COLLECTIONS_SECTION_PAGE_SIZE,
    });
    // The new page is appended after the first one.
    await waitFor(() => {
      expect(screen.getAllByTestId('collection-card')).toHaveLength(COLLECTIONS_SECTION_PAGE_SIZE + 1);
    });
  });

  it('Show More anchors the next request on lastRawPostId when the slice threads one back', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    // The raw scan ended past the visible page (filtered tail) — the follow-up
    // request must anchor on the raw id, not the last visible one.
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: ['other:p1'], reachedEnd: false, nextCursor: 26, lastRawPostId: 'other:raw-26' }),
    );
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: ['other:more'], reachedEnd: true, nextCursor: 30 }),
    );

    await act(async () => {
      render(<DiscoverCollections />);
    });

    const button = await screen.findByRole('button', { name: 'Show more' });
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
    });
    expect(mockGetOrFetchStreamSlice.mock.calls.at(-1)?.[0]).toMatchObject({
      lastPostId: 'other:raw-26',
      streamTail: 26,
    });
  });

  it('Show More cap-hit (empty page, stream not exhausted): fires the no-new-results toast and keeps the button', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: ['other:p1'], reachedEnd: false, nextCursor: 20 }),
    );
    // The stream layer scanned its bounded window and filtering removed
    // everything: empty page, cursor advanced, stream NOT exhausted.
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(makeSlice({ nextPageIds: [], reachedEnd: false, nextCursor: 420 }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    const button = await screen.findByRole('button', { name: 'Show more' });
    expect(mockToast).not.toHaveBeenCalled();
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'warning',
        description: 'No new collections found right now. Try again later.',
      });
    });
    expect(mockToast).toHaveBeenCalledTimes(1);
    // The card list is unchanged and the button survives for another attempt,
    // which will resume from the advanced offset (420) — no dead-end, no stall.
    expect(screen.getAllByTestId('collection-card')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();

    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: ['other:p2'], reachedEnd: true, nextCursor: 440 }),
    );
    await act(async () => {
      screen.getByRole('button', { name: 'Show more' }).click();
    });
    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice.mock.calls.at(-1)?.[0]).toMatchObject({ streamTail: 420 });
    });
  });

  it('Show More reaching the genuine end with no new ids: no toast, button hides', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(
      makeSlice({ nextPageIds: ['other:p1'], reachedEnd: false, nextCursor: 20 }),
    );
    mockGetOrFetchStreamSlice.mockResolvedValueOnce(makeSlice({ nextPageIds: [], reachedEnd: true, nextCursor: 25 }));

    await act(async () => {
      render(<DiscoverCollections />);
    });

    const button = await screen.findByRole('button', { name: 'Show more' });
    await act(async () => {
      button.click();
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
    });
    expect(mockToast).not.toHaveBeenCalled();
    // Existing cards stay; the exhausted stream simply stops offering more.
    expect(screen.getAllByTestId('collection-card')).toHaveLength(1);
  });

  it('live-overlay subtracts ids that were locally bookmarked mid-session', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:1', 'b:2'], reachedEnd: true }));
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

  it('live-overlay subtracts ids that have flipped to [DELETED] or emptied mid-session', async () => {
    // Mirror the bookmarks-overlay test but for the deletions overlay: the
    // second `useLiveQuery` returns the set of locally-deleted/emptied ids in
    // the visible window, and `displayIds` must exclude them.
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:1', 'b:2'], reachedEnd: true }));
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
      description: 'Failed to load collections. Please try again.',
    });
    // No spinner, no Show More, no cards.
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
    // Empty state surfaces.
    expect(screen.getByText('No collections to discover right now.')).toBeInTheDocument();
  });

  describe('DiscoverCollections - Snapshots', () => {
    it('matches the snapshot for the pre-hydration skeleton state', () => {
      mockAuthState = { hasHydrated: false, currentUserPubky: null };

      const { container } = render(<DiscoverCollections />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot for the populated state (cards + Show More)', async () => {
      mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
      mockGetOrFetchStreamSlice.mockResolvedValue(
        makeSlice({ nextPageIds: ['authorA:p1', 'authorB:p2'], reachedEnd: false, nextCursor: 2 }),
      );

      const { container } = await act(async () => render(<DiscoverCollections />));
      await waitFor(() => {
        expect(screen.getAllByTestId('collection-card')).toHaveLength(2);
      });

      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot for the exhausted-empty state', async () => {
      mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
      mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: [], reachedEnd: true, nextCursor: 0 }));

      const { container } = await act(async () => render(<DiscoverCollections />));
      await waitFor(() => {
        expect(screen.getByText('No collections to discover right now.')).toBeInTheDocument();
      });

      expect(container.firstChild).toMatchSnapshot();
    });
  });
});
