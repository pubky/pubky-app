import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { PostTagsModel } from '@/models/post/tags/postTags';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import { TagModel } from '@/models/shared/tag/tag';
import { generateTestUserId } from '@/models/user/users.helpers';
import type { NexusTag } from '@/services/nexus/nexus.types';
describe('PostTagsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testPostId1 = 'post-test-1';
  const testPostId2 = 'post-test-2';
  const testUserId1 = generateTestUserId(1);
  const testUserId2 = generateTestUserId(2);

  const MOCK_TAGS_1: NexusTag[] = [
    { label: 'tech', taggers: [testUserId1], taggers_count: 1, relationship: false },
    { label: 'announcement', taggers: [testUserId2], taggers_count: 1, relationship: false },
  ];

  const MOCK_TAGS_2: NexusTag[] = [{ label: 'news', taggers: [testUserId1], taggers_count: 1, relationship: false }];

  describe('Constructor', () => {
    it('should create PostTagsModel instance with id and TagModel array', () => {
      const data = { id: testPostId1, tags: MOCK_TAGS_1 };
      const model = new PostTagsModel(data);
      expect(model.id).toBe(testPostId1);
      expect(model.tags.length).toBe(2);
      expect(model.tags[0]).toBeInstanceOf(TagModel);
      const labels = model.tags.map((t) => t.label).sort();
      expect(labels).toEqual(['announcement', 'tech']);
    });
  });

  describe('Instance helpers', () => {
    it('should save and remove a tag for a user', () => {
      const model = new PostTagsModel({ id: testPostId1, tags: [] });

      expect(model.addTagger('tech', testUserId1)).toBe(false); // Returns false because tag didn't exist
      const techTag = model.findByLabel('tech');
      expect(techTag).not.toBeNull();
      expect(techTag!.taggers.includes(testUserId1)).toBe(true);

      expect(model.removeTagger('tech', testUserId1)).toBe(true); // Returns true because tag is deleted
      const techAfterRemove = model.findByLabel('tech');
      expect(techAfterRemove).toBeNull();
    });

    it('should find tag by label', () => {
      const model = new PostTagsModel({ id: testPostId1, tags: MOCK_TAGS_1 });

      const techTag = model.findByLabel('tech');
      expect(techTag).not.toBeNull();
      expect(techTag!.label).toBe('tech');

      const announcementTag = model.findByLabel('announcement');
      expect(announcementTag).not.toBeNull();
      expect(announcementTag!.label).toBe('announcement');

      const nonExistentTag = model.findByLabel('nonexistent');
      expect(nonExistentTag).toBeNull();
    });

    it('should handle removing taggers via removeTag', () => {
      const model = new PostTagsModel({ id: testPostId1, tags: MOCK_TAGS_1 });

      // Remove existing tagger
      const techExisting = model.findByLabel('tech');
      expect(techExisting).not.toBeNull();
      techExisting!.setRelationship(true);
      expect(model.removeTagger('tech', testUserId1)).toBe(true);
      const techTagAfter = model.findByLabel('tech');
      // tag should be deleted because taggers_count is 0
      expect(techTagAfter).toBeNull();

      expect(model.removeTagger('nonexistent', testUserId1)).toBeNull();
    });
  });

  describe('Static Methods', () => {
    it('should insert post tags', async () => {
      const rec = { id: testPostId1, tags: MOCK_TAGS_1 };
      const result = await PostTagsModel.create(rec);
      expect(result).toBe(rec.id);
    });

    it('should find post tags by id', async () => {
      const rec = { id: testPostId1, tags: MOCK_TAGS_1 };
      await PostTagsModel.create(rec);
      const found = await PostTagsModel.findById(testPostId1);
      expect(found).not.toBeNull();
      expect(found!).toBeInstanceOf(PostTagsModel);
      expect(found!.id).toBe(testPostId1);
      const labels = found!.tags.map((t) => t.label).sort();
      expect(labels).toEqual(['announcement', 'tech']);
    });

    it('should return null for non-existent post tags', async () => {
      const nonExistentId = 'non-existent-post-999';
      const result = await PostTagsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save post tags from tuples', async () => {
      const tuples: NexusModelTuple<NexusTag[]>[] = [
        [testPostId1, MOCK_TAGS_1],
        [testPostId2, MOCK_TAGS_2],
      ];

      const result = await PostTagsModel.bulkSave(tuples);
      expect(result).toBeDefined();

      const tags1 = await PostTagsModel.findById(testPostId1);
      const tags2 = await PostTagsModel.findById(testPostId2);

      expect(tags1).not.toBeNull();
      expect(tags2).not.toBeNull();
      expect(tags1!.tags.map((t) => t.label).sort()).toEqual(['announcement', 'tech']);
      expect(tags2!.tags.map((t) => t.label)).toEqual(['news']);
    });

    it('should handle empty array in bulk save', async () => {
      const result = await PostTagsModel.bulkSave([]);
      expect(result).toBeUndefined();
    });

    it('should handle post-specific tagging scenarios', async () => {
      // Test scenario where multiple users tag a post with same label
      const postWithMultipleTaggers = {
        id: testPostId1,
        tags: [
          { label: 'trending', taggers: [testUserId1, testUserId2], taggers_count: 2, relationship: false },
        ] as NexusTag[],
      };

      await PostTagsModel.create(postWithMultipleTaggers);
      const found = await PostTagsModel.findById(testPostId1);
      expect(found).not.toBeNull();

      const trending = found!.findByLabel('trending');
      expect(trending).not.toBeNull();
      expect(trending!.taggers).toEqual([testUserId1, testUserId2]);
      expect(trending!.taggers.length).toBe(2);
    });
  });
});
