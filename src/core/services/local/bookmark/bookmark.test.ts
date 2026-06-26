import { liveQuery } from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { BookmarkController } from '@/controllers/bookmark/bookmark';
import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
import { db } from '@/database/franky/franky';
import { HttpMethod } from '@/libs/http/http.types';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
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

// Helper functions
const createBookmarkParams = (): TBookmarkEventParams => ({
  userId: testData.userPubky,
  postId: testData.compositePostId,
});

const getSavedBookmark = async () => {
  return await BookmarkModel.table.get(testData.compositePostId);
};

const getUserCounts = async (userId: Pubky) => {
  return await UserCountsModel.table.get(userId);
};

const getStream = async (streamId: PostStreamTypes) => {
  return await PostStreamModel.table.get(streamId);
};

const setupExistingBookmark = async () => {
  await BookmarkModel.upsert({
    id: testData.compositePostId,
    created_at: Date.now(),
  });
};

const setupUserCounts = async (userId: Pubky, bookmarks: number = 0) => {
  await UserCountsModel.upsert({
    id: userId,
    bookmarks,
    tagged: 0,
    tags: 0,
    unique_tags: 0,
    posts: 0,
    replies: 0,
    collections: 0,
    following: 0,
    followers: 0,
    friends: 0,
  });
};

const setupPostDetails = async (
  kind: 'short' | 'long' | 'image' | 'video' | 'file' | 'link' | 'collection',
  attachments?: string[] | null,
  content?: string,
) => {
  await PostDetailsModel.upsert({
    id: testData.compositePostId,
    content: content || 'Test post content',
    kind,
    indexed_at: Date.now(),
    attachments: attachments ?? null,
    uri: `pubky://${testData.authorPubky}/pub/pubky.app/posts/${testData.postId}`,
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
      await setupUserCounts(testData.userPubky, 0);
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

    it('should increment user bookmarks count when creating bookmark', async () => {
      await setupUserCounts(testData.userPubky, 0);
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(1);
    });

    it('should increment user bookmarks count from existing value', async () => {
      await setupUserCounts(testData.userPubky, 5);
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(6);
    });

    it('should NOT increment bookmarks count when bookmarking a collection', async () => {
      // The `bookmarks` count is posts-only — bookmarked collections are excluded.
      await setupUserCounts(testData.userPubky, 5);
      await setupPostDetails('collection');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      // The bookmark itself is still recorded, but the count must not move.
      expect(await getSavedBookmark()).toBeTruthy();
      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(5);
    });

    it('should add post to TIMELINE_BOOKMARKS_ALL stream', async () => {
      await setupPostDetails('short');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add a non-collection post to ONLY the ALL stream', async () => {
      // Kind-specific bookmark streams were removed with the legacy filter UI;
      // every non-collection bookmark now lives only in the ALL feed stream.
      await setupPostDetails('image');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const allStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
      const collectionStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_COLLECTION);

      expect(allStream!.stream).toContain(testData.compositePostId);
      expect(collectionStream).toBeUndefined(); // non-collection posts never touch the collection stream
    });

    it('should add a bookmarked collection to the COLLECTION stream and NOT the ALL stream', async () => {
      // Collections are "followed", not feed posts: they belong in the collection
      // bookmark stream, not the posts feed (ALL) stream that filters them out anyway.
      await setupPostDetails('collection');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const collectionStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_COLLECTION);
      const allStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);

      expect(collectionStream!.stream).toContain(testData.compositePostId);
      expect(allStream).toBeUndefined(); // must not pollute the posts feed stream
    });

    it('should not update counts when post is already bookmarked', async () => {
      await setupExistingBookmark();
      await setupUserCounts(testData.userPubky, 5);
      await setupPostDetails('short');

      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(5); // Should remain unchanged
    });
  });

  describe('persist with DELETE action (delete)', () => {
    beforeEach(async () => {
      await setupExistingBookmark();
      await setupPostDetails('short');
      await LocalStreamPostsService.prependToStream({
        streamId: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
        compositePostId: testData.compositePostId,
      });
    });

    it('should delete bookmark from database', async () => {
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const savedBookmark = await getSavedBookmark();
      expect(savedBookmark).toBeUndefined();
    });

    it('should decrement user bookmarks count when deleting bookmark', async () => {
      await setupUserCounts(testData.userPubky, 1);
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(0);
    });

    it('should decrement user bookmarks count from existing value', async () => {
      await setupUserCounts(testData.userPubky, 10);
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(9);
    });

    it('should NOT decrement bookmarks count when un-bookmarking a collection', async () => {
      // Collections never moved the posts-only `bookmarks` count, so removing
      // a collection bookmark must not move it either.
      await setupUserCounts(testData.userPubky, 10);
      await setupPostDetails('collection'); // overwrite the 'short' details from beforeEach
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      expect(await getSavedBookmark()).toBeUndefined();
      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(10);
    });

    it('should remove a non-collection post from the ALL bookmark stream', async () => {
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const allStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
      expect(allStream!.stream).not.toContain(testData.compositePostId);
    });

    it('should remove an un-bookmarked collection from the COLLECTION stream', async () => {
      await setupPostDetails('collection'); // overwrite the 'short' details from beforeEach
      await LocalStreamPostsService.prependToStream({
        streamId: PostStreamTypes.TIMELINE_BOOKMARKS_COLLECTION,
        compositePostId: testData.compositePostId,
      });

      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const collectionStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_COLLECTION);
      expect(collectionStream?.stream ?? []).not.toContain(testData.compositePostId);
    });

    it('should ignore if post is not bookmarked', async () => {
      await BookmarkModel.table.clear();

      // Should not throw
      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const savedBookmark = await getSavedBookmark();
      expect(savedBookmark).toBeUndefined();
    });

    it('should not update counts when post is not bookmarked', async () => {
      await BookmarkModel.table.clear();
      await setupUserCounts(testData.userPubky, 5);

      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const userCounts = await getUserCounts(testData.userPubky);
      expect(userCounts!.bookmarks).toBe(5); // Should remain unchanged
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
