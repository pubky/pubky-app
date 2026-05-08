import { beforeEach, describe, expect, it } from 'vitest';
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
    following: 0,
    followers: 0,
    friends: 0,
  });
};

const setupPostDetails = async (
  kind: 'short' | 'long' | 'image' | 'video' | 'file' | 'link',
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

    it('should add post to TIMELINE_BOOKMARKS_ALL stream', async () => {
      await setupPostDetails('short');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add short post to TIMELINE_BOOKMARKS_SHORT stream', async () => {
      await setupPostDetails('short');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_SHORT);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add long post to TIMELINE_BOOKMARKS_LONG stream', async () => {
      await setupPostDetails('long');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_LONG);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add image post to TIMELINE_BOOKMARKS_IMAGE stream', async () => {
      await setupPostDetails('image');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add video post to TIMELINE_BOOKMARKS_VIDEO stream', async () => {
      await setupPostDetails('video');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add file post to TIMELINE_BOOKMARKS_FILE stream', async () => {
      await setupPostDetails('file');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_FILE);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add link post to TIMELINE_BOOKMARKS_LINK stream', async () => {
      await setupPostDetails('link');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const stream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_LINK);
      expect(stream).toBeTruthy();
      expect(stream!.stream).toContain(testData.compositePostId);
    });

    it('should add post to only ALL and kind-based stream', async () => {
      await setupPostDetails('image');
      await LocalBookmarkService.persist(HttpMethod.PUT, createBookmarkParams());

      const allStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
      const imageStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE);
      const shortStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_SHORT);

      expect(allStream!.stream).toContain(testData.compositePostId);
      expect(imageStream!.stream).toContain(testData.compositePostId);
      expect(shortStream).toBeUndefined(); // Should not be in short stream
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

    it('should remove post from all and kind-specific bookmark streams', async () => {
      await LocalStreamPostsService.prependToStream({
        streamId: PostStreamTypes.TIMELINE_BOOKMARKS_SHORT,
        compositePostId: testData.compositePostId,
      });

      await LocalBookmarkService.persist(HttpMethod.DELETE, createBookmarkParams());

      const allStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_ALL);
      const shortStream = await getStream(PostStreamTypes.TIMELINE_BOOKMARKS_SHORT);

      expect(allStream!.stream).not.toContain(testData.compositePostId);
      expect(shortStream!.stream).not.toContain(testData.compositePostId);
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
});
