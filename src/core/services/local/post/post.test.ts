import { PubkyAppPost, PubkyAppPostEmbed, PubkyAppPostKind } from 'pubky-app-specs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { buildCompositeId, parseCompositeId } from '@/models/models.utils';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import type { PostCountsModelSchema } from '@/models/post/counts/postCounts.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { DELETED } from '@/models/post/details/postDetails.constants';
import type { PostDetailsModelSchema } from '@/models/post/details/postDetails.schema';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import type { PostRelationshipsModelSchema } from '@/models/post/relationships/postRelationships.schema';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import {
  buildAuthorCollectionsStreamId,
  buildSortedAuthorStreamId,
  type PostStreamId,
  PostStreamTypes,
} from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UnreadPostStreamModel } from '@/models/stream/post/tables/postStream.unread';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import type { UserCountsModelSchema } from '@/models/user/counts/userCounts.schema';
import { LocalPostService } from '@/services/local/post/post';
import type { TLocalSavePostParams } from '@/services/local/post/post.types';
import { StreamSorting } from '@/services/nexus/nexus.types';
import { StreamKind } from '@/services/nexus/stream/posts/postStream.types';

// Test data
const testData = {
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  postId1: 'abc123xyz',
  get fullPostId1() {
    return buildCompositeId({ pubky: this.authorPubky, id: this.postId1 });
  },
};

// Helper functions
const createSaveParams = (
  content: string,
  compositePostId?: string,
  kind: PubkyAppPostKind = PubkyAppPostKind.Short,
): TLocalSavePostParams => {
  return {
    compositePostId: compositePostId || testData.fullPostId1,
    post: new PubkyAppPost(content, kind, undefined, undefined, undefined),
  };
};

const getSavedPost = async (postId: string) => {
  return await PostDetailsModel.table.get(postId);
};

const getSavedCounts = async (postId: string) => {
  return await PostCountsModel.table.get(postId);
};

const getSavedRelationships = async (postId: string) => {
  return await PostRelationshipsModel.table.get(postId);
};

const getSavedTags = async (postId: string) => {
  return await PostTagsModel.table.get(postId);
};

const getPostTtl = async (postId: string) => {
  return await PostTtlModel.findById(postId);
};

const setupExistingPost = async (postId: string, content: string, parentUri?: string, kind: string = 'short') => {
  const { pubky, id: postIdPart } = parseCompositeId(postId);
  const postDetails: PostDetailsModelSchema = {
    id: postId,
    content,
    indexed_at: Date.now(),
    kind,
    uri: `pubky://${pubky}/pub/pubky.app/posts/${postIdPart}`,
    attachments: null,
  };

  const postCounts: PostCountsModelSchema = {
    id: postId,
    tags: 0,
    unique_tags: 0,
    replies: 0,
    reposts: 0,
  };

  const postRelationships: PostRelationshipsModelSchema = {
    id: postId,
    replied: parentUri || null,
    reposted: null,
    mentioned: [],
  };

  await PostDetailsModel.table.add(postDetails);
  await PostCountsModel.table.add(postCounts);
  await PostRelationshipsModel.table.add(postRelationships);
  await PostTagsModel.create({ id: postId, tags: [] });
};

const setupUserCounts = async (userId: Pubky) => {
  const userCounts: UserCountsModelSchema = {
    id: userId,
    tagged: 0,
    tags: 0,
    unique_tags: 0,
    posts: 0,
    replies: 0,
    following: 0,
    followers: 0,
    friends: 0,
    collections: 0,
    bookmarks: 0,
  };
  await UserCountsModel.table.add(userCounts);
};

describe('LocalPostService', () => {
  beforeEach(async () => {
    await db.initialize();
    await db.transaction(
      'rw',
      [
        PostDetailsModel.table,
        PostCountsModel.table,
        PostRelationshipsModel.table,
        PostTagsModel.table,
        UserCountsModel.table,
        PostStreamModel.table,
        PostTtlModel.table,
      ],
      async () => {
        await PostDetailsModel.table.clear();
        await PostCountsModel.table.clear();
        await PostRelationshipsModel.table.clear();
        await PostTagsModel.table.clear();
        await UserCountsModel.table.clear();
        await PostStreamModel.table.clear();
        await PostTtlModel.table.clear();
      },
    );
  });

  describe('create', () => {
    it('should save post with all related models initialized', async () => {
      await setupUserCounts(testData.authorPubky);
      const userCountsSpy = vi.spyOn(UserCountsModel, 'updateCounts');

      await LocalPostService.create(createSaveParams('Hello, world!'));

      const [details, counts, relationships, tags] = await Promise.all([
        getSavedPost(testData.fullPostId1),
        getSavedCounts(testData.fullPostId1),
        getSavedRelationships(testData.fullPostId1),
        getSavedTags(testData.fullPostId1),
      ]);

      expect(details).toBeTruthy();
      expect(details!.content).toBe('Hello, world!');
      expect(details!.kind).toBe('short');

      expect(counts).toBeTruthy();
      expect(counts!.tags).toBe(0);
      expect(counts!.replies).toBe(0);
      expect(counts!.reposts).toBe(0);

      expect(tags).toBeTruthy();
      expect(tags!.tags).toEqual([]);

      expect(relationships).toBeTruthy();
      expect(relationships!.replied).toBeNull();
      expect(relationships!.reposted).toBeNull();

      // Verify user count increment for root post (single update call)
      expect(userCountsSpy).toHaveBeenCalledWith({
        userId: testData.authorPubky,
        countChanges: { posts: 1, replies: 0, collections: 0 },
      });

      userCountsSpy.mockRestore();
    });

    it('should increment parent reply count when creating a reply', async () => {
      const parentPostId = 'parent:post123';
      const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

      await setupExistingPost(parentPostId, 'Parent post');
      await setupUserCounts(testData.authorPubky);

      const userCountsSpy = vi.spyOn(UserCountsModel, 'updateCounts');

      const baseParams = createSaveParams('This is a reply', testData.fullPostId1);
      const saveParams: TLocalSavePostParams = {
        ...baseParams,
        post: new PubkyAppPost(baseParams.post.content, PubkyAppPostKind.Short, parentUri, undefined, undefined),
      };

      await LocalPostService.create(saveParams);

      const parentCounts = await getSavedCounts(parentPostId);
      expect(parentCounts!.replies).toBe(1);

      // Verify user count increments for reply (single update call)
      expect(userCountsSpy).toHaveBeenCalledWith({
        userId: testData.authorPubky,
        countChanges: { posts: 1, replies: 1, collections: 0 },
      });

      userCountsSpy.mockRestore();
    });

    it('should increment posts and collections counts when creating a collection', async () => {
      await setupUserCounts(testData.authorPubky);
      const userCountsSpy = vi.spyOn(UserCountsModel, 'updateCounts');

      const baseParams = createSaveParams('My collection');
      const saveParams: TLocalSavePostParams = {
        ...baseParams,
        post: new PubkyAppPost(baseParams.post.content, PubkyAppPostKind.Collection, undefined, undefined, undefined),
      };

      await LocalPostService.create(saveParams);

      // A collection bumps both the total `posts` count and the dedicated
      // `collections` count (the sidebar subtracts collections back out).
      expect(userCountsSpy).toHaveBeenCalledWith({
        userId: testData.authorPubky,
        countChanges: { posts: 1, replies: 0, collections: 1 },
      });

      userCountsSpy.mockRestore();
    });

    it('should handle reply creation when parent post does not exist', async () => {
      const parentUri = `pubky://nonexistent/pub/pubky.app/posts/missing123`;

      const baseParams = createSaveParams('Reply to missing parent', testData.fullPostId1);
      const saveParams: TLocalSavePostParams = {
        ...baseParams,
        post: new PubkyAppPost(baseParams.post.content, PubkyAppPostKind.Short, parentUri, undefined, undefined),
      };

      // Should not throw - just silently skips incrementing non-existent parent
      await expect(LocalPostService.create(saveParams)).resolves.not.toThrow();

      const savedPost = await getSavedPost(testData.fullPostId1);
      expect(savedPost).toBeTruthy();
      expect(savedPost!.content).toBe('Reply to missing parent');
    });

    it('should handle long-form posts', async () => {
      const saveParams = createSaveParams(
        'This is a long-form post with more content',
        undefined,
        PubkyAppPostKind.Long,
      );

      await LocalPostService.create(saveParams);

      const savedPost = await getSavedPost(testData.fullPostId1);
      expect(savedPost!.kind).toBe('long');
    });

    it('should write atomically across tables (rollback on error)', async () => {
      // Arrange: spy to throw on PostTagsModel.create
      const spy = vi.spyOn(PostTagsModel, 'create').mockRejectedValueOnce(new Error('Simulated failure'));
      const params = createSaveParams('Atomic write test');

      try {
        // Act + Assert
        await expect(LocalPostService.create(params)).rejects.toThrow('Failed to save post');

        // Validate no partial data remains
        const [details, counts, relationships, tags] = await Promise.all([
          getSavedPost(testData.fullPostId1),
          getSavedCounts(testData.fullPostId1),
          getSavedRelationships(testData.fullPostId1),
          getSavedTags(testData.fullPostId1),
        ]);

        expect(details).toBeUndefined();
        expect(counts).toBeUndefined();
        expect(relationships).toBeUndefined();
        expect(tags).toBeUndefined();
      } finally {
        spy.mockRestore();
      }
    });

    it('should throw WRITE_FAILED error on failure', async () => {
      // Force a failure early
      const originalCreate = PostDetailsModel.create;
      vi.spyOn(PostDetailsModel, 'create').mockRejectedValueOnce(new Error('boom'));

      const params = createSaveParams('Will fail');
      await expect(LocalPostService.create(params)).rejects.toMatchObject({
        name: 'AppError',
        code: 'WRITE_FAILED',
        message: 'Failed to save post',
      });

      // Restore
      vi.spyOn(PostDetailsModel, 'create').mockImplementation(originalCreate);
    });

    it('should touch post TTL when creating a root post', async () => {
      await setupUserCounts(testData.authorPubky);

      const beforeTimestamp = Date.now();
      await LocalPostService.create(createSaveParams('Hello, world!'));
      const afterTimestamp = Date.now();

      const postTtl = await getPostTtl(testData.fullPostId1);
      expect(postTtl).toBeTruthy();
      expect(postTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(postTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should touch TTL for both reply and parent post when creating a reply', async () => {
      const parentPostId = 'parent:post123';
      const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

      await setupExistingPost(parentPostId, 'Parent post');
      await setupUserCounts(testData.authorPubky);

      const baseParams = createSaveParams('This is a reply', testData.fullPostId1);
      const saveParams: TLocalSavePostParams = {
        ...baseParams,
        post: new PubkyAppPost(baseParams.post.content, PubkyAppPostKind.Short, parentUri, undefined, undefined),
      };

      const beforeTimestamp = Date.now();
      await LocalPostService.create(saveParams);
      const afterTimestamp = Date.now();

      // Reply post TTL should be touched
      const replyTtl = await getPostTtl(testData.fullPostId1);
      expect(replyTtl).toBeTruthy();
      expect(replyTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(replyTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);

      // Parent post TTL should be touched
      const parentTtl = await getPostTtl(parentPostId);
      expect(parentTtl).toBeTruthy();
      expect(parentTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(parentTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe('repost', () => {
    it('should create a repost with relationship to original post', async () => {
      const originalPostId = 'original:post123';
      const repostId = testData.fullPostId1;
      const originalUri = `pubky://original/pub/pubky.app/posts/post123`;

      // Setup original post
      await setupExistingPost(originalPostId, 'Original post content');

      // Create repost
      const saveParams: TLocalSavePostParams = {
        compositePostId: testData.fullPostId1,
        post: new PubkyAppPost(
          '',
          PubkyAppPostKind.Short,
          undefined,
          new PubkyAppPostEmbed(originalUri, PubkyAppPostKind.Short),
          undefined,
        ),
      };

      await LocalPostService.create(saveParams);

      const savedRelationships = await getSavedRelationships(repostId);
      expect(savedRelationships!.reposted).toBe(originalUri);
    });

    it('should increment original post repost count when creating repost', async () => {
      const originalPostId = 'original:post123';
      const originalUri = `pubky://original/pub/pubky.app/posts/post123`;

      // Setup original post
      await setupExistingPost(originalPostId, 'Original post');

      // Create repost
      const saveParams: TLocalSavePostParams = {
        compositePostId: testData.fullPostId1,
        post: new PubkyAppPost(
          '',
          PubkyAppPostKind.Short,
          undefined,
          new PubkyAppPostEmbed(originalUri, PubkyAppPostKind.Short),
          undefined,
        ),
      };

      await LocalPostService.create(saveParams);

      const originalCounts = await getSavedCounts(originalPostId);
      expect(originalCounts!.reposts).toBe(1);
    });

    it('should touch TTL for both repost and original post when creating a repost', async () => {
      const originalPostId = 'original:post123';
      const originalUri = `pubky://original/pub/pubky.app/posts/post123`;

      await setupExistingPost(originalPostId, 'Original post');
      await setupUserCounts(testData.authorPubky);

      const saveParams: TLocalSavePostParams = {
        compositePostId: testData.fullPostId1,
        post: new PubkyAppPost(
          '',
          PubkyAppPostKind.Short,
          undefined,
          new PubkyAppPostEmbed(originalUri, PubkyAppPostKind.Short),
          undefined,
        ),
      };

      const beforeTimestamp = Date.now();
      await LocalPostService.create(saveParams);
      const afterTimestamp = Date.now();

      // Repost TTL should be touched
      const repostTtl = await getPostTtl(testData.fullPostId1);
      expect(repostTtl).toBeTruthy();
      expect(repostTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(repostTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);

      // Original post TTL should be touched
      const originalTtl = await getPostTtl(originalPostId);
      expect(originalTtl).toBeTruthy();
      expect(originalTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(originalTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should create repost with content for quote reposts', async () => {
      const originalPostId = 'original:post123';
      const repostId = testData.fullPostId1;
      const originalUri = `pubky://original/pub/pubky.app/posts/post123`;
      const quoteContent = 'This is great!';

      // Setup original post
      await setupExistingPost(originalPostId, 'Original post');

      // Create quote repost
      const saveParams: TLocalSavePostParams = {
        compositePostId: testData.fullPostId1,
        post: new PubkyAppPost(
          quoteContent,
          PubkyAppPostKind.Short,
          undefined,
          new PubkyAppPostEmbed(originalUri, PubkyAppPostKind.Short),
          undefined,
        ),
      };

      await LocalPostService.create(saveParams);

      const savedPost = await getSavedPost(repostId);
      expect(savedPost!.content).toBe(quoteContent);
      expect(savedPost!.kind).toBe('short');

      const savedRelationships = await getSavedRelationships(repostId);
      expect(savedRelationships!.reposted).toBe(originalUri);
    });
  });

  describe('deletePost', () => {
    it('should delete post and all related records', async () => {
      const postId = testData.fullPostId1;

      await setupExistingPost(postId, 'Test post');
      await setupUserCounts(testData.authorPubky);

      const userCountsSpy = vi.spyOn(UserCountsModel, 'updateCounts');

      await LocalPostService.delete({
        compositePostId: postId,
      });

      const [details, counts, relationships, tags] = await Promise.all([
        getSavedPost(postId),
        getSavedCounts(postId),
        getSavedRelationships(postId),
        getSavedTags(postId),
      ]);

      // Hard-delete now leaves a `[DELETED]` tombstone in PostDetails so a
      // concurrent Nexus refetch (cache-miss path) can't reanimate the post.
      // All auxiliary records are still fully removed.
      expect(details).toBeTruthy();
      expect(details!.content).toBe(DELETED);
      expect(counts).toBeUndefined();
      expect(relationships).toBeUndefined();
      expect(tags).toBeUndefined();

      // Verify user count decrement for root post (single update call)
      expect(userCountsSpy).toHaveBeenCalledWith({
        userId: testData.authorPubky,
        countChanges: { posts: -1, replies: 0, collections: 0 },
      });

      userCountsSpy.mockRestore();
    });

    it('should decrement posts and collections counts when deleting a collection', async () => {
      const postId = testData.fullPostId1;

      await setupExistingPost(postId, 'My collection', undefined, 'collection');
      await setupUserCounts(testData.authorPubky);

      const userCountsSpy = vi.spyOn(UserCountsModel, 'updateCounts');

      await LocalPostService.delete({ compositePostId: postId });

      // Mirror the create path: a collection decrements both counts.
      expect(userCountsSpy).toHaveBeenCalledWith({
        userId: testData.authorPubky,
        countChanges: { posts: -1, replies: 0, collections: -1 },
      });

      userCountsSpy.mockRestore();
    });

    it('should handle delete when parent/original post no longer exists', async () => {
      const replyId = testData.fullPostId1;
      const parentUri = `pubky://nonexistent/pub/pubky.app/posts/missing123`;

      await setupExistingPost(replyId, 'Reply to deleted parent', parentUri);

      // Should not throw - just silently skips decrementing non-existent parent
      await expect(
        LocalPostService.delete({
          compositePostId: replyId,
        }),
      ).resolves.not.toThrow();

      const deletedPost = await getSavedPost(replyId);
      expect(deletedPost).toBeTruthy();
      expect(deletedPost!.content).toBe(DELETED);
    });

    it('should decrement parent reply count when deleting a reply', async () => {
      const parentPostId = 'parent:post123';
      const replyId = testData.fullPostId1;
      const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

      // Setup parent post
      await setupExistingPost(parentPostId, 'Parent post');
      await PostCountsModel.update(parentPostId, { replies: 1 });

      // Setup reply
      await setupExistingPost(replyId, 'Reply post', parentUri);
      await setupUserCounts(testData.authorPubky);

      const userCountsSpy = vi.spyOn(UserCountsModel, 'updateCounts');

      // Delete reply
      await LocalPostService.delete({
        compositePostId: replyId,
      });

      const parentCounts = await getSavedCounts(parentPostId);
      expect(parentCounts!.replies).toBe(0);

      // Verify user count decrements for reply (single update call)
      expect(userCountsSpy).toHaveBeenCalledWith({
        userId: testData.authorPubky,
        countChanges: { posts: -1, replies: -1, collections: 0 },
      });

      userCountsSpy.mockRestore();
    });

    it('should decrement original post repost count when deleting a repost', async () => {
      const originalPostId = 'original:post123';
      const repostId = testData.fullPostId1;
      const originalUri = `pubky://original/pub/pubky.app/posts/post123`;

      // Setup original post
      await setupExistingPost(originalPostId, 'Original post');
      await PostCountsModel.update(originalPostId, { reposts: 1 });

      // Setup repost
      await setupExistingPost(repostId, '');
      await PostRelationshipsModel.update(repostId, { reposted: originalUri });

      // Delete repost
      await LocalPostService.delete({
        compositePostId: repostId,
      });

      const originalCounts = await getSavedCounts(originalPostId);
      expect(originalCounts!.reposts).toBe(0);
    });

    it('should touch parent post TTL when deleting a reply', async () => {
      const parentPostId = 'parent:post123';
      const replyId = testData.fullPostId1;
      const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

      // Setup parent post
      await setupExistingPost(parentPostId, 'Parent post');
      await PostCountsModel.update(parentPostId, { replies: 1 });

      // Setup reply
      await setupExistingPost(replyId, 'Reply post', parentUri);
      await setupUserCounts(testData.authorPubky);

      const beforeTimestamp = Date.now();
      await LocalPostService.delete({ compositePostId: replyId });
      const afterTimestamp = Date.now();

      // Parent post TTL should be touched
      const parentTtl = await getPostTtl(parentPostId);
      expect(parentTtl).toBeTruthy();
      expect(parentTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(parentTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should touch original post TTL when deleting a repost', async () => {
      const originalPostId = 'original:post123';
      const repostId = testData.fullPostId1;
      const originalUri = `pubky://original/pub/pubky.app/posts/post123`;

      // Setup original post
      await setupExistingPost(originalPostId, 'Original post');
      await PostCountsModel.update(originalPostId, { reposts: 1 });

      // Setup repost
      await setupExistingPost(repostId, '');
      await PostRelationshipsModel.update(repostId, { reposted: originalUri });
      await setupUserCounts(testData.authorPubky);

      const beforeTimestamp = Date.now();
      await LocalPostService.delete({ compositePostId: repostId });
      const afterTimestamp = Date.now();

      // Original post TTL should be touched
      const originalTtl = await getPostTtl(originalPostId);
      expect(originalTtl).toBeTruthy();
      expect(originalTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(originalTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should not decrement counts below zero', async () => {
      const parentPostId = 'parent:post123';
      const replyId = testData.fullPostId1;
      const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

      // Setup with count already at 0
      await setupExistingPost(parentPostId, 'Parent post');
      await setupExistingPost(replyId, 'Reply post', parentUri);

      // Delete reply
      await LocalPostService.delete({
        compositePostId: replyId,
      });

      const parentCounts = await getSavedCounts(parentPostId);
      expect(parentCounts!.replies).toBe(0);
    });

    it('should handle deleting a post that is both a reply and a repost', async () => {
      const parentPostId = 'parent:post123';
      const originalPostId = 'original:post456';
      const postId = testData.fullPostId1;
      const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;
      const originalUri = `pubky://original/pub/pubky.app/posts/post456`;

      // Setup parent and original posts
      await setupExistingPost(parentPostId, 'Parent post');
      await PostCountsModel.update(parentPostId, { replies: 1 });
      await setupExistingPost(originalPostId, 'Original post');
      await PostCountsModel.update(originalPostId, { reposts: 1 });

      // Setup post that is both reply and repost
      await setupExistingPost(postId, 'Quote repost as reply', parentUri);
      await PostRelationshipsModel.update(postId, { reposted: originalUri });

      // Delete post
      await LocalPostService.delete({
        compositePostId: postId,
      });

      const parentCounts = await getSavedCounts(parentPostId);
      const originalCounts = await getSavedCounts(originalPostId);
      expect(parentCounts!.replies).toBe(0);
      expect(originalCounts!.reposts).toBe(0);
    });

    it('should rollback delete operation on transaction failure', async () => {
      const parentPostId = 'parent:post123';
      const replyId = testData.fullPostId1;
      const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

      // Setup parent and reply
      await setupExistingPost(parentPostId, 'Parent post');
      await PostCountsModel.update(parentPostId, { replies: 1 });
      await setupExistingPost(replyId, 'Reply post', parentUri);

      // Spy to force failure during transaction. The hard-delete branch
      // now tombstones via `PostDetailsModel.update` instead of `deleteById`,
      // so the rejection has to target `update` to exercise the rollback.
      const spy = vi.spyOn(PostDetailsModel, 'update').mockRejectedValueOnce(new Error('Simulated failure'));

      try {
        await expect(
          LocalPostService.delete({
            compositePostId: replyId,
          }),
        ).rejects.toThrow('Failed to delete post');

        // Verify rollback - all data should still exist
        const [details, counts, relationships, tags] = await Promise.all([
          getSavedPost(replyId),
          getSavedCounts(replyId),
          getSavedRelationships(replyId),
          getSavedTags(replyId),
        ]);

        expect(details).toBeTruthy();
        expect(counts).toBeTruthy();
        expect(relationships).toBeTruthy();
        expect(tags).toBeTruthy();

        // Parent count should not have been decremented
        const parentCounts = await getSavedCounts(parentPostId);
        expect(parentCounts!.replies).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });

    it('should soft delete post when it has replies (mark as DELETED)', async () => {
      const postId = testData.fullPostId1;
      await setupExistingPost(postId, 'Original post content');
      await setupUserCounts(testData.authorPubky);

      // Update counts to indicate post has replies
      await PostCountsModel.update(postId, { replies: 1 });

      // Delete should return true (soft delete)
      const result = await LocalPostService.delete({ compositePostId: postId });
      expect(result).toBe(true);

      // Post should still exist but with DELETED content
      const postDetails = await getSavedPost(postId);
      expect(postDetails).toBeTruthy();
      expect(postDetails!.content).toBe(DELETED);

      // All related records should still exist
      const [counts, relationships, tags] = await Promise.all([
        getSavedCounts(postId),
        getSavedRelationships(postId),
        getSavedTags(postId),
      ]);
      expect(counts).toBeTruthy();
      expect(relationships).toBeTruthy();
      expect(tags).toBeTruthy();
    });

    it('should soft delete post when it has reposts (mark as DELETED)', async () => {
      const postId = testData.fullPostId1;
      await setupExistingPost(postId, 'Original post content');
      await setupUserCounts(testData.authorPubky);

      // Update counts to indicate post has reposts
      await PostCountsModel.update(postId, { reposts: 5 });

      // Delete should return true (soft delete)
      const result = await LocalPostService.delete({ compositePostId: postId });
      expect(result).toBe(true);

      // Post should still exist but with DELETED content
      const postDetails = await getSavedPost(postId);
      expect(postDetails).toBeTruthy();
      expect(postDetails!.content).toBe(DELETED);
    });

    it('should soft delete post when it has tags (mark as DELETED)', async () => {
      const postId = testData.fullPostId1;
      await setupExistingPost(postId, 'Original post content');
      await setupUserCounts(testData.authorPubky);

      // Update counts to indicate post has tags
      await PostCountsModel.update(postId, { tags: 3 });

      // Delete should return true (soft delete)
      const result = await LocalPostService.delete({ compositePostId: postId });
      expect(result).toBe(true);

      // Post should still exist but with DELETED content
      const postDetails = await getSavedPost(postId);
      expect(postDetails).toBeTruthy();
      expect(postDetails!.content).toBe(DELETED);
    });

    it('should hard delete post when it has no links and leave a tombstone', async () => {
      const postId = testData.fullPostId1;
      await setupExistingPost(postId, 'Test post');
      await setupUserCounts(testData.authorPubky);

      // Delete should return false (hard delete branch)
      const result = await LocalPostService.delete({ compositePostId: postId });
      expect(result).toBe(false);

      // Post should be tombstoned (content === DELETED) rather than fully
      // removed, so a concurrent Nexus refetch can't reanimate it.
      const postDetails = await getSavedPost(postId);
      expect(postDetails).toBeTruthy();
      expect(postDetails!.content).toBe(DELETED);
    });

    it('should handle deleting non-existent post gracefully (idempotent)', async () => {
      const nonExistentPostId = 'nonexistent:post123';

      // Should not throw - delete is idempotent, returns false for hard delete path
      const result = await LocalPostService.delete({ compositePostId: nonExistentPostId });
      expect(result).toBe(false);
    });

    it('should short-circuit when the post is already tombstoned (no user-count drift)', async () => {
      const postId = testData.fullPostId1;
      await setupExistingPost(postId, 'Test post');
      await setupUserCounts(testData.authorPubky);

      // First delete: hard-delete path → tombstone, posts count decremented once.
      const firstResult = await LocalPostService.delete({ compositePostId: postId });
      expect(firstResult).toBe(false);
      const tombstone = await getSavedPost(postId);
      expect(tombstone!.content).toBe(DELETED);

      const userCountsSpy = vi.spyOn(UserCountsModel, 'updateCounts');
      try {
        // Second delete on the same tombstone must be a no-op: no transaction,
        // no further user-count decrement. Guards against double-decrementing
        // the author's post count if a stale page somehow re-fires delete.
        const secondResult = await LocalPostService.delete({ compositePostId: postId });
        expect(secondResult).toBe(false);
        expect(userCountsSpy).not.toHaveBeenCalled();

        const stillTombstone = await getSavedPost(postId);
        expect(stillTombstone!.content).toBe(DELETED);
      } finally {
        userCountsSpy.mockRestore();
      }
    });
  });

  describe('edit', () => {
    const existingAttachments = [
      `pubky://${testData.authorPubky}/pub/pubky.app/files/file1`,
      `pubky://${testData.authorPubky}/pub/pubky.app/files/file2`,
    ];

    const setupPostWithAttachments = async (kind = 'image') => {
      await setupExistingPost(testData.fullPostId1, 'Original content', undefined, kind);
      await PostDetailsModel.table.update(testData.fullPostId1, { attachments: existingAttachments });
    };

    it('should update content only, leaving attachments and kind untouched', async () => {
      await setupPostWithAttachments('image');

      await LocalPostService.edit({ compositePostId: testData.fullPostId1, content: 'Edited content' });

      const details = await getSavedPost(testData.fullPostId1);
      expect(details!.content).toBe('Edited content');
      expect(details!.attachments).toEqual(existingAttachments);
      expect(details!.kind).toBe('image');
    });

    it('should touch post TTL on every edit', async () => {
      await setupExistingPost(testData.fullPostId1, 'Original content');

      const beforeTimestamp = Date.now();
      await LocalPostService.edit({ compositePostId: testData.fullPostId1, content: 'Edited content' });
      const afterTimestamp = Date.now();

      const postTtl = await getPostTtl(testData.fullPostId1);
      expect(postTtl).toBeTruthy();
      expect(postTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(postTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should write attachments and kind when provided', async () => {
      await setupExistingPost(testData.fullPostId1, 'Original content');
      const nextAttachments = [`pubky://${testData.authorPubky}/pub/pubky.app/files/file3`];

      await LocalPostService.edit({
        compositePostId: testData.fullPostId1,
        content: 'Edited content',
        attachments: nextAttachments,
        kind: 'image',
      });

      const details = await getSavedPost(testData.fullPostId1);
      expect(details!.content).toBe('Edited content');
      expect(details!.attachments).toEqual(nextAttachments);
      expect(details!.kind).toBe('image');
    });

    it('should clear the attachments column when null is provided', async () => {
      await setupPostWithAttachments('image');

      await LocalPostService.edit({
        compositePostId: testData.fullPostId1,
        content: 'Edited content',
        attachments: null,
        kind: 'short',
      });

      const details = await getSavedPost(testData.fullPostId1);
      expect(details!.attachments).toBeNull();
      expect(details!.kind).toBe('short');
    });

    it('should throw WRITE_FAILED error and roll back the TTL touch on failure', async () => {
      await setupExistingPost(testData.fullPostId1, 'Original content');
      const spy = vi.spyOn(PostDetailsModel, 'update').mockRejectedValueOnce(new Error('boom'));

      try {
        await expect(
          LocalPostService.edit({ compositePostId: testData.fullPostId1, content: 'Edited content' }),
        ).rejects.toMatchObject({
          name: 'AppError',
          code: 'WRITE_FAILED',
          message: 'Failed to edit post',
        });

        // Transactional: the failed edit must not leave a bumped TTL behind
        const postTtl = await getPostTtl(testData.fullPostId1);
        expect(postTtl).toBeNull();

        const details = await getSavedPost(testData.fullPostId1);
        expect(details!.content).toBe('Original content');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('removeFromKindStreams', () => {
    it('should remove the post from the kind-filtered timeline streams only', async () => {
      const postId = testData.fullPostId1;
      await setupUserCounts(testData.authorPubky);
      // Puts the short-kind post into the all/kind timeline streams + author stream
      await LocalPostService.create(createSaveParams('Test post'));
      await UnreadPostStreamModel.prependItems(PostStreamTypes.TIMELINE_ALL_SHORT as PostStreamId, [postId]);

      await LocalPostService.removeFromKindStreams({ compositePostId: postId, kind: 'short' });

      const timelineAllShort = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_SHORT);
      const timelineFollowingShort = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FOLLOWING_SHORT);
      const timelineFriendsShort = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FRIENDS_SHORT);
      const unreadAllShort = await UnreadPostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_SHORT);
      expect(timelineAllShort?.stream ?? []).not.toContain(postId);
      expect(timelineFollowingShort?.stream ?? []).not.toContain(postId);
      expect(timelineFriendsShort?.stream ?? []).not.toContain(postId);
      expect(unreadAllShort?.stream ?? []).not.toContain(postId);

      // The post still exists — the unfiltered and author streams keep it
      const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
      const authorStream = await PostStreamModel.table.get(`author:${testData.authorPubky}` as PostStreamId);
      expect(timelineAllAll?.stream).toContain(postId);
      expect(authorStream?.stream).toContain(postId);
    });

    it('should be a no-op for streams that do not contain the post', async () => {
      await expect(
        LocalPostService.removeFromKindStreams({ compositePostId: testData.fullPostId1, kind: 'image' }),
      ).resolves.toBeUndefined();
    });

    it('should remove the post from every cached stream whose kind slot matches, whatever the shape', async () => {
      const postId = testData.fullPostId1;
      const sortedAuthorShort = buildSortedAuthorStreamId(
        StreamSorting.TIMELINE,
        testData.authorPubky,
        StreamKind.SHORT,
      ) as PostStreamId;
      const sortedAuthorShortTagged = buildSortedAuthorStreamId(
        StreamSorting.TIMELINE,
        testData.authorPubky,
        StreamKind.SHORT,
        ['bitcoin'],
      ) as PostStreamId;
      const wotShort = 'timeline:wot:short' as PostStreamId;
      const engagementShort = PostStreamTypes.POPULARITY_ALL_SHORT as PostStreamId;

      await Promise.all(
        [sortedAuthorShort, sortedAuthorShortTagged, wotShort, engagementShort].map((streamId) =>
          PostStreamModel.prependItems(streamId, [postId]),
        ),
      );
      await UnreadPostStreamModel.prependItems(sortedAuthorShort, [postId]);

      await LocalPostService.removeFromKindStreams({ compositePostId: postId, kind: 'short' });

      for (const streamId of [sortedAuthorShort, sortedAuthorShortTagged, wotShort, engagementShort]) {
        const stream = await PostStreamModel.table.get(streamId);
        expect(stream?.stream ?? []).not.toContain(postId);
      }
      const unreadSortedAuthor = await UnreadPostStreamModel.table.get(sortedAuthorShort);
      expect(unreadSortedAuthor?.stream ?? []).not.toContain(postId);
    });

    it('should keep the post in kind-less streams and in other kinds streams', async () => {
      const postId = testData.fullPostId1;
      const authorStream = `author:${testData.authorPubky}` as PostStreamId;
      const timelineAllAll = PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId;
      const sortedAuthorAll = buildSortedAuthorStreamId(
        StreamSorting.TIMELINE,
        testData.authorPubky,
        'all',
      ) as PostStreamId;
      const timelineAllImage = PostStreamTypes.TIMELINE_ALL_IMAGE as PostStreamId;

      await Promise.all(
        [authorStream, timelineAllAll, sortedAuthorAll, timelineAllImage].map((streamId) =>
          PostStreamModel.prependItems(streamId, [postId]),
        ),
      );

      await LocalPostService.removeFromKindStreams({ compositePostId: postId, kind: 'short' });

      // Kind-less shapes ('all' slot, bare author stream) are untouched, and a
      // DIFFERENT kind's stream keeps the post too
      for (const streamId of [authorStream, timelineAllAll, sortedAuthorAll, timelineAllImage]) {
        const stream = await PostStreamModel.table.get(streamId);
        expect(stream?.stream).toContain(postId);
      }
    });
  });

  describe('readCounts', () => {
    it('should return post counts when post exists', async () => {
      const postId = testData.fullPostId1;
      await setupExistingPost(postId, 'Test post');

      // Update some counts
      await PostCountsModel.update(postId, {
        tags: 5,
        unique_tags: 3,
        replies: 10,
        reposts: 2,
      });

      const counts = await LocalPostService.readCounts(postId);

      expect(counts).toBeTruthy();
      expect(counts!.id).toBe(postId);
      expect(counts!.tags).toBe(5);
      expect(counts!.unique_tags).toBe(3);
      expect(counts!.replies).toBe(10);
      expect(counts!.reposts).toBe(2);
    });

    it('should return null when post does not exist', async () => {
      const nonExistentPostId = 'nonexistent:post123';

      const counts = await LocalPostService.readCounts(nonExistentPostId);

      expect(counts).toBeNull();
    });

    it('should propagate model errors on database failure', async () => {
      const postId = testData.fullPostId1;

      // Mock findById to throw an error - model layer handles error wrapping
      const spy = vi.spyOn(PostCountsModel, 'findById').mockRejectedValueOnce(new Error('Database connection lost'));

      // Service is pass-through, error bubbles up from model
      await expect(LocalPostService.readCounts(postId)).rejects.toThrow('Database connection lost');

      spy.mockRestore();
    });
  });

  describe('PostStream updates', () => {
    describe('create operations', () => {
      it('should add root post to all timeline streams and author stream', async () => {
        const postId = testData.fullPostId1;
        await setupUserCounts(testData.authorPubky);

        await LocalPostService.create(createSaveParams('Test post'));

        // Verify post was added to timeline streams
        const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        const timelineAllShort = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_SHORT);
        const timelineFollowingAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FOLLOWING_ALL);
        const timelineFollowingShort = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FOLLOWING_SHORT);
        const timelineFriendsAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FRIENDS_ALL);
        const timelineFriendsShort = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FRIENDS_SHORT);
        const authorStream = await PostStreamModel.table.get(`author:${testData.authorPubky}` as PostStreamId);

        expect(timelineAllAll?.stream).toContain(postId);
        expect(timelineAllShort?.stream).toContain(postId);
        expect(timelineFollowingAll?.stream).toContain(postId);
        expect(timelineFollowingShort?.stream).toContain(postId);
        expect(timelineFriendsAll?.stream).toContain(postId);
        expect(timelineFriendsShort?.stream).toContain(postId);
        expect(authorStream?.stream).toContain(postId);
      });

      it('should add long-form post to appropriate timeline streams', async () => {
        const postId = testData.fullPostId1;
        await setupUserCounts(testData.authorPubky);

        await LocalPostService.create(createSaveParams('Long post', undefined, PubkyAppPostKind.Long));

        // Verify post was added to long-form streams
        const timelineAllLong = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_LONG);
        const timelineFollowingLong = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FOLLOWING_LONG);
        const timelineFriendsLong = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FRIENDS_LONG);

        expect(timelineAllLong?.stream).toContain(postId);
        expect(timelineFollowingLong?.stream).toContain(postId);
        expect(timelineFriendsLong?.stream).toContain(postId);

        // Should also be in 'all' kind streams
        const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        expect(timelineAllAll?.stream).toContain(postId);
      });

      it('should add collection posts to collection streams but not all-content streams', async () => {
        const postId = testData.fullPostId1;
        await setupUserCounts(testData.authorPubky);

        await LocalPostService.create(createSaveParams('Collection content', undefined, PubkyAppPostKind.Collection));

        const authorCollections = await PostStreamModel.table.get(buildAuthorCollectionsStreamId(testData.authorPubky));
        const timelineAllCollection = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_COLLECTION);
        const timelineFollowingCollection = await PostStreamModel.table.get(
          PostStreamTypes.TIMELINE_FOLLOWING_COLLECTION,
        );
        const timelineFriendsCollection = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FRIENDS_COLLECTION);
        const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        const timelineFollowingAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FOLLOWING_ALL);
        const timelineFriendsAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_FRIENDS_ALL);

        expect(authorCollections?.stream).toContain(postId);
        expect(timelineAllCollection?.stream).toContain(postId);
        expect(timelineFollowingCollection?.stream).toContain(postId);
        expect(timelineFriendsCollection?.stream).toContain(postId);
        expect(timelineAllAll?.stream ?? []).not.toContain(postId);
        expect(timelineFollowingAll?.stream ?? []).not.toContain(postId);
        expect(timelineFriendsAll?.stream ?? []).not.toContain(postId);
      });

      it('should add reply to author_replies and post_replies streams only', async () => {
        const parentPostId = 'parent:post123';
        const replyId = testData.fullPostId1;
        const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

        await setupExistingPost(parentPostId, 'Parent post');
        await setupUserCounts(testData.authorPubky);

        const baseParams = createSaveParams('This is a reply', replyId);
        const saveParams: TLocalSavePostParams = {
          ...baseParams,
          post: new PubkyAppPost(baseParams.post.content, PubkyAppPostKind.Short, parentUri, undefined, undefined),
        };

        await LocalPostService.create(saveParams);

        // Verify reply was added to reply streams
        const authorRepliesStream = await PostStreamModel.table.get(
          `author_replies:${testData.authorPubky}` as PostStreamId,
        );
        const postRepliesStream = await PostStreamModel.table.get(`post_replies:${parentPostId}` as PostStreamId);

        expect(authorRepliesStream?.stream).toContain(replyId);
        expect(postRepliesStream?.stream).toContain(replyId);

        // Verify reply was NOT added to timeline streams (replies don't go to timelines)
        const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        expect(timelineAllAll?.stream || []).not.toContain(replyId);
      });

      it('should prepend posts to beginning of stream (most recent first)', async () => {
        const postId1 = testData.fullPostId1;
        const postId2 = buildCompositeId({ pubky: testData.authorPubky, id: 'xyz789' });

        await setupUserCounts(testData.authorPubky);

        // Create first post
        await LocalPostService.create(createSaveParams('First post', postId1));

        // Create second post
        await LocalPostService.create(createSaveParams('Second post', postId2));

        const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);

        // Second post should be at index 0 (most recent)
        expect(timelineAllAll?.stream[0]).toBe(postId2);
        expect(timelineAllAll?.stream[1]).toBe(postId1);
      });
    });

    describe('delete operations', () => {
      it('should remove root post from all timeline streams and author stream', async () => {
        const postId = testData.fullPostId1;
        await setupExistingPost(postId, 'Test post');
        await setupUserCounts(testData.authorPubky);

        // Manually add post to streams first
        await PostStreamModel.prependItems(PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId, [postId]);
        await PostStreamModel.prependItems(PostStreamTypes.TIMELINE_ALL_SHORT as PostStreamId, [postId]);
        await PostStreamModel.prependItems(`author:${testData.authorPubky}` as PostStreamId, [postId]);

        // Delete the post
        await LocalPostService.delete({ compositePostId: postId });

        // Verify post was removed from streams
        const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        const timelineAllShort = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_SHORT);
        const authorStream = await PostStreamModel.table.get(`author:${testData.authorPubky}` as PostStreamId);

        expect(timelineAllAll?.stream || []).not.toContain(postId);
        expect(timelineAllShort?.stream || []).not.toContain(postId);
        expect(authorStream?.stream || []).not.toContain(postId);
      });

      it('should remove reply from author_replies and post_replies streams', async () => {
        const parentPostId = 'parent:post123';
        const replyId = testData.fullPostId1;
        const parentUri = `pubky://parent/pub/pubky.app/posts/post123`;

        await setupExistingPost(parentPostId, 'Parent post');
        await setupExistingPost(replyId, 'Reply post', parentUri);
        await setupUserCounts(testData.authorPubky);

        // Manually add reply to streams first
        await PostStreamModel.prependItems(`author_replies:${testData.authorPubky}` as PostStreamId, [replyId]);
        await PostStreamModel.prependItems(`post_replies:${parentPostId}` as PostStreamId, [replyId]);

        // Delete the reply
        await LocalPostService.delete({ compositePostId: replyId });

        // Verify reply was removed from streams
        const authorRepliesStream = await PostStreamModel.table.get(
          `author_replies:${testData.authorPubky}` as PostStreamId,
        );
        const postRepliesStream = await PostStreamModel.table.get(`post_replies:${parentPostId}` as PostStreamId);

        expect(authorRepliesStream?.stream || []).not.toContain(replyId);
        expect(postRepliesStream?.stream || []).not.toContain(replyId);
      });

      it('should handle deleting post when stream does not exist', async () => {
        const postId = testData.fullPostId1;
        await setupExistingPost(postId, 'Test post');
        await setupUserCounts(testData.authorPubky);

        // Delete without pre-creating streams - should not throw
        await expect(LocalPostService.delete({ compositePostId: postId })).resolves.not.toThrow();
      });

      it('should remove all occurrences of post from stream', async () => {
        const postId = testData.fullPostId1;
        await setupExistingPost(postId, 'Test post');
        await setupUserCounts(testData.authorPubky);

        // Manually add post multiple times (edge case / data integrity issue)
        await PostStreamModel.prependItems(PostStreamTypes.TIMELINE_ALL_ALL as PostStreamId, [postId, postId]);

        // Delete the post
        await LocalPostService.delete({ compositePostId: postId });

        // Verify all occurrences removed
        const timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        expect(timelineAllAll?.stream || []).not.toContain(postId);
      });
    });

    describe('stream consistency', () => {
      it('should maintain stream consistency across create and delete operations', async () => {
        const postId = testData.fullPostId1;
        await setupUserCounts(testData.authorPubky);

        // Create post
        await LocalPostService.create(createSaveParams('Test post', postId));

        let timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        const initialCount = timelineAllAll?.stream.length || 0;
        expect(timelineAllAll?.stream).toContain(postId);

        // Delete post
        await LocalPostService.delete({ compositePostId: postId });

        timelineAllAll = await PostStreamModel.table.get(PostStreamTypes.TIMELINE_ALL_ALL);
        const finalCount = timelineAllAll?.stream.length || 0;

        // Stream should be back to original state
        expect(finalCount).toBe(initialCount - 1);
        expect(timelineAllAll?.stream || []).not.toContain(postId);
      });
    });
  });

  describe('readRelationships', () => {
    it('should return post relationships when they exist', async () => {
      const postId = testData.fullPostId1;
      const parentUri = 'pubky://parent/pub/pubky.app/posts/parent123';
      await setupExistingPost(postId, 'Test post', parentUri);

      const relationships = await LocalPostService.readRelationships(postId);

      expect(relationships).not.toBeNull();
      expect(relationships?.id).toBe(postId);
      expect(relationships?.replied).toBe(parentUri);
      expect(relationships?.reposted).toBeNull();
      expect(relationships?.mentioned).toEqual([]);
    });

    it('should return null when post relationships do not exist', async () => {
      const nonExistentPostId = 'nonexistent:post123';

      const relationships = await LocalPostService.readRelationships(nonExistentPostId);

      expect(relationships).toBeNull();
    });

    it('should propagate model errors on database failure', async () => {
      const postId = testData.fullPostId1;

      // Mock findById to throw an error - service is pass-through
      const findByIdSpy = vi.spyOn(PostRelationshipsModel, 'findById').mockRejectedValue(new Error('DB error'));

      // Error bubbles up from model layer
      await expect(LocalPostService.readRelationships(postId)).rejects.toThrow('DB error');

      findByIdSpy.mockRestore();
    });
  });

  describe('readRelationshipsByIds', () => {
    it('should return post relationships for multiple posts', async () => {
      const postId1 = testData.fullPostId1;
      const postId2 = buildCompositeId({ pubky: testData.authorPubky, id: 'post-2' });
      const parentUri = 'pubky://parent/pub/pubky.app/posts/parent123';
      await setupExistingPost(postId1, 'Test post 1', parentUri);
      await setupExistingPost(postId2, 'Test post 2', undefined);

      const relationships = await LocalPostService.readRelationshipsByIds([postId1, postId2]);

      expect(relationships).toHaveLength(2);
      expect(relationships[0]?.id).toBe(postId1);
      expect(relationships[0]?.replied).toBe(parentUri);
      expect(relationships[1]?.id).toBe(postId2);
      expect(relationships[1]?.replied).toBeNull();
    });

    it('should return undefined for posts that do not exist', async () => {
      const postId1 = testData.fullPostId1;
      const nonExistentPostId = 'nonexistent:post123';
      await setupExistingPost(postId1, 'Test post 1', undefined);

      const relationships = await LocalPostService.readRelationshipsByIds([postId1, nonExistentPostId]);

      expect(relationships).toHaveLength(2);
      expect(relationships[0]?.id).toBe(postId1);
      expect(relationships[1]).toBeUndefined();
    });

    it('should return empty array for empty input', async () => {
      const relationships = await LocalPostService.readRelationshipsByIds([]);

      expect(relationships).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const postId = testData.fullPostId1;

      // Mock bulkGet to throw an error
      const bulkGetSpy = vi.spyOn(PostRelationshipsModel.table, 'bulkGet').mockRejectedValue(new Error('DB error'));

      await expect(LocalPostService.readRelationshipsByIds([postId])).rejects.toThrow(
        'Failed to read post relationships by ids',
      );

      bulkGetSpy.mockRestore();
    });
  });

  describe('readDetailsByIds', () => {
    it('should return post details aligned to input order', async () => {
      const postId1 = testData.fullPostId1;
      const postId2 = buildCompositeId({ pubky: testData.authorPubky, id: 'post-2' });
      await setupExistingPost(postId1, 'Test post 1');
      await setupExistingPost(postId2, 'Test post 2');

      const details = await LocalPostService.readDetailsByIds([postId1, postId2]);

      expect(details).toHaveLength(2);
      expect(details[0]?.content).toBe('Test post 1');
      expect(details[1]?.content).toBe('Test post 2');
    });

    it('should return undefined for posts that do not exist, preserving order', async () => {
      const postId1 = testData.fullPostId1;
      await setupExistingPost(postId1, 'Test post 1');

      const details = await LocalPostService.readDetailsByIds(['nonexistent:post123', postId1]);

      expect(details).toHaveLength(2);
      expect(details[0]).toBeUndefined();
      expect(details[1]?.id).toBe(postId1);
    });

    it('should return an empty array for empty input', async () => {
      const details = await LocalPostService.readDetailsByIds([]);

      expect(details).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      const bulkGetSpy = vi.spyOn(PostDetailsModel.table, 'bulkGet').mockRejectedValue(new Error('DB error'));

      await expect(LocalPostService.readDetailsByIds([testData.fullPostId1])).rejects.toThrow(
        'Failed to read post details by ids',
      );

      bulkGetSpy.mockRestore();
    });
  });
});
