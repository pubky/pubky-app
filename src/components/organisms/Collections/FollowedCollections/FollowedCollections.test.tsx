import { act, render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { Logger } from '@/libs/logger/logger';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { buildFollowedCollectionsStreamId } from '@/models/stream/post/postStream.types';
import { toast } from '@/molecules/Toaster/toast';
import { asOpaque } from '@/test-utils/type-assertions';
import { FollowedCollections } from './FollowedCollections';

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

vi.mock('@/molecules/Toaster/toast');

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
const mockGetCachedLastPostTimestamp = vi.mocked(StreamPostsController.getCachedLastPostTimestamp);
const mockBookmarkGetAll = vi.mocked(BookmarkController.getAll);
const mockGetDetailsByIds = vi.mocked(PostController.getDetailsByIds);

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

describe('FollowedCollections', () => {
  it('pre-hydration: renders title + skeletons and does not fire a seed fetch', () => {
    mockAuthState = { hasHydrated: false, currentUserPubky: null };

    render(<FollowedCollections />);

    expect(screen.getByText('Followed Collections')).toBeInTheDocument();
    expect(screen.getByTestId('avatar-stack-skeleton')).toHaveAttribute('data-count', '3');
    expect(screen.getAllByTestId('collection-card-skeleton').length).toBeGreaterThan(0);
    expect(mockPrepareStreamForInitialLoad).not.toHaveBeenCalled();
    expect(mockGetOrFetchStreamSlice).not.toHaveBeenCalled();
  });

  it('post-hydration: seeds the followed-collections stream and persists slice via the controller', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockGetOrFetchStreamSlice.mockResolvedValue(
      makeSlice({ nextPageIds: ['a:p1'], reachedEnd: true, nextCursor: 123 }),
    );

    await act(async () => {
      render(<FollowedCollections />);
    });

    const expectedStreamId = buildFollowedCollectionsStreamId();

    await waitFor(() => {
      expect(mockPrepareStreamForInitialLoad).toHaveBeenCalledWith({ streamId: expectedStreamId });
      expect(mockGetCachedLastPostTimestamp).toHaveBeenCalledWith({ streamId: expectedStreamId });
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledWith({
        streamId: expectedStreamId,
        lastPostId: undefined,
        streamTail: 0,
        limit: COLLECTIONS_SECTION_PAGE_SIZE,
      });
    });
  });

  it('renders one CollectionCard per live-query id', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockUseLiveQuery.mockReturnValue(['authorA:p1', 'authorA:p2', 'authorB:p3']);

    await act(async () => {
      render(<FollowedCollections />);
    });

    const cards = screen.getAllByTestId('collection-card');
    expect(cards).toHaveLength(3);
    expect(cards[0]).toHaveAttribute('data-author-pubky', 'authorA');
    expect(cards[0]).toHaveAttribute('data-post-id', 'p1');
    expect(cards[2]).toHaveAttribute('data-author-pubky', 'authorB');
    expect(cards[2]).toHaveAttribute('data-post-id', 'p3');
  });

  it('passes unique authors from displayed cards to AvatarStack', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockUseLiveQuery.mockReturnValue(['a:p1', 'a:p2', 'b:p3']);

    await act(async () => {
      render(<FollowedCollections />);
    });

    await waitFor(() => {
      const stack = screen.getByTestId('avatar-stack');
      expect(stack).toHaveAttribute('data-pubkys', 'a,b');
    });
  });

  it('live-query callback joins bookmarks with post-details and keeps only collection-kind ids', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };

    const bookmarkIds = ['a:p1', 'a:p2', 'b:p3'];
    mockBookmarkGetAll.mockResolvedValue(bookmarkIds);
    mockGetDetailsByIds.mockResolvedValue([
      asOpaque<PostDetailsModelSchema>({ id: 'a:p1', kind: 'collection' }),
      asOpaque<PostDetailsModelSchema>({ id: 'a:p2', kind: 'collection' }),
      asOpaque<PostDetailsModelSchema>({ id: 'b:p3', kind: 'short' }),
    ]);

    // Capture the live-query callback so we can invoke it ourselves.
    let capturedFn: (() => Promise<string[]>) | null = null;
    mockUseLiveQuery.mockImplementation((fn: unknown) => {
      capturedFn = fn as () => Promise<string[]>;
      return undefined;
    });

    await act(async () => {
      render(<FollowedCollections />);
    });

    expect(capturedFn).not.toBeNull();
    const result = await capturedFn!();
    expect(result).toEqual(['a:p1', 'a:p2']);
    expect(mockBookmarkGetAll).toHaveBeenCalled();
    expect(mockGetDetailsByIds).toHaveBeenCalledWith({ compositeIds: bookmarkIds });
  });

  it('live-query callback excludes soft-deleted collections (content === [DELETED])', async () => {
    // When a collection is deleted, `LocalPostService.delete` flips
    // `PostDetails.content` to `[DELETED]`. The live query observes
    // `post_details` so the bookmark stays (you bookmarked it), but the
    // filter must drop the deleted id before the card list is built.
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };

    const bookmarkIds = ['a:p1', 'a:p2', 'b:p3'];
    mockBookmarkGetAll.mockResolvedValue(bookmarkIds);
    mockGetDetailsByIds.mockResolvedValue([
      asOpaque<PostDetailsModelSchema>({ id: 'a:p1', kind: 'collection', content: 'live' }),
      asOpaque<PostDetailsModelSchema>({ id: 'a:p2', kind: 'collection', content: '[DELETED]' }),
      asOpaque<PostDetailsModelSchema>({ id: 'b:p3', kind: 'collection', content: 'live' }),
    ]);

    let capturedFn: (() => Promise<string[]>) | null = null;
    mockUseLiveQuery.mockImplementation((fn: unknown) => {
      capturedFn = fn as () => Promise<string[]>;
      return undefined;
    });

    await act(async () => {
      render(<FollowedCollections />);
    });

    expect(capturedFn).not.toBeNull();
    const result = await capturedFn!();
    expect(result).toEqual(['a:p1', 'b:p3']);
    expect(result).not.toContain('a:p2');
  });

  it('renders nothing when seed finished and live query yields no ids', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockUseLiveQuery.mockReturnValue([]);
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: [], reachedEnd: true }));

    await act(async () => {
      render(<FollowedCollections />);
    });

    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalled();
    });
    expect(screen.queryByText("You haven't followed any collections yet.")).not.toBeInTheDocument();
    expect(screen.queryByText('Followed Collections')).not.toBeInTheDocument();
    expect(screen.queryByTestId('collection-card')).not.toBeInTheDocument();
  });

  it('hides Show More when reachedEnd is true', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockUseLiveQuery.mockReturnValue(['a:p1']);
    mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: ['a:p1'], reachedEnd: true }));

    await act(async () => {
      render(<FollowedCollections />);
    });

    await waitFor(() => {
      expect(screen.queryByText('Show more')).not.toBeInTheDocument();
    });
  });

  it('shows Show More when reachedEnd is false; clicking resumes from the threaded nextCursor', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockUseLiveQuery.mockReturnValue(['a:p1']);
    mockGetOrFetchStreamSlice.mockResolvedValue(
      makeSlice({ nextPageIds: ['a:p1'], reachedEnd: false, nextCursor: 42 }),
    );

    await act(async () => {
      render(<FollowedCollections />);
    });

    const button = await screen.findByRole('button', { name: 'Show more' });
    expect(button).toBeInTheDocument();

    const callsBefore = mockGetOrFetchStreamSlice.mock.calls.length;
    await act(async () => {
      button.click();
    });
    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    // The follow-up fetch must resume from the cursor threaded back by the first page (42),
    // proving the timestamp->nextCursor rename actually feeds pagination.
    expect(mockGetOrFetchStreamSlice.mock.calls.at(-1)?.[0]).toMatchObject({ streamTail: 42 });
  });

  it('Show More resumes the cache walk from lastRawPostId, not the last visible id', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockUseLiveQuery.mockReturnValue(['a:p1']);
    // The slice's raw scan ended past the visible page — e.g. a filtered tail of
    // deleted bookmarked collections. The next request must anchor on the raw id.
    mockGetOrFetchStreamSlice.mockResolvedValue(
      makeSlice({ nextPageIds: ['a:p1'], reachedEnd: false, nextCursor: 42, lastRawPostId: 'a:deleted-9' }),
    );

    await act(async () => {
      render(<FollowedCollections />);
    });

    const button = await screen.findByRole('button', { name: 'Show more' });
    const callsBefore = mockGetOrFetchStreamSlice.mock.calls.length;
    await act(async () => {
      button.click();
    });
    await waitFor(() => {
      expect(mockGetOrFetchStreamSlice.mock.calls.length).toBeGreaterThan(callsBefore);
    });
    expect(mockGetOrFetchStreamSlice.mock.calls.at(-1)?.[0]).toMatchObject({
      lastPostId: 'a:deleted-9',
      streamTail: 42,
    });
  });

  it('on seed-fetch failure: logs an error, fires the load-failed toast, and hides Show More (reachedEnd flips true)', async () => {
    mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
    mockUseLiveQuery.mockReturnValue([]);
    mockGetOrFetchStreamSlice.mockRejectedValue(new Error('boom'));

    await act(async () => {
      render(<FollowedCollections />);
    });

    await waitFor(() => {
      expect(Logger.error).toHaveBeenCalled();
    });
    // Mirror of the `MyCollections` onError toast — keeps failure UX
    // consistent across the three Collections sections.
    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      variant: 'error',
      description: 'Failed to load collections. Please try again.',
    });
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  describe('FollowedCollections - Snapshots', () => {
    it('matches the snapshot for the pre-hydration skeleton state', () => {
      mockAuthState = { hasHydrated: false, currentUserPubky: null };

      const { container } = render(<FollowedCollections />);
      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot for the populated state with cards + Show More', async () => {
      mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
      mockUseLiveQuery.mockReturnValue(['authorA:p1', 'authorB:p2']);
      mockGetOrFetchStreamSlice.mockResolvedValue(
        makeSlice({ nextPageIds: ['authorA:p1', 'authorB:p2'], reachedEnd: false, nextCursor: 100 }),
      );

      const { container } = await act(async () => render(<FollowedCollections />));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Show more' })).toBeInTheDocument();
      });

      expect(container.firstChild).toMatchSnapshot();
    });

    it('matches the snapshot for the empty state (live query empty, seed resolved)', async () => {
      mockAuthState = { hasHydrated: true, currentUserPubky: 'me' };
      mockUseLiveQuery.mockReturnValue([]);
      mockGetOrFetchStreamSlice.mockResolvedValue(makeSlice({ nextPageIds: [], reachedEnd: true, nextCursor: 0 }));

      const { container } = await act(async () => render(<FollowedCollections />));
      await waitFor(() => {
        expect(mockGetOrFetchStreamSlice).toHaveBeenCalled();
      });

      expect(container.firstChild).toBeNull();
    });
  });
});
