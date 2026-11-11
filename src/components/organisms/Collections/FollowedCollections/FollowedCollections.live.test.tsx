import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COLLECTIONS_SECTION_PAGE_SIZE } from '@/config/collections';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { PostController } from '@/controllers/post/post';
import { StreamPostsController } from '@/controllers/stream/posts/posts';
import type { TReadPostStreamChunkResponse } from '@/controllers/stream/posts/posts.types';
import { db } from '@/database/franky/franky';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { asOpaque } from '@/test-utils/type-assertions';
import { FollowedCollections } from './FollowedCollections';

// Integration test against the real Dexie database and the real `useLiveQuery`: only the stream walk
// (the network side) is stubbed. The unit tests next door mock the live query itself.

vi.mock('@/controllers/stream/posts/posts', () => ({
  StreamPostsController: {
    getOrFetchStreamSlice: vi.fn(),
    prepareStreamForInitialLoad: vi.fn(),
    getCachedLastPostTimestamp: vi.fn(),
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { hasHydrated: boolean; currentUserPubky: string }) => unknown) =>
    selector({ hasHydrated: true, currentUserPubky: 'me' }),
}));

vi.mock('@/libs/logger/logger', () => ({
  Logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/molecules/Toaster/toast');

vi.mock('@/molecules/AvatarStack/AvatarStack', () => ({
  AvatarStack: () => <div data-testid="avatar-stack" />,
}));

vi.mock('@/molecules/AvatarStack/AvatarStack.skeleton', () => ({
  AvatarStackSkeleton: () => <div data-testid="avatar-stack-skeleton" />,
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard', () => ({
  CollectionCard: ({ postId }: { postId: string }) => <div data-testid="collection-card" data-post-id={postId} />,
}));

vi.mock('@/organisms/Collections/CollectionCard/CollectionCard.skeleton', () => ({
  CollectionCardSkeleton: () => <div data-testid="collection-card-skeleton" />,
}));

const mockGetOrFetchStreamSlice = vi.mocked(StreamPostsController.getOrFetchStreamSlice);
const mockPrepareStreamForInitialLoad = vi.mocked(StreamPostsController.prepareStreamForInitialLoad);
const mockGetCachedLastPostTimestamp = vi.mocked(StreamPostsController.getCachedLastPostTimestamp);

const AUTHOR = 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy';
/** 27 bookmarks, newest first: 25 followed collections and two bookmarked posts (QA-6's QA6F account). */
const BOOKMARKED = Array.from({ length: 27 }, (_, index) => `${AUTHOR}:p${String(index + 1).padStart(2, '0')}`);
const POSTS = new Set([BOOKMARKED[10], BOOKMARKED[20]]);
/** Collections whose details the Home timeline cached before the Collections page was opened. */
const CACHED_BEFORE_VISIT = BOOKMARKED.slice(0, 7);

const detailsOf = (id: string): PostDetailsModelSchema => ({
  id,
  content: POSTS.has(id) ? 'a note' : JSON.stringify({ title: 'Collection', items: [] }),
  kind: POSTS.has(id) ? 'short' : 'collection',
  indexed_at: 1,
  attachments: null,
  uri: `pubky://${AUTHOR}/pub/social/v1/posts/${id.split(':')[1]}`,
});

/** The Bookmarks card beside the section: its count is a live query too (`useBookmarksCollectionSummary`). */
function BookmarksCardCount() {
  const count = useLiveQuery(() => BookmarkController.getCount(), []);
  return <output data-testid="bookmark-count">{count}</output>;
}

/** A rendered card's tag counts (`usePostTags`): one more live query per card on the page. */
function CardCounts({ id }: { id: string }) {
  useLiveQuery(() => PostController.getCounts({ compositeId: id }), [id]);
  return null;
}

function PageLiveQueries() {
  return (
    <>
      <BookmarksCardCount />
      {CACHED_BEFORE_VISIT.map((id) => (
        <CardCounts key={id} id={id} />
      ))}
    </>
  );
}

describe('FollowedCollections (live query against Dexie)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await db.initialize();
    await db.transaction('rw', [BookmarkModel.table, PostDetailsModel.table], async () => {
      await BookmarkModel.table.clear();
      await PostDetailsModel.table.clear();
      await BookmarkModel.table.bulkPut(BOOKMARKED.map((id, index) => ({ id, created_at: 1_000 - index })));
      await PostDetailsModel.table.bulkPut(CACHED_BEFORE_VISIT.map(detailsOf));
    });
    mockPrepareStreamForInitialLoad.mockResolvedValue(undefined);
    mockGetCachedLastPostTimestamp.mockResolvedValue(0);
    // The walk over `timeline:bookmarks:all`: each slice hydrates the details of the posts it names
    // (what `by_ids` + `persistPosts` do) and reports the posts the bookmarks feed shows.
    mockGetOrFetchStreamSlice.mockImplementation(async ({ lastPostId }) => {
      const start = lastPostId === undefined ? 0 : BOOKMARKED.indexOf(lastPostId) + 1;
      const slice = BOOKMARKED.slice(start, start + COLLECTIONS_SECTION_PAGE_SIZE);
      await PostDetailsModel.table.bulkPut(slice.map(detailsOf));
      return asOpaque<TReadPostStreamChunkResponse>({
        nextPageIds: slice.filter((id) => POSTS.has(id)),
        reachedEnd: start + slice.length >= BOOKMARKED.length,
        lastRawPostId: slice[slice.length - 1],
        rawScannedCount: slice.length,
      });
    });
  });

  // Two slices under Strict Mode plus two live waits: its own budget, above vitest's 5 s default.
  it(
    'shows every collection the cold walk hydrates while the rest of the page reads live too',
    { timeout: 10_000 },
    async () => {
      render(
        <StrictMode>
          <PageLiveQueries />
          <FollowedCollections />
        </StrictMode>,
      );

      // The walk hydrates the other 20 bookmarks in two slices; the live queries must follow the details
      // they write: a full window of collections, the two posts counted.
      await waitFor(
        () => expect(screen.getAllByTestId('collection-card')).toHaveLength(COLLECTIONS_SECTION_PAGE_SIZE),
        {
          timeout: 4_000,
        },
      );
      expect(mockGetOrFetchStreamSlice).toHaveBeenCalledTimes(2);
      // 25 followed collections, 20 shown: the rest sits behind Show more.
      expect(screen.getByText('Show more')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('bookmark-count')).toHaveTextContent(String(POSTS.size)));
    },
  );
});
