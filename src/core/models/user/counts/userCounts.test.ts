import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { generateTestUserId } from '@/models/user/users.helpers';
import type { NexusUserCounts } from '@/services/nexus/nexus.types';

describe('UserCountsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testUserId1 = generateTestUserId(1);
  const testUserId2 = generateTestUserId(2);

  const MOCK_NEXUS_USER_COUNTS: NexusUserCounts = {
    tagged: 3,
    tags: 7,
    unique_tags: 6,
    posts: 15,
    replies: 8,
    collections: 4,
    following: 80,
    followers: 120,
    friends: 60,
    bookmarks: 20,
  };

  describe('Constructor', () => {
    it('should create UserCountsModel instance with all properties', () => {
      const mockUserCountsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_COUNTS,
      };

      const userCounts = new UserCountsModel(mockUserCountsData);

      expect(userCounts.id).toBe(mockUserCountsData.id);
      expect(userCounts.tagged).toBe(mockUserCountsData.tagged);
      expect(userCounts.tags).toBe(mockUserCountsData.tags);
      expect(userCounts.unique_tags).toBe(mockUserCountsData.unique_tags);
      expect(userCounts.posts).toBe(mockUserCountsData.posts);
      expect(userCounts.replies).toBe(mockUserCountsData.replies);
      expect(userCounts.collections).toBe(mockUserCountsData.collections);
      expect(userCounts.following).toBe(mockUserCountsData.following);
      expect(userCounts.followers).toBe(mockUserCountsData.followers);
      expect(userCounts.friends).toBe(mockUserCountsData.friends);
      expect(userCounts.bookmarks).toBe(mockUserCountsData.bookmarks);
    });
  });

  describe('Static Methods', () => {
    it('should create user counts', async () => {
      const mockUserCountsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_COUNTS,
      };

      const result = await UserCountsModel.create(mockUserCountsData);
      expect(result).toBe(mockUserCountsData.id);
    });

    it('should find user counts by id', async () => {
      const mockUserCountsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_COUNTS,
      };

      await UserCountsModel.create(mockUserCountsData);
      const result = await UserCountsModel.findById(testUserId1);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(UserCountsModel);
      expect(result!.id).toBe(testUserId1);
      expect(result!.posts).toBe(MOCK_NEXUS_USER_COUNTS.posts);
    });

    it('should return null for non-existent user counts', async () => {
      const nonExistentId = generateTestUserId(999);
      const result = await UserCountsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save user counts from tuples', async () => {
      const mockNexusModelTuples: NexusModelTuple<NexusUserCounts>[] = [
        [testUserId1, MOCK_NEXUS_USER_COUNTS],
        [testUserId2, { ...MOCK_NEXUS_USER_COUNTS, posts: 20 }],
      ];

      const result = await UserCountsModel.bulkSave(mockNexusModelTuples);
      expect(result).toBeDefined();

      // Verify the data was saved correctly
      const userCounts1 = await UserCountsModel.findById(testUserId1);
      const userCounts2 = await UserCountsModel.findById(testUserId2);

      expect(userCounts1).not.toBeNull();
      expect(userCounts2).not.toBeNull();
      expect(userCounts1!.posts).toBe(15);
      expect(userCounts2!.posts).toBe(20);
    });

    it('should handle empty array in bulk save', async () => {
      const result = await UserCountsModel.bulkSave([]);
      // bulkPut with empty array returns undefined, which is expected
      expect(result).toBeUndefined();
    });

    it('should handle multiple tuples with different data', async () => {
      const mockTuples: NexusModelTuple<NexusUserCounts>[] = [
        [testUserId1, MOCK_NEXUS_USER_COUNTS],
        [testUserId2, { ...MOCK_NEXUS_USER_COUNTS, posts: 999, followers: 0 }],
      ];

      await UserCountsModel.bulkSave(mockTuples);

      const userCounts1 = await UserCountsModel.findById(testUserId1);
      const userCounts2 = await UserCountsModel.findById(testUserId2);

      expect(userCounts1).not.toBeNull();
      expect(userCounts2).not.toBeNull();
      expect(userCounts1!.posts).toBe(15);
      expect(userCounts1!.followers).toBe(120);
      expect(userCounts2!.posts).toBe(999);
      expect(userCounts2!.followers).toBe(0);
    });
  });
});
