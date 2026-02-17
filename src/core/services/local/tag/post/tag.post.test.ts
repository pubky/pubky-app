import { describe, it, expect, beforeEach } from 'vitest';
import * as Core from '@/core';

// Test data
const testData = {
  authorPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Core.Pubky,
  taggerPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Core.Pubky,
  anotherTaggerPubky: 'y4euc88xboik1ev3axy9m9ajuedo8gx1mh1n7ms8zoxm5s1b1h9y' as Core.Pubky,
  postId: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy:abc123xyz',
};

// Helper functions
const createTagParams = (label: string): Core.TLocalTagParams => ({
  taggedId: testData.postId,
  label,
  taggerId: testData.taggerPubky,
});

const createRemoveParams = (label: string): Core.TLocalTagParams => ({
  taggedId: testData.postId,
  label,
  taggerId: testData.taggerPubky,
});

const getSavedTags = async () => {
  return await Core.PostTagsModel.table.get(testData.postId);
};

const getSavedCounts = async () => {
  return await Core.PostCountsModel.table.get(testData.postId);
};

const getUserCounts = async (userId: Core.Pubky) => {
  return await Core.UserCountsModel.table.get(userId);
};

const getPostTtl = async () => {
  return await Core.PostTtlModel.findById(testData.postId);
};

const createTagRecord = (label: string, taggers: Core.Pubky[], relationship: boolean) => ({
  label,
  taggers,
  taggers_count: taggers.length,
  relationship,
});

const setupExistingTag = async (label: string, taggers: Core.Pubky[], relationship: boolean) => {
  await Core.PostTagsModel.upsert({
    id: testData.postId,
    tags: [createTagRecord(label, taggers, relationship)],
  });
};

const setupPostCounts = async (tags: number, uniqueTags: number) => {
  await Core.PostCountsModel.upsert({
    id: testData.postId,
    replies: 0,
    tags,
    unique_tags: uniqueTags,
    reposts: 0,
  });
};

const setupUserCounts = async (userId: Core.Pubky, tagged: number = 0) => {
  await Core.UserCountsModel.upsert({
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
    await Core.db.initialize();
    await Core.db.transaction(
      'rw',
      [Core.PostTagsModel.table, Core.PostCountsModel.table, Core.UserCountsModel.table, Core.PostTtlModel.table],
      async () => {
        await Core.PostTagsModel.table.clear();
        await Core.PostCountsModel.table.clear();
        await Core.UserCountsModel.table.clear();
        await Core.PostTtlModel.table.clear();
      },
    );
  });

  describe('create', () => {
    it('should create a new tag to a post', async () => {
      await Core.LocalPostTagService.create(createTagParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags).toBeTruthy();
      expect(savedTags!.tags).toHaveLength(1);
      expect(savedTags!.tags[0].label).toBe('javascript');
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(savedTags!.tags[0].relationship).toBe(true);
    });

    it('should create tagger to existing tag', async () => {
      await Core.LocalPostTagService.create(createTagParams('javascript'));
      await setupExistingTag('javascript', [testData.taggerPubky], false);

      await Core.LocalPostTagService.create({
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

      await Core.LocalPostTagService.create(createTagParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags[0].taggers_count).toBe(1); // Should remain unchanged
    });

    it('should update post counts when creating tag', async () => {
      await setupPostCounts(0, 0);
      await Core.LocalPostTagService.create(createTagParams('javascript'));

      const savedCounts = await getSavedCounts();
      expect(savedCounts!.tags).toBe(1);
      expect(savedCounts!.unique_tags).toBe(1);
    });

    it('should increment user tagged count when creating tag', async () => {
      await setupUserCounts(testData.taggerPubky, 0);
      await Core.LocalPostTagService.create(createTagParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(1);
    });

    it('should increment user tagged count from existing value when creating tag', async () => {
      await setupUserCounts(testData.taggerPubky, 5);
      await Core.LocalPostTagService.create(createTagParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(6);
    });

    it('should create multiple different tags to a post', async () => {
      await Core.LocalPostTagService.create(createTagParams('javascript'));
      await Core.LocalPostTagService.create(createTagParams('react'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(2);
      expect(savedTags!.tags.map((t) => t.label)).toContain('javascript');
      expect(savedTags!.tags.map((t) => t.label)).toContain('react');
    });

    it('should not update counts when user already tagged with same label', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], true);
      await setupPostCounts(1, 1);
      await setupUserCounts(testData.taggerPubky, 1);

      await Core.LocalPostTagService.create(createTagParams('javascript'));

      const savedCounts = await getSavedCounts();
      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(savedCounts!.tags).toBe(1); // Should remain unchanged
      expect(savedCounts!.unique_tags).toBe(1); // Should remain unchanged
      expect(userCounts!.tagged).toBe(1); // Should remain unchanged
    });

    it('should touch post TTL when creating a tag', async () => {
      const beforeTimestamp = Date.now();
      await Core.LocalPostTagService.create(createTagParams('javascript'));
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
      await Core.LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(0);
    });

    it('should update post counts when deleting tag', async () => {
      await Core.LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedCounts = await getSavedCounts();
      expect(savedCounts!.tags).toBe(0);
      expect(savedCounts!.unique_tags).toBe(0);
    });

    it('should decrement user tagged count when deleting tag', async () => {
      await setupUserCounts(testData.taggerPubky, 1);
      await Core.LocalPostTagService.delete(createRemoveParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(0);
    });

    it('should decrement user tagged count from existing value when deleting tag', async () => {
      await setupUserCounts(testData.taggerPubky, 10);
      await Core.LocalPostTagService.delete(createRemoveParams('javascript'));

      const userCounts = await getUserCounts(testData.taggerPubky);
      expect(userCounts!.tagged).toBe(9);
    });

    it('should return false if post has no tags when deleting tag (idempotent)', async () => {
      await Core.PostTagsModel.table.clear();

      const result = await Core.LocalPostTagService.delete(createRemoveParams('javascript'));
      expect(result).toBe(false);
    });

    it('should return false if user has not tagged with this label when deleting (idempotent)', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky], false);

      // Different user trying to delete - should return false
      const result = await Core.LocalPostTagService.delete(createRemoveParams('javascript'));
      expect(result).toBe(false);
    });

    it('should delete only the tagger but keep tag if other taggers exist', async () => {
      await setupExistingTag('javascript', [testData.taggerPubky, testData.anotherTaggerPubky], true);

      await Core.LocalPostTagService.delete(createRemoveParams('javascript'));

      const savedTags = await getSavedTags();
      expect(savedTags!.tags).toHaveLength(1);
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(savedTags!.tags[0].relationship).toBe(false);
      expect(savedTags!.tags[0].taggers).toContain(testData.anotherTaggerPubky);
      expect(savedTags!.tags[0].taggers).not.toContain(testData.taggerPubky);
    });

    it('should touch post TTL when deleting a tag', async () => {
      const beforeTimestamp = Date.now();
      await Core.LocalPostTagService.delete(createRemoveParams('javascript'));
      const afterTimestamp = Date.now();

      const postTtl = await getPostTtl();
      expect(postTtl).toBeTruthy();
      expect(postTtl!.lastUpdatedAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(postTtl!.lastUpdatedAt).toBeLessThanOrEqual(afterTimestamp);
    });
  });
});
