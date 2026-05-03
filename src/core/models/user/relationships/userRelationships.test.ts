import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { generateTestUserId } from '@/models/user/users.helpers';
import type { NexusUserRelationship } from '@/services/nexus/nexus.types';
describe('UserRelationshipsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testUserId1 = generateTestUserId(1);
  const testUserId2 = generateTestUserId(2);

  const MOCK_NEXUS_USER_RELATIONSHIP: Omit<NexusUserRelationship, 'id'> = {
    following: true,
    followed_by: false,
  };

  describe('Constructor', () => {
    it('should create UserRelationshipsModel instance with all properties', () => {
      const mockUserRelationshipsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_RELATIONSHIP,
      };

      const userRelationships = new UserRelationshipsModel(mockUserRelationshipsData);

      expect(userRelationships.id).toBe(mockUserRelationshipsData.id);
      expect(userRelationships.following).toBe(mockUserRelationshipsData.following);
      expect(userRelationships.followed_by).toBe(mockUserRelationshipsData.followed_by);
    });
  });

  describe('Static Methods', () => {
    it('should create user relationships', async () => {
      const mockUserRelationshipsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_RELATIONSHIP,
      };

      const result = await UserRelationshipsModel.create(mockUserRelationshipsData);
      expect(result).toBe(mockUserRelationshipsData.id);
    });

    it('should find user relationships by id', async () => {
      const mockUserRelationshipsData = {
        id: testUserId1,
        ...MOCK_NEXUS_USER_RELATIONSHIP,
      };

      await UserRelationshipsModel.create(mockUserRelationshipsData);
      const result = await UserRelationshipsModel.findById(testUserId1);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(UserRelationshipsModel);
      expect(result!.id).toBe(testUserId1);
      expect(result!.following).toBe(MOCK_NEXUS_USER_RELATIONSHIP.following);
      expect(result!.followed_by).toBe(MOCK_NEXUS_USER_RELATIONSHIP.followed_by);
    });

    it('should return null for non-existent user relationships', async () => {
      const nonExistentId = generateTestUserId(999);
      const result = await UserRelationshipsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save user relationships from tuples', async () => {
      const mockNexusModelTuples: NexusModelTuple<NexusUserRelationship>[] = [
        [testUserId1, MOCK_NEXUS_USER_RELATIONSHIP],
        [testUserId2, { following: false, followed_by: true }],
      ];

      const result = await UserRelationshipsModel.bulkSave(mockNexusModelTuples);
      expect(result).toBeDefined();

      // Verify the data was saved correctly
      const userRelationships1 = await UserRelationshipsModel.findById(testUserId1);
      const userRelationships2 = await UserRelationshipsModel.findById(testUserId2);

      expect(userRelationships1).not.toBeNull();
      expect(userRelationships2).not.toBeNull();
      expect(userRelationships1!.following).toBe(true);
      expect(userRelationships1!.followed_by).toBe(false);
      expect(userRelationships2!.following).toBe(false);
      expect(userRelationships2!.followed_by).toBe(true);
    });

    it('should handle empty array in bulk save', async () => {
      const result = await UserRelationshipsModel.bulkSave([]);
      // bulkPut with empty array returns undefined, which is expected
      expect(result).toBeUndefined();
    });

    it('should handle multiple tuples with different relationship states', async () => {
      const mockTuples: NexusModelTuple<NexusUserRelationship>[] = [
        [testUserId1, { following: true, followed_by: true }],
        [testUserId2, { following: false, followed_by: false }],
      ];

      await UserRelationshipsModel.bulkSave(mockTuples);

      const userRelationships1 = await UserRelationshipsModel.findById(testUserId1);
      const userRelationships2 = await UserRelationshipsModel.findById(testUserId2);

      // User 1: mutual following
      expect(userRelationships1).not.toBeNull();
      expect(userRelationships1!.following).toBe(true);
      expect(userRelationships1!.followed_by).toBe(true);

      // User 2: no following relationship
      expect(userRelationships2).not.toBeNull();
      expect(userRelationships2!.following).toBe(false);
      expect(userRelationships2!.followed_by).toBe(false);
    });
  });
});
