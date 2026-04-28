import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTagsModel } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { LocalPostTagService } from '@/services/local/tag/post/tag.post';
import type { TLocalTagParams } from '@/services/local/tag/tag.types';
// Test data
const testData = {
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  taggerPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  anotherTaggerPubky: 'y4euc88xboik1ev3axy9m9ajuedo8gx1mh1n7ms8zoxm5s1b1h9y' as Pubky,
  postId: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy:abc123xyz',
};

// Helper functions
const createTagParams = (label: string): TLocalTagParams => ({
  taggedId: testData.postId,
  label,
  taggerId: testData.taggerPubky,
});

const createRemoveParams = (label: string): TLocalTagParams => ({
  taggedId: testData.postId,
  label,
  taggerId: testData.taggerPubky,
});

const getSavedTags = async () => {
  return await PostTagsModel.table.get(testData.postId);
};

const getSavedCounts = async () => {
  return await PostCountsModel.table.get(testData.postId);
};

const getUserCounts = async (userId: Pubky) => {
  return await UserCountsModel.table.get(userId);
};

const getPostTtl = async () => {
  return await PostTtlModel.findById(testData.postId);
};

const createTagRecord = (label: string, taggers: Pubky[], relationship: boolean) => ({
  label,
  taggers,
  taggers_count: taggers.length,
  relationship,
});

const setupExistingTag = async (label: string, taggers: Pubky[], relationship: boolean) => {
  await PostTagsModel.upsert({
    id: testData.postId,
    tags: [createTagRecord(label, taggers, relationship)],
  });
};

const setupPostCounts = async (tags: number, uniqueTags: number) => {
  await PostCountsModel.upsert({
    id: testData.postId,
    replies: 0,
    tags,
    unique_tags: uniqueTags,
    reposts: 0,
  });
};

const setupUserCounts = async (userId: Pubky, tagged: number = 0) => {
  await UserCountsModel.upsert({
    id: userId,
    tagged,
    tags: 0,
    unique_tags: 0,
    posts: 0,
    replies: 0,
    following: 0,
    followers: 0,
    friends: 0,
    bookmarks: 0,
  });
};

describe('LocalTagService', () => {
  beforeEach(async () => {
    await db.initialize();
    await db.transaction(
      'rw',
      [PostTagsModel.table, PostCountsModel.table, UserCountsModel.table, PostTtlModel.table],
      async () => {
        await PostTagsModel.table.clear();
        await PostCountsModel.table.clear();
        await UserCountsModel.table.clear();
        await PostTtlModel.table.clear();
      },
    );
  });

  describe('create', () => {
    it('should create a new tag to a post', async () => {
      await LocalPostTagService.create(createTagParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags).toBeTruthy();
      expect(savedTags!.tags).toHaveLength(1);
      expect(savedTags!.tags[0].label).toBe('javascript');
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(savedTags!.tags[0].relationship).toBe(true);
    });

    it('should create tagger to existing tag', async () => {
      await LocalPostTagService.create(createTagParams('javascript'));
      await setupExistingTag('javascript', [testData.taggerPubky], false);

      await LocalPostTagService.create({
        taggedId: testData.postId,
        label: 'javascript',
        taggerId: testData.anotherTaggerPubky,
      });

      const savedTags = await getSavedTags();
      expect(savedTags!.tags[0].taggers_count).toBe(2);
      expect(savedTags!.tags[0].relationship).toBe(true);
    });

    it('should ignore if user already created tag post with this label', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], true);

      await LocalPostTagService.create(createTagParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags[0].taggers_count).toBe(1); // Should remain unchanged
    });

    it('should update post counts when creating tag', async () => {
      await setupPostCounts(0, 0);
      await LocalPostTagService.create(createTagParams('javascript'));

      const savedCounts = await getSavedCounts();
      expect(savedCounts!.tags).toBe(1);
      expect(savedCounts!.unique_tags).toBe(1);
    });

    it('should increment user tagged count when creating tag', async () => {
      await setupUserCounts(testData.taggerPubky, 0);
      await LocalPostTagService.create(createTagParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(1);
    });

    it('should increment user tagged count from existing value when creating tag', async () => {
      await setupUserCounts(testData.taggerPubky, 5);
      await LocalPostTagService.create(createTagParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(6);
    });

    it('should create multiple different tags to a post', async () => {
      await LocalPostTagService.create(createTagParams('javascript'));
      await LocalPostTagService.create(createTagParams('react'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(2);
      expect(savedTags!.tags.map((t) => t.label)).toContain('javascript');
      expect(savedTags!.tags.map((t) => t.label)).toContain('react');
    });

    it('should not update counts when user already tagged with same label', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], true);
      await setupPostCounts(1, 1);
      await setupUserCounts(testData.taggerPubky, 1);

      await LocalPostTagService.create(createTagParams('javascript'));

      const savedCounts = await getSavedCounts();
      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(savedCounts!.tags).toBe(1); // Should remain unchanged
      expect(savedCounts!.unique_tags).toBe(1); // Should remain unchanged
      expect(userCounts!.tagged).toBe(1); // Should remain unchanged
    });

    it('should touch post TTL when creating a tag', async () => {
      const beforeTimestamp = Date.now();
      await LocalPostTagService.create(createTagParams('javascript'));
      const afterTimestamp = Date.now();

      const postTtl = await getPostTtl();
      expect(postTtl).toBeTruthy();
      expect(postTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(postTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });
  });

  describe('remove', () => {
    beforeEach(async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], true);
      await setupPostCounts(1, 1);
    });

    it('should delete tag from post', async () => {
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(0);
    });

    it('should update post counts when deleting tag', async () => {
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedCounts = await getSavedCounts();
      expect(savedCounts!.tags).toBe(0);
      expect(savedCounts!.unique_tags).toBe(0);
    });

    it('should decrement user tagged count when deleting tag', async () => {
      await setupUserCounts(testData.taggerPubky, 1);
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(0);
    });

    it('should decrement user tagged count from existing value when deleting tag', async () => {
      await setupUserCounts(testData.taggerPubky, 10);
      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(9);
    });

    it('should return false if post has no tags when deleting tag (idempotent)', async () => {
      await PostTagsModel.table.clear();

      const result = await LocalPostTagService.delete(createRemoveParams('javascript'));
      expect(result).toBe(false);
    });

    it('should return false if user has not tagged with this label when deleting (idempotent)', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], false);

      // Different user trying to delete - should return false
      const result = await LocalPostTagService.delete(createRemoveParams('javascript'));
      expect(result).toBe(false);
    });

    it('should delete only the tagger but keep tag if other taggers exist', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky, testData.anotherTaggerPubky], true);

      await LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(1);
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(savedTags!.tags[0].relationship).toBe(false);
      expect(savedTags!.tags[0].taggers).toContain(testData.anotherTaggerPubky);
      expect(savedTags!.tags[0].taggers).not.toContain(testData.taggerPubky);
    });

    it('should touch post TTL when deleting a tag', async () => {
      const beforeTimestamp = Date.now();
      await LocalPostTagService.delete(createRemoveParams('javascript'));
      const afterTimestamp = Date.now();

      const postTtl = await getPostTtl();
      expect(postTtl).toBeTruthy();
      expect(postTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(postTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });
  });
});
