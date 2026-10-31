import { liveQuery } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import { db } from '@/database/franky/franky';
import { HttpMethod } from '@/libs/http/http.types';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { type PostStreamId, PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { asInvalid } from '@/test-utils/type-assertions';

// Test data
const testData = {
  userPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  postId: 'abc123xyz',
  get compositePostId() {
    return buildCompositeId({ pubky: this.authorPubky, id: this.postId });
  },
};
const STREAM = PostStreamTypes.TIMELINE_BOOKMARKS_ALL as PostStreamId;

// Helper functions
const createBookmarkParams = () => ({ postId: testData.compositePostId });
const otherPost = (id: string) => buildCompositeId({ pubky: testData.authorPubky, id });

const getSavedBookmark = async () => {
  return await BookmarkModel.table.get(testData.compositePostId);
};

const getStream = async () => {
  return await PostStreamModel.table.get(STREAM);
};

const setupExistingBookmark = async () => {
  await BookmarkModel.upsert({
    id: testData.compositePostId,
    created_at: Date.now(),
  });
};

const setupPostDetails = async (
  kind: 'short' | 'long' | 'image' | 'video' | 'file' | 'link' | 'collection',
  postId: string = testData.compositePostId,
) => {
  await PostDetailsModel.upsert({
    id: postId,
    content: 'Test post content',
    kind,
    indexed_at: Date.now(),
    attachments: null,
    uri: `pubky://${testData.authorPubky}/pub/social/v1/posts/${testData.postId}`,
  });
};

describe('LocalBookmarkService', () => {
  beforeEach(async () => {
    await db.initialize();
    await db.transaction(
      'rw',
      [BookmarkModel.table, UserCountsModel.table, PostStreamModel.table, PostDetailsModel.table],
      async () => {
        await BookmarkModel.table.clear();
        await UserCountsModel.table.clear();
        await PostStreamModel.table.clear();
        await PostDetailsModel.table.clear();
      },
    );
  });

  describe('persist with PUT action (create)', () => {
    it('should create a new bookmark', async () => {
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const savedBookmark = await getSavedBookmark();
      expect(savedBookmark).toBeTruthy();
      expect(savedBookmark!.id).toBe(testData.compositePostId);
      expect(savedBookmark!.created_at).toBeGreaterThan(0);
    });

    it('should ignore if post is already bookmarked', async () => {
      await setupExistingBookmark();
      const firstBookmark = await getSavedBookmark();

      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const secondBookmark = await getSavedBookmark();
      expect(secondBookmark!.created_at).toBe(firstBookmark!.created_at); // Should remain unchanged
    });

    it('never touches the Nexus user counts: bookmarks are counted locally', async () => {
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      expect(await UserCountsModel.table.count()).toBe(0);
    });

    it.each(['short', 'image', 'collection'] as const)(
      'prepends a bookmarked %s post to the one bookmarks stream',
      async (kind) => {
        await setupPostDetails(kind);
        await LocalStreamPostsService.prependToStream({ streamId: STREAM, compositePostId: otherPost('older') });

        await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

        expect((await getStream())!.stream).toEqual([testData.compositePostId, otherPost('older')]);
      },
    );

    it('bookmarks a post whose details are not cached yet', async () => {
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      expect((await getStream())!.stream).toEqual([testData.compositePostId]);
    });
  });

  describe('persist with DELETE action (delete)', () => {
    beforeEach(async () => {
      await setupExistingBookmark();
      await setupPostDetails('short');
      await LocalStreamPostsService.prependToStream({
        streamId: STREAM,
        compositePostId: testData.compositePostId,
      });
    });

    it('should delete bookmark from database', async () => {
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const savedBookmark = await getSavedBookmark();
      expect(savedBookmark).toBeUndefined();
    });

    it.each(['short', 'collection'] as const)('removes an un-bookmarked %s post from the stream', async (kind) => {
      await setupPostDetails(kind);

      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      expect((await getStream())!.stream).not.toContain(testData.compositePostId);
    });

    it('should ignore if post is not bookmarked', async () => {
      await BookmarkModel.table.clear();

      // Should not throw
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const savedBookmark = await getSavedBookmark();
      expect(savedBookmark).toBeUndefined();
    });
  });

  describe('reconcile', () => {
    it('replaces the rows with the listed ones and rewrites the stream newest first, without a cursor', async () => {
      await BookmarkModel.upsert({ id: otherPost('stale'), created_at: 5 });
      await PostStreamModel.upsert(STREAM, [otherPost('stale')], { tailCursor: 42 });
      const since = LocalBookmarkService.captureWriteSequence();

      const ids = await LocalBookmarkService.reconcile({
        bookmarks: [
          { id: otherPost('a'), created_at: 10 },
          { id: otherPost('b'), created_at: 30 },
          { id: otherPost('c'), created_at: 20 },
        ],
        since,
      });

      expect(ids).toEqual([otherPost('b'), otherPost('c'), otherPost('a')]);
      expect(await BookmarkModel.findAll()).not.toContain(otherPost('stale'));
      expect(await getStream()).toEqual({ id: STREAM, stream: ids });
    });

    it('keeps the local state of a post written after the listing started', async () => {
      const since = LocalBookmarkService.captureWriteSequence();
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: otherPost('new') });

      const ids = await LocalBookmarkService.reconcile({ bookmarks: [{ id: otherPost('a'), created_at: 1 }], since });

      expect(ids).toContain(otherPost('new'));
      expect(await getStream()).toMatchObject({ stream: [otherPost('new'), otherPost('a')] });
    });

    it('does not bring back a post un-bookmarked after the listing started', async () => {
      await LocalBookmarkService.persist(HttpMethod.PUT, { postId: otherPost('gone') });
      const since = LocalBookmarkService.captureWriteSequence();
      await LocalBookmarkService.persist(HttpMethod.DELETE, { postId: otherPost('gone') });

      const ids = await LocalBookmarkService.reconcile({
        bookmarks: [{ id: otherPost('gone'), created_at: 1 }],
        since,
      });

      expect(ids).toEqual([]);
      expect(await LocalBookmarkService.exists(otherPost('gone'))).toBe(false);
    });

    it('writes nothing when the account is no longer current', async () => {
      await setupExistingBookmark();

      const ids = await LocalBookmarkService.reconcile({
        bookmarks: [{ id: otherPost('a'), created_at: 1 }],
        since: LocalBookmarkService.captureWriteSequence(),
        isCurrent: () => false,
      });

      expect(ids).toBeNull();
      expect(await BookmarkModel.findAll()).toEqual([testData.compositePostId]);
      expect(await getStream()).toBeUndefined();
    });
  });

  describe('countPosts', () => {
    it('counts every bookmark but the collections, posts without cached details included', async () => {
      await Promise.all(
        ['a', 'b', 'c', 'd'].map((id) => LocalBookmarkService.persist(HttpMethod.PUT, { postId: otherPost(id) })),
      );
      await setupPostDetails('short', otherPost('a'));
      await setupPostDetails('collection', otherPost('b'));
      await setupPostDetails('long', otherPost('c'));

      await expect(LocalBookmarkService.countPosts()).resolves.toBe(3);
    });

    it('is zero without bookmarks', async () => {
      await expect(LocalBookmarkService.countPosts()).resolves.toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true if post is bookmarked', async () => {
      await setupExistingBookmark();

      const exists = await LocalBookmarkService.exists(testData.compositePostId);
      expect(exists).toBe(true);
    });

    it('should return false if post is not bookmarked', async () => {
      // Use a different post ID to ensure no collision with previous test
      const nonExistentPostId = 'nonexistent:post123';
      const exists = await LocalBookmarkService.exists(nonExistentPostId);
      expect(exists).toBe(false);
    });
  });

  describe('getAllBookmarks', () => {
    it('should return all bookmarked post IDs', async () => {
      const postId1 = 'author1:post1';
      const postId2 = 'author2:post2';
      const postId3 = 'author3:post3';

      await BookmarkModel.upsert({ id: postId1, created_at: Date.now() });
      await BookmarkModel.upsert({ id: postId2, created_at: Date.now() });
      await BookmarkModel.upsert({ id: postId3, created_at: Date.now() });

      const bookmarks = await LocalBookmarkService.getAllBookmarks();
      expect(bookmarks).toHaveLength(3);
      expect(bookmarks).toContain(postId1);
      expect(bookmarks).toContain(postId2);
      expect(bookmarks).toContain(postId3);
    });

    it('should return empty array when no bookmarks exist', async () => {
      const bookmarks = await LocalBookmarkService.getAllBookmarks();
      expect(bookmarks).toEqual([]);
    });
  });

  describe('getAllBookmarksSorted', () => {
    it('returns bookmark IDs sorted by created_at descending (newest first)', async () => {
      const olderId = 'author1:p-older';
      const middleId = 'author2:p-middle';
      const newerId = 'author3:p-newer';

      await BookmarkModel.upsert({ id: olderId, created_at: 1000 });
      await BookmarkModel.upsert({ id: middleId, created_at: 2000 });
      await BookmarkModel.upsert({ id: newerId, created_at: 3000 });

      const sorted = await LocalBookmarkService.getAllBookmarksSorted();

      expect(sorted).toEqual([newerId, middleId, olderId]);
    });

    it('returns an empty array when no bookmarks exist', async () => {
      const sorted = await LocalBookmarkService.getAllBookmarksSorted();
      expect(sorted).toEqual([]);
    });

    it('includes rows missing a numeric created_at (treated as oldest)', async () => {
      // Regression guard for the "FollowedCollections empty while Discover shows
      // Unfollow" bug: an index-based reverse-cursor silently drops rows whose
      // indexed key is undefined. The full-table-scan implementation must keep
      // them visible (sorted to the tail).
      const withTime = 'authorA:p-with-time';
      const noTimeA = 'authorB:p-no-time-a';
      const noTimeB = 'authorC:p-no-time-b';

      await BookmarkModel.upsert({ id: withTime, created_at: 5000 });
      // Force `created_at` to undefined to simulate historically-bad writes.
      await BookmarkModel.table.put({ id: noTimeA, created_at: asInvalid<number>(undefined) });
      await BookmarkModel.table.put({ id: noTimeB, created_at: asInvalid<number>(undefined) });

      const sorted = await LocalBookmarkService.getAllBookmarksSorted();

      expect(sorted).toHaveLength(3);
      expect(sorted[0]).toBe(withTime);
      expect(sorted.slice(1).sort()).toEqual([noTimeA, noTimeB].sort());
    });
  });

  describe('BookmarkController.getAll — liveQuery reactivity', () => {
    // Regression guard for the FollowedCollections / DiscoverCollections live
    // queries: those sections wrap `BookmarkController.getAll()` in
    // `useLiveQuery(...)`, which only re-runs when Dexie's table-observation
    // proxy is hit on the same Dexie instance the query subscribes to.
    //
    // The call path goes Controller → Application → Service → Model.table.toArray().
    // If any future refactor adds an `await` that breaks out of the Dexie
    // async-context (e.g. a `fetch` round-trip in the middle), the live query
    // would silently stop reacting to bookmark writes — cards would stop
    // appearing in Followed / disappearing from Discover until a manual
    // reload. These tests fail loudly in that scenario.

    const waitForEmission = <T>(promise: Promise<T>, timeoutMs = 1000): Promise<T> =>
      Promise.race<T>([
        promise,
        new Promise<T>((_resolve, reject) =>
          setTimeout(() => reject(new Error(`liveQuery emission timed out after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);

    it('emits initial value on subscription', async () => {
      const observable = liveQuery(() => BookmarkController.getAll());

      const first = await waitForEmission(
        new Promise<string[]>((resolve, reject) => {
          const sub = observable.subscribe({
            next: (value) => {
              sub.unsubscribe();
              resolve(value);
            },
            error: reject,
          });
        }),
      );

      expect(first).toEqual([]);
    });

    it('re-emits when a bookmark is added', async () => {
      const observable = liveQuery(() => BookmarkController.getAll());
      const emissions: string[][] = [];

      // Capture the first emission, then write, then capture the second.
      const secondEmission = new Promise<string[]>((resolve, reject) => {
        const sub = observable.subscribe({
          next: (value) => {
            emissions.push(value);
            if (emissions.length === 2) {
              sub.unsubscribe();
              resolve(value);
            }
          },
          error: reject,
        });
      });

      // Wait for the initial emission before writing so the observer is
      // primed and any subsequent table mutation triggers a re-run.
      await waitForEmission(
        new Promise<void>((resolve) => {
          const check = () => (emissions.length >= 1 ? resolve() : setTimeout(check, 5));
          check();
        }),
      );

      const newId = 'authorA:p-live-1';
      await BookmarkModel.upsert({ id: newId, created_at: 1000 });

      const next = await waitForEmission(secondEmission);
      expect(next).toContain(newId);
    });

    it('re-emits when a bookmark is deleted', async () => {
      const seedId = 'authorB:p-live-2';
      await BookmarkModel.upsert({ id: seedId, created_at: 2000 });

      const observable = liveQuery(() => BookmarkController.getAll());
      const emissions: string[][] = [];

      const secondEmission = new Promise<string[]>((resolve, reject) => {
        const sub = observable.subscribe({
          next: (value) => {
            emissions.push(value);
            if (emissions.length === 2) {
              sub.unsubscribe();
              resolve(value);
            }
          },
          error: reject,
        });
      });

      await waitForEmission(
        new Promise<void>((resolve) => {
          const check = () => (emissions.length >= 1 ? resolve() : setTimeout(check, 5));
          check();
        }),
      );

      await BookmarkModel.table.delete(seedId);

      const next = await waitForEmission(secondEmission);
      expect(next).not.toContain(seedId);
    });
  });
});
