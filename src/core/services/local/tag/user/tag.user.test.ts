import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/franky/franky';
import type { Pubky } from '@/models/models.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import type { TLocalTagParams } from '@/services/local/tag/tag.types';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';

// Test data
const testData = {
  taggerPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' as Pubky,
  taggedPubky: 'pxnu33x7jtpx9ar1ytsi4yxbp6a5o36gwhffs8zoxmbuptici1jy' as Pubky,
  anotherTaggerPubky: 'y4euc88xboik1ev3axy9m9ajuedo8gx1mh1n7ms8zoxm5s1b1h9y' as Pubky,
};

// Helper functions
const createTagParams = (label: string): TLocalTagParams => ({
  taggedId: testData.taggedPubky,
  label,
  taggerId: testData.taggerPubky,
});

const getSavedUserTags = async () => {
  return await UserTagsModel.findById(testData.taggedPubky);
};

const getSavedUserCounts = async (userId: Pubky) => {
  return await UserCountsModel.table.get(userId);
};

const createTagRecord = (label: string, taggers: Pubky[], relationship: boolean) => ({
  label,
  taggers,
  taggers_count: taggers.length,
  relationship,
});

const setupExistingUserTag = async (label: string, taggers: Pubky[], relationship: boolean) => {
  await UserTagsModel.upsert({
    id: testData.taggedPubky,
    tags: [createTagRecord(label, taggers, relationship)],
  });
};

const setupUserCounts = async (userId: Pubky, tags: number = 0, uniqueTags: number = 0, tagged: number = 0) => {
  await UserCountsModel.upsert({
    id: userId,
    tagged,
    tags,
    unique_tags: uniqueTags,
    posts: 0,
    replies: 0,
    following: 0,
    followers: 0,
    friends: 0,
    collections: 0,
    bookmarks: 0,
  });
};

describe('LocalUserTagService', () => {
  beforeEach(async () => {
    await db.initialize();
    postStreamDirtyRegistry.reset();
    await db.transaction('rw', [UserTagsModel.table, UserCountsModel.table], async () => {
      await UserTagsModel.table.clear();
      await UserCountsModel.table.clear();
    });
  });

  describe('create', () => {
    it('should create a new tag and update counts', async () => {
      await setupUserCounts(testData.taggedPubky, 0, 0);
      await setupUserCounts(testData.taggerPubky, 0, 0, 0);

      await LocalUserTagService.create(createTagParams('developer'));

      const savedTags = await getSavedUserTags();
      const taggedCounts = await getSavedUserCounts(testData.taggedPubky);
      const taggerCounts = await getSavedUserCounts(testData.taggerPubky);

      expect(savedTags!.tags).toHaveLength(1);
      expect(savedTags!.tags[0].label).toBe('developer');
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(taggedCounts!.tags).toBe(1);
      expect(taggedCounts!.unique_tags).toBe(1);
      expect(taggerCounts!.tagged).toBe(1);
    });

    it('should add tagger to existing tag', async () => {
      await setupExistingUserTag('developer', [testData.taggerPubky], false);

      await LocalUserTagService.create({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.anotherTaggerPubky,
      });

      const savedTags = await getSavedUserTags();
      expect(savedTags!.tags[0].taggers_count).toBe(2);
      expect(savedTags!.tags[0].taggers).toContain(testData.anotherTaggerPubky);
    });

    it('should ignore duplicate tags', async () => {
      await setupExistingUserTag('developer', [testData.taggerPubky], true);
      await setupUserCounts(testData.taggedPubky, 1, 1);
      await setupUserCounts(testData.taggerPubky, 0, 0, 1);

      await LocalUserTagService.create(createTagParams('developer'));

      const savedTags = await getSavedUserTags();
      const taggedCounts = await getSavedUserCounts(testData.taggedPubky);
      const taggerCounts = await getSavedUserCounts(testData.taggerPubky);

      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(taggedCounts!.tags).toBe(1);
      expect(taggerCounts!.tagged).toBe(1);
    });

    it('should update unique_tags only for new tags, not existing ones', async () => {
      await setupUserCounts(testData.taggedPubky, 0, 0);

      // Create first tag - should increment unique_tags
      await LocalUserTagService.create(createTagParams('developer'));
      let savedCounts = await getSavedUserCounts(testData.taggedPubky);
      expect(savedCounts!.unique_tags).toBe(1);

      // Add another tagger to same tag - should NOT increment unique_tags
      await LocalUserTagService.create({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.anotherTaggerPubky,
      });
      savedCounts = await getSavedUserCounts(testData.taggedPubky);
      expect(savedCounts!.unique_tags).toBe(1); // Should remain 1

      // Create different tag - should increment unique_tags
      await LocalUserTagService.create(createTagParams('javascript'));
      savedCounts = await getSavedUserCounts(testData.taggedPubky);
      expect(savedCounts!.unique_tags).toBe(2);
    });

    it('should handle database errors', async () => {
      const spy = vi.spyOn(UserTagsModel, 'getOrCreate').mockRejectedValueOnce(new Error('DB Error'));

      await expect(LocalUserTagService.create(createTagParams('developer'))).rejects.toThrow(
        'Failed to create user tag',
      );

      spy.mockRestore();
    });

    it('should mark profile-tag-dependent streams dirty when a tag is created (#2302)', async () => {
      const domainStream = 'timeline:wot_domain:0:all:developer';
      await setupUserCounts(testData.taggedPubky, 0, 0);

      expect(postStreamDirtyRegistry.isDirty(domainStream)).toBe(false);

      await LocalUserTagService.create(createTagParams('developer'));

      expect(postStreamDirtyRegistry.isDirty(domainStream)).toBe(true);
      // Follow- and friends-scoped streams are unaffected by profile tags.
      expect(postStreamDirtyRegistry.isDirty('timeline:following:all')).toBe(false);
      expect(postStreamDirtyRegistry.isDirty('timeline:friends:all')).toBe(false);
    });

    it('should not mark streams dirty for an idempotent duplicate tag', async () => {
      await setupExistingUserTag('developer', [testData.taggerPubky], true);

      await LocalUserTagService.create(createTagParams('developer'));

      expect(postStreamDirtyRegistry.isDirty('timeline:wot_domain:0:all:developer')).toBe(false);
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      await setupExistingUserTag('developer', [testData.taggerPubky], true);
      await setupUserCounts(testData.taggedPubky, 1, 1);
    });

    it('should delete tag and update counts', async () => {
      await setupUserCounts(testData.taggerPubky, 0, 0, 1);

      await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });

      const savedTags = await getSavedUserTags();
      const taggedCounts = await getSavedUserCounts(testData.taggedPubky);
      const taggerCounts = await getSavedUserCounts(testData.taggerPubky);

      expect(savedTags!.tags).toHaveLength(0);
      expect(taggedCounts!.tags).toBe(0);
      expect(taggedCounts!.unique_tags).toBe(0);
      expect(taggerCounts!.tagged).toBe(0);
    });

    it('should remove only tagger when others exist', async () => {
      await setupExistingUserTag('developer', [testData.taggerPubky, testData.anotherTaggerPubky], true);

      await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });

      const savedTags = await getSavedUserTags();
      expect(savedTags!.tags[0].taggers_count).toBe(1);
      expect(savedTags!.tags[0].taggers).not.toContain(testData.taggerPubky);
    });

    it('should NOT update unique_tags when removing tagger but others remain', async () => {
      // Setup: Multiple taggers tag the same person with the same label
      await setupExistingUserTag('developer', [testData.taggerPubky, testData.anotherTaggerPubky], true);
      await setupUserCounts(testData.taggedPubky, 1, 1);

      // Remove first tagger - should NOT decrement unique_tags (other tagger remains)
      await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });
      const savedCounts = await getSavedUserCounts(testData.taggedPubky);
      expect(savedCounts!.unique_tags).toBe(1); // Should remain 1
    });

    it('should update unique_tags when removing last tagger', async () => {
      // Setup: Single tagger tags the same person with the same label
      await setupExistingUserTag('developer', [testData.taggerPubky], true);
      await setupUserCounts(testData.taggedPubky, 1, 1);

      // Remove the tagger - should decrement unique_tags (last tagger removed)
      await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });
      const savedCounts = await getSavedUserCounts(testData.taggedPubky);
      expect(savedCounts!.unique_tags).toBe(0);
    });

    it('should return false when user has no tags (idempotent)', async () => {
      await UserTagsModel.table.clear();

      const result = await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });

      expect(result).toBe(false);
    });

    it('should return false when user has not tagged with this label (idempotent)', async () => {
      // Setup: User has tags but not from this tagger with this label
      await setupExistingUserTag('developer', [testData.anotherTaggerPubky], false);

      const result = await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky, // Different tagger
      });

      expect(result).toBe(false);
    });

    it('should return true when tag is successfully deleted', async () => {
      await setupUserCounts(testData.taggerPubky, 0, 0, 1);

      const result = await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });

      expect(result).toBe(true);
    });

    it('should mark profile-tag-dependent streams dirty when a tag is deleted (#2302)', async () => {
      await setupUserCounts(testData.taggerPubky, 0, 0, 1);

      await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });

      expect(postStreamDirtyRegistry.isDirty('timeline:wot_domain:2:all:developer')).toBe(true);
    });

    it('should not mark streams dirty for an idempotent no-op delete', async () => {
      await UserTagsModel.table.clear();

      await LocalUserTagService.delete({
        taggedId: testData.taggedPubky,
        label: 'developer',
        taggerId: testData.taggerPubky,
      });

      expect(postStreamDirtyRegistry.isDirty('timeline:wot_domain:2:all:developer')).toBe(false);
    });
  });
});
