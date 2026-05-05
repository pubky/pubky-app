import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase } from '@/database/franky/franky.helpers';
import type { Pubky } from '@/models/models.types';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import { UserConnectionsModel } from '@/models/user/connections/userConnections';
import { UserConnectionsFields } from '@/models/user/connections/userConnections.schema';
import { generateTestUserId } from '@/models/user/users.helpers';

describe('UserConnectionsModel', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  const testUserId1 = generateTestUserId(1);
  const testUserId2 = generateTestUserId(2);
  const testUserId3 = generateTestUserId(3);

  const MOCK_CONNECTIONS_1 = {
    following: [testUserId2],
    followers: [testUserId3],
  };

  const MOCK_CONNECTIONS_2 = {
    following: [testUserId1, testUserId3],
    followers: [],
  };

  describe('Constructor', () => {
    it('should create UserConnectionsModel instance with all properties', () => {
      const mockData = {
        id: testUserId1,
        ...MOCK_CONNECTIONS_1,
      };

      const model = new UserConnectionsModel(mockData);

      expect(model.id).toBe(mockData.id);
      expect(model.following).toEqual(MOCK_CONNECTIONS_1.following);
      expect(model.followers).toEqual(MOCK_CONNECTIONS_1.followers);
    });
  });

  describe('Static Methods', () => {
    it('should create user connections', async () => {
      const mockData = { id: testUserId1, ...MOCK_CONNECTIONS_1 };
      const result = await UserConnectionsModel.create(mockData);
      expect(result).toBe(mockData.id);
    });

    it('should find user connections by id', async () => {
      const mockData = { id: testUserId1, ...MOCK_CONNECTIONS_1 };
      await UserConnectionsModel.create(mockData);
      const result = await UserConnectionsModel.findById(testUserId1);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(UserConnectionsModel);
      expect(result!.id).toBe(testUserId1);
      expect(result!.following).toEqual(MOCK_CONNECTIONS_1.following);
      expect(result!.followers).toEqual(MOCK_CONNECTIONS_1.followers);
    });

    it('should return null for non-existent user connections', async () => {
      const nonExistentId = generateTestUserId(999);
      const result = await UserConnectionsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save user connections from tuples', async () => {
      const tuples: NexusModelTuple<{ following: Pubky[]; followers: Pubky[] }>[] = [
        [testUserId1, MOCK_CONNECTIONS_1],
        [testUserId2, MOCK_CONNECTIONS_2],
      ];

      const result = await UserConnectionsModel.bulkSave(tuples);
      expect(result).toBeDefined();

      const c1 = await UserConnectionsModel.findById(testUserId1);
      const c2 = await UserConnectionsModel.findById(testUserId2);

      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
      expect(c1!.following).toEqual(MOCK_CONNECTIONS_1.following);
      expect(c1!.followers).toEqual(MOCK_CONNECTIONS_1.followers);
      expect(c2!.following).toEqual(MOCK_CONNECTIONS_2.following);
      expect(c2!.followers).toEqual(MOCK_CONNECTIONS_2.followers);
    });

    it('should handle empty array in bulk save', async () => {
      const result = await UserConnectionsModel.bulkSave([]);
      expect(result).toBeUndefined();
    });

    it('should handle multiple tuples with different data', async () => {
      const tuples: NexusModelTuple<{ following: Pubky[]; followers: Pubky[] }>[] = [
        [testUserId1, { following: [testUserId2], followers: [testUserId3] }],
        [testUserId2, { following: [], followers: [testUserId1] }],
      ];

      await UserConnectionsModel.bulkSave(tuples);

      const c1 = await UserConnectionsModel.findById(testUserId1);
      const c2 = await UserConnectionsModel.findById(testUserId2);

      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
      expect(c1!.following).toEqual([testUserId2]);
      expect(c1!.followers).toEqual([testUserId3]);
      expect(c2!.following).toEqual([]);
      expect(c2!.followers).toEqual([testUserId1]);
    });
  });

  describe('createConnection/deleteConnection boolean returns', () => {
    const userA = generateTestUserId(10);
    const userB = generateTestUserId(11);

    it('createConnection returns true when a new connection is added', async () => {
      const added = await UserConnectionsModel.createConnection(userA, userB, UserConnectionsFields.FOLLOWING);
      expect(added).toBe(true);

      const row = await UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following).toContain(userB);
    });

    it('createConnection returns false when the connection already exists (no-op)', async () => {
      await UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
      const added = await UserConnectionsModel.createConnection(userA, userB, UserConnectionsFields.FOLLOWING);
      expect(added).toBe(false);

      const row = await UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following.filter((x) => x === userB).length).toBe(1);
    });

    it('deleteConnection returns true when an existing connection is removed', async () => {
      await UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
      const removed = await UserConnectionsModel.deleteConnection(userA, userB, UserConnectionsFields.FOLLOWING);
      expect(removed).toBe(true);

      const row = await UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following).not.toContain(userB);
    });

    it('deleteConnection returns false when the connection does not exist (no-op)', async () => {
      await UserConnectionsModel.create({ id: userA, following: [], followers: [] });
      const removed = await UserConnectionsModel.deleteConnection(userA, userB, UserConnectionsFields.FOLLOWING);
      expect(removed).toBe(false);

      const row = await UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following).toEqual([]);
    });
  });
});
