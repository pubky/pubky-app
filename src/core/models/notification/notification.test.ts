import { describe, it, expect } from 'vitest';
import { NotificationModel } from './notification';
import { NotificationType, FlatNotification } from './notification.types';

// Factory for creating test notifications with business key as id
const createNotification = (timestamp: number, type = NotificationType.Follow): FlatNotification => {
  const followed_by = `user-${timestamp}`;
  return {
    id: `${type}:${timestamp}:${followed_by}`, // Business key format
    type,
    timestamp,
    followed_by,
  } as FlatNotification;
};

const createReply = (timestamp: number): FlatNotification => {
  const replied_by = `user-${timestamp}`;
  const reply_uri = `reply-${timestamp}`;
  return {
    id: `${NotificationType.Reply}:${timestamp}:${replied_by}:${reply_uri}`, // Business key format
    type: NotificationType.Reply,
    timestamp,
    replied_by,
    parent_post_uri: 'post123',
    reply_uri,
  } as FlatNotification;
};

describe('NotificationModel', () => {
  describe('bulkSave', () => {
    it('should save notifications to IndexedDB', async () => {
      const notifications = [createNotification(1000), createReply(2000)];

      await NotificationModel.bulkSave(notifications);

      const saved = await NotificationModel.table.toArray();
      expect(saved).toHaveLength(2);
      expect(saved.map((n) => n.type)).toEqual([NotificationType.Follow, NotificationType.Reply]);
    });
  });

  describe('constructor', () => {
    it('should create notification instance with all properties', () => {
      const data = createNotification(1000);
      const notification = new NotificationModel(data);

      expect(notification.type).toBe(NotificationType.Follow);
      expect(notification.timestamp).toBe(1000);
    });
  });

  describe('getAll', () => {
    it('should return all notifications in descending timestamp order', async () => {
      await NotificationModel.bulkSave([createNotification(1000), createNotification(3000), createNotification(2000)]);

      const all = await NotificationModel.getAll();

      expect(all).toHaveLength(3);
      expect(all[0].timestamp).toBe(3000);
      expect(all[1].timestamp).toBe(2000);
      expect(all[2].timestamp).toBe(1000);
    });

    it('should return empty array when no notifications exist', async () => {
      const all = await NotificationModel.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('getRecent', () => {
    it('should return notifications in descending timestamp order', async () => {
      await NotificationModel.bulkSave([createNotification(1000), createNotification(3000), createNotification(2000)]);

      const recent = await NotificationModel.getRecent(2);

      expect(recent).toHaveLength(2);
      expect(recent[0].timestamp).toBe(3000);
      expect(recent[1].timestamp).toBe(2000);
    });
  });

  describe('getByType', () => {
    it('should filter notifications by type', async () => {
      await NotificationModel.bulkSave([createNotification(1000), createReply(2000), createNotification(3000)]);

      const follows = await NotificationModel.getByType(NotificationType.Follow);
      const replies = await NotificationModel.getByType(NotificationType.Reply);

      expect(follows).toHaveLength(2);
      expect(replies).toHaveLength(1);
    });
  });

  describe('getRecentByType', () => {
    it('should return recent notifications of specific type in descending order', async () => {
      await NotificationModel.bulkSave([
        createNotification(1000),
        createNotification(3000),
        createNotification(2000),
        createReply(2500),
      ]);

      const recentFollows = await NotificationModel.getRecentByType(NotificationType.Follow, 2);

      expect(recentFollows).toHaveLength(2);
      expect(recentFollows[0].timestamp).toBe(3000);
      expect(recentFollows[1].timestamp).toBe(2000);
    });
  });

  describe('getOlderThan', () => {
    it('should return notifications older than timestamp in descending order', async () => {
      await NotificationModel.bulkSave([1000, 2000, 3000, 4000, 5000].map((t) => createNotification(t)));

      const result = await NotificationModel.getOlderThan(4000, 10);

      expect(result.map((n) => n.timestamp)).toEqual([3000, 2000, 1000]);
    });

    it('should respect limit parameter', async () => {
      await NotificationModel.bulkSave([1000, 2000, 3000, 4000].map((t) => createNotification(t)));

      const result = await NotificationModel.getOlderThan(5000, 2);

      expect(result.map((n) => n.timestamp)).toEqual([4000, 3000]);
    });

    it.each([
      { olderThan: 3000, timestamps: [5000, 6000], expected: 0 },
      { olderThan: Infinity, timestamps: [1000, 2000, 3000], expected: 3 },
      { olderThan: 2000, timestamps: [1000, 2000, 3000], expected: 1 }, // Excludes equal timestamp
    ])('olderThan=$olderThan returns $expected notifications', async ({ olderThan, timestamps, expected }) => {
      await NotificationModel.bulkSave(timestamps.map((t) => createNotification(t)));

      const result = await NotificationModel.getOlderThan(olderThan, 10);

      expect(result).toHaveLength(expected);
    });

    it('should return empty array when table is empty', async () => {
      const result = await NotificationModel.getOlderThan(Infinity, 10);
      expect(result).toHaveLength(0);
    });
  });

  describe('countNewerThan', () => {
    it('should count only notifications with timestamp strictly above the given value', async () => {
      await NotificationModel.bulkSave([1000, 2000, 3000].map((t) => createNotification(t)));

      const count = await NotificationModel.countNewerThan(1500);

      expect(count).toBe(2);
    });

    it('should exclude notifications at exact timestamp boundary', async () => {
      await NotificationModel.bulkSave([1000, 2000, 3000].map((t) => createNotification(t)));

      const count = await NotificationModel.countNewerThan(2000);

      expect(count).toBe(1);
    });

    it('should return 0 when no notifications are newer', async () => {
      await NotificationModel.bulkSave([1000, 2000].map((t) => createNotification(t)));

      const count = await NotificationModel.countNewerThan(5000);

      expect(count).toBe(0);
    });

    it('should return full count when threshold is 0', async () => {
      await NotificationModel.bulkSave([1000, 2000, 3000].map((t) => createNotification(t)));

      const count = await NotificationModel.countNewerThan(0);

      expect(count).toBe(3);
    });

    it('should return 0 on empty table', async () => {
      const count = await NotificationModel.countNewerThan(0);

      expect(count).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all notifications', async () => {
      await NotificationModel.bulkSave([createNotification(1000), createNotification(2000)]);
      expect(await NotificationModel.table.count()).toBe(2);

      await NotificationModel.clear();

      expect(await NotificationModel.table.count()).toBe(0);
    });

    it('should not throw when table is already empty', async () => {
      await expect(NotificationModel.clear()).resolves.not.toThrow();
    });
  });
});
