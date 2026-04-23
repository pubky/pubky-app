import { describe, it, expect, beforeEach } from 'vitest';
import * as Core from '@/core';

describe('UserConnectionsModel', () => {
  beforeEach(async () => {
    await Core.resetDatabase();
  });

  const testUserId1 = Core.generateTestUserId(1);
  const testUserId2 = Core.generateTestUserId(2);
  const testUserId3 = Core.generateTestUserId(3);

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

      const model = new Core.UserConnectionsModel(mockData);

      expect(model.id).toBe(mockData.id);
      expect(model.following).toEqual(MOCK_CONNECTIONS_1.following);
      expect(model.followers).toEqual(MOCK_CONNECTIONS_1.followers);
    });
  });

  describe('Static Methods', () => {
    it('should create user connections', async () => {
      const mockData = { id: testUserId1, ...MOCK_CONNECTIONS_1 };
      const result = await Core.UserConnectionsModel.create(mockData);
      expect(result).toBe(mockData.id);
    });

    it('should find user connections by id', async () => {
      const mockData = { id: testUserId1, ...MOCK_CONNECTIONS_1 };
      await Core.UserConnectionsModel.create(mockData);
      const result = await Core.UserConnectionsModel.findById(testUserId1);

      expect(result).not.toBeNull();
      expect(result!).toBeInstanceOf(Core.UserConnectionsModel);
      expect(result!.id).toBe(testUserId1);
      expect(result!.following).toEqual(MOCK_CONNECTIONS_1.following);
      expect(result!.followers).toEqual(MOCK_CONNECTIONS_1.followers);
    });

    it('should return null for non-existent user connections', async () => {
      const nonExistentId = Core.generateTestUserId(999);
      const result = await Core.UserConnectionsModel.findById(nonExistentId);
      expect(result).toBeNull();
    });

    it('should bulk save user connections from tuples', async () => {
      const tuples: Core.NexusModelTuple<{ following: Core.Pubky[]; followers: Core.Pubky[] }>[] = [
        [testUserId1, MOCK_CONNECTIONS_1],
        [testUserId2, MOCK_CONNECTIONS_2],
      ];

      const result = await Core.UserConnectionsModel.bulkSave(tuples);
      expect(result).toBeDefined();

      const c1 = await Core.UserConnectionsModel.findById(testUserId1);
      const c2 = await Core.UserConnectionsModel.findById(testUserId2);

      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
      expect(c1!.following).toEqual(MOCK_CONNECTIONS_1.following);
      expect(c1!.followers).toEqual(MOCK_CONNECTIONS_1.followers);
      expect(c2!.following).toEqual(MOCK_CONNECTIONS_2.following);
      expect(c2!.followers).toEqual(MOCK_CONNECTIONS_2.followers);
    });

    it('should handle empty array in bulk save', async () => {
      const result = await Core.UserConnectionsModel.bulkSave([]);
      expect(result).toBeUndefined();
    });

    it('should handle multiple tuples with different data', async () => {
      const tuples: Core.NexusModelTuple<{ following: Core.Pubky[]; followers: Core.Pubky[] }>[] = [
        [testUserId1, { following: [testUserId2], followers: [testUserId3] }],
        [testUserId2, { following: [], followers: [testUserId1] }],
      ];

      await Core.UserConnectionsModel.bulkSave(tuples);

      const c1 = await Core.UserConnectionsModel.findById(testUserId1);
      const c2 = await Core.UserConnectionsModel.findById(testUserId2);

      expect(c1).not.toBeNull();
      expect(c2).not.toBeNull();
      expect(c1!.following).toEqual([testUserId2]);
      expect(c1!.followers).toEqual([testUserId3]);
      expect(c2!.following).toEqual([]);
      expect(c2!.followers).toEqual([testUserId1]);
    });
  });

  describe('createConnection/deleteConnection boolean returns', () => {
    const userA = Core.generateTestUserId(10);
    const userB = Core.generateTestUserId(11);

    it('createConnection returns true when a new connection is added', async () => {
      const added = await Core.UserConnectionsModel.createConnection(
        userA,
        userB,
        Core.UserConnectionsFields.FOLLOWING,
      );
      expect(added).toBe(true);

      const row = await Core.UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following).toContain(userB);
    });

    it('createConnection returns false when the connection already exists (no-op)', async () => {
      await Core.UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
      const added = await Core.UserConnectionsModel.createConnection(
        userA,
        userB,
        Core.UserConnectionsFields.FOLLOWING,
      );
      expect(added).toBe(false);

      const row = await Core.UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following.filter((x) => x === userB).length).toBe(1);
    });

    it('deleteConnection returns true when an existing connection is removed', async () => {
      await Core.UserConnectionsModel.create({ id: userA, following: [userB], followers: [] });
      const removed = await Core.UserConnectionsModel.deleteConnection(
        userA,
        userB,
        Core.UserConnectionsFields.FOLLOWING,
      );
      expect(removed).toBe(true);

      const row = await Core.UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following).not.toContain(userB);
    });

    it('deleteConnection returns false when the connection does not exist (no-op)', async () => {
      await Core.UserConnectionsModel.create({ id: userA, following: [], followers: [] });
      const removed = await Core.UserConnectionsModel.deleteConnection(
        userA,
        userB,
        Core.UserConnectionsFields.FOLLOWING,
      );
      expect(removed).toBe(false);

      const row = await Core.UserConnectionsModel.findById(userA);
      expect(row).not.toBeNull();
      expect(row!.following).toEqual([]);
    });
  });
});
