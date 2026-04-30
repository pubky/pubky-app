import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { PostRelationshipsModel } from '@/models/post/relationships/postRelationships';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import type { NexusPostRelationships } from '@/services/nexus/nexus.types';
describe('PostRelationshipsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testPostId1 = 'post-test-1';
  const testPostId2 = 'post-test-2';
  const testAuthor1 = 'test-author-1-pubky';
  const testAuthor2 = 'test-author-2-pubky';

  const MOCK_NEXUS_POST_RELATIONSHIPS: Omit<NexusPostRelationships, 'id'> = {
    replied: 'parent-post-id',
    reposted: null,
    mentioned: [testAuthor1, testAuthor2],
  };

  describe('Constructor', () => {
    it('should create PostRelationshipsModel instance with all properties', () => {
      const mockPostRelationshipsData = {
        id: testPostId1,
        ...MOCK_NEXUS_POST_RELATIONSHIPS,
      };

      const postRelationships = new PostRelationshipsModel(mockPostRelationshipsData);

      expect(postRelationships.id).toBe(mockPostRelationshipsData.id);
      expect(postRelationships.replied).toBe(mockPostRelationshipsData.replied);
      expect(postRelationships.reposted).toBe(mockPostRelationshipsData.reposted);
      expect(postRelationships.mentioned).toEqual(mockPostRelationshipsData.mentioned);
    });

    it('should handle null replied and reposted', () => {
      const mockPostRelationshipsData = {
        id: testPostId1,
        ...MOCK_NEXUS_POST_RELATIONSHIPS,
        replied: null,
        reposted: null,
      };

      const postRelationships = new PostRelationshipsModel(mockPostRelationshipsData);

      expect(postRelationships.replied).toBeNull();
      expect(postRelationships.reposted).toBeNull();
    });

    it('should handle empty mentioned array', () => {
      const mockPostRelationshipsData = {
        id: testPostId1,
        ...MOCK_NEXUS_POST_RELATIONSHIPS,
        mentioned: [],
      };

      const postRelationships = new PostRelationshipsModel(mockPostRelationshipsData);

      expect(postRelationships.mentioned).toEqual([]);
    });
  });

  describe('Static Methods', () => {
    it('should create post relationships', async () => {
      const mockPostRelationshipsData = {
        id: testPostId1,
        ...MOCK_NEXUS_POST_RELATIONSHIPS,
      };

      const result = await PostRelationshipsModel.create(mockPostRelationshipsData);
      expect(result).toBe(mockPostRelationshipsData.id);
    });

    it('should find post relationships by id', async () => {
      const mockPostRelationshipsData = {
        id: testPostId1,
        ...MOCK_NEXUS_POST_RELATIONSHIPS,
      };

      await PostRelationshipsModel.create(mockPostRelationshipsData);
      const result = await PostRelationshipsModel.findById(testPostId1);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(PostRelationshipsModel);
      expect(result!.id).toBe(testPostId1);
      expect(result!.replied).toBe(MOCK_NEXUS_POST_RELATIONSHIPS.replied);
      expect(result!.mentioned).toEqual(MOCK_NEXUS_POST_RELATIONSHIPS.mentioned);
    });

    it('should return null for non-existent post relationships', async () => {
      const nonExistentId = 'non-existent-post-999';
      const result = await PostRelationshipsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save post relationships from tuples', async () => {
      const mockNexusModelTuples: NexusModelTuple<NexusPostRelationships>[] = [
        [testPostId1, { ...MOCK_NEXUS_POST_RELATIONSHIPS }],
        [testPostId2, { ...MOCK_NEXUS_POST_RELATIONSHIPS, replied: 'different-parent' }],
      ];

      const result = await PostRelationshipsModel.bulkSave(mockNexusModelTuples);
      expect(result).toBeDefined();

      // Verify the data was saved correctly
      const postRelationships1 = await PostRelationshipsModel.findById(testPostId1);
      const postRelationships2 = await PostRelationshipsModel.findById(testPostId2);

      expect(postRelationships1).not.toBeNull();
      expect(postRelationships2).not.toBeNull();
      expect(postRelationships1!.replied).toBe('parent-post-id');
      expect(postRelationships2!.replied).toBe('different-parent');
    });

    it('should handle empty array in bulk save', async () => {
      const result = await PostRelationshipsModel.bulkSave([]);
      // bulkPut with empty array returns undefined, which is expected
      expect(result).toBeUndefined();
    });

    it('should handle different relationship types', async () => {
      const mockTuples: NexusModelTuple<NexusPostRelationships>[] = [
        [testPostId1, { replied: 'reply-parent', reposted: null, mentioned: [] }],
        [testPostId2, { replied: null, reposted: 'repost-original', mentioned: [testAuthor1] }],
      ];

      await PostRelationshipsModel.bulkSave(mockTuples);

      const postRelationships1 = await PostRelationshipsModel.findById(testPostId1);
      const postRelationships2 = await PostRelationshipsModel.findById(testPostId2);

      expect(postRelationships1).not.toBeNull();
      expect(postRelationships2).not.toBeNull();
      expect(postRelationships1!.replied).toBe('reply-parent');
      expect(postRelationships1!.reposted).toBeNull();
      expect(postRelationships2!.replied).toBeNull();
      expect(postRelationships2!.reposted).toBe('repost-original');
    });

    it('should handle different mentioned arrays', async () => {
      const mockTuples: NexusModelTuple<NexusPostRelationships>[] = [
        [testPostId1, { replied: null, reposted: null, mentioned: [testAuthor1] }],
        [testPostId2, { replied: null, reposted: null, mentioned: [testAuthor1, testAuthor2] }],
      ];

      await PostRelationshipsModel.bulkSave(mockTuples);

      const postRelationships1 = await PostRelationshipsModel.findById(testPostId1);
      const postRelationships2 = await PostRelationshipsModel.findById(testPostId2);

      expect(postRelationships1).not.toBeNull();
      expect(postRelationships2).not.toBeNull();
      expect(postRelationships1!.mentioned).toEqual([testAuthor1]);
      expect(postRelationships2!.mentioned).toEqual([testAuthor1, testAuthor2]);
    });
  });
});
