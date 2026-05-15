import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';

describe('PostTtlModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testPostId1 = 'post-test-1';
  const testPostId2 = 'post-test-2';

  const MOCK_TTL_1 = {
    lastUpdatedAt: Date.now() - 3600000, // 1 hour ago
  };

  const MOCK_TTL_2 = {
    lastUpdatedAt: Date.now() - 7200000, // 2 hours ago
  };

  describe('Constructor', () => {
    it('should create PostTtlModel instance with all properties', () => {
      const mockData = {
        id: testPostId1,
        ...MOCK_TTL_1,
      };

      const model = new PostTtlModel(mockData);

      expect(model.id).toBe(mockData.id);
      expect(model.lastUpdatedAt).toBe(MOCK_TTL_1.lastUpdatedAt);
    });
  });

  describe('Static Methods', () => {
    it('should create post ttl', async () => {
      const mockData = {
        id: testPostId1,
        ...MOCK_TTL_1,
      };

      const result = await PostTtlModel.create(mockData);
      expect(result).toBe(mockData.id);
    });

    it('should find post ttl by id', async () => {
      const mockData = {
        id: testPostId1,
        ...MOCK_TTL_1,
      };

      await PostTtlModel.create(mockData);
      const result = await PostTtlModel.findById(testPostId1);

      expect(result).toBeInstanceOf(PostTtlModel);
      expect(result?.id).toBe(testPostId1);
      expect(result?.lastUpdatedAt).toBe(MOCK_TTL_1.lastUpdatedAt);
    });

    it('should return null for non-existent post ttl', async () => {
      const nonExistentId = 'non-existent-post-999';
      const result = await PostTtlModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save post ttl from tuples', async () => {
      const mockTuples: NexusModelTuple<{ lastUpdatedAt: number }>[] = [
        [testPostId1, MOCK_TTL_1],
        [testPostId2, MOCK_TTL_2],
      ];

      await PostTtlModel.bulkSave(mockTuples);

      const postTtl1 = await PostTtlModel.findById(testPostId1);
      const postTtl2 = await PostTtlModel.findById(testPostId2);

      expect(postTtl1?.lastUpdatedAt).toBe(MOCK_TTL_1.lastUpdatedAt);
      expect(postTtl2?.lastUpdatedAt).toBe(MOCK_TTL_2.lastUpdatedAt);
    });

    it('should handle empty array in bulk save', async () => {
      const result = await PostTtlModel.bulkSave([]);
      // bulkPut with empty array returns undefined, which is expected
      expect(result).toBeUndefined();
    });

    it('should handle multiple tuples with different lastUpdatedAt values', async () => {
      const currentTime = Date.now();
      const mockTuples: NexusModelTuple<{ lastUpdatedAt: number }>[] = [
        [testPostId1, { lastUpdatedAt: currentTime - 1000 }],
        [testPostId2, { lastUpdatedAt: currentTime - 5000 }],
      ];

      await PostTtlModel.bulkSave(mockTuples);

      const postTtl1 = await PostTtlModel.findById(testPostId1);
      const postTtl2 = await PostTtlModel.findById(testPostId2);

      expect(postTtl1?.lastUpdatedAt).toBe(currentTime - 1000);
      expect(postTtl2?.lastUpdatedAt).toBe(currentTime - 5000);
    });

    it('should handle staleness check scenarios', async () => {
      const currentTime = Date.now();
      // recentlyUpdated: 1 minute ago (should be fresh with 5-minute TTL)
      const recentlyUpdated = { id: testPostId1, lastUpdatedAt: currentTime - 60000 };
      // staleUpdate: 10 minutes ago (should be stale with 5-minute TTL)
      const staleUpdate = { id: testPostId2, lastUpdatedAt: currentTime - 600000 };

      await PostTtlModel.create(recentlyUpdated);
      await PostTtlModel.create(staleUpdate);

      const recent = await PostTtlModel.findById(testPostId1);
      const stale = await PostTtlModel.findById(testPostId2);

      expect(recent?.lastUpdatedAt).toBe(recentlyUpdated.lastUpdatedAt);
      expect(stale?.lastUpdatedAt).toBe(staleUpdate.lastUpdatedAt);

      // Verify stale entry is older than recent
      expect(stale?.lastUpdatedAt).toBeLessThan(recent?.lastUpdatedAt ?? 0);
    });

    it('should correctly update lastUpdatedAt on refresh', async () => {
      const initialTime = Date.now() - 600000; // 10 minutes ago
      const refreshTime = Date.now();

      // Create initial record
      await PostTtlModel.create({ id: testPostId1, lastUpdatedAt: initialTime });

      // Verify initial state
      const before = await PostTtlModel.findById(testPostId1);
      expect(before?.lastUpdatedAt).toBe(initialTime);

      // Simulate refresh by upserting with new lastUpdatedAt
      await PostTtlModel.upsert({ id: testPostId1, lastUpdatedAt: refreshTime });

      // Verify updated state
      const after = await PostTtlModel.findById(testPostId1);
      expect(after?.lastUpdatedAt).toBe(refreshTime);
      expect(after?.lastUpdatedAt).toBeGreaterThan(before?.lastUpdatedAt ?? 0);
    });
  });
});
