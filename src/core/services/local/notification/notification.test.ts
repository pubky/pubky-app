import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import { LocalNotificationService } from './notification';

const createFlat = (timestamp: number): Core.FlatNotification =>
  ({ type: Core.NotificationType.Follow, timestamp, followed_by: `user-${timestamp}` }) as Core.FlatNotification;

describe('LocalNotificationService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('persistAndGetUnreadCount', () => {
    const lastRead = 1000;

    it('should persist and return unread count', async () => {
      const flatNotifications = [createFlat(2000), createFlat(1500), createFlat(500)];
      const bulkSaveSpy = vi.spyOn(Core.NotificationModel, 'bulkSave').mockResolvedValue(undefined);

      const unreadCount = await LocalNotificationService.persistAndGetUnreadCount({ flatNotifications, lastRead });

      expect(unreadCount).toBe(2); // 2000 and 1500 are newer than 1000
      expect(bulkSaveSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ timestamp: 2000 }),
          expect.objectContaining({ timestamp: 1500 }),
          expect.objectContaining({ timestamp: 500 }),
        ]),
      );
    });

    it.each([
      { timestamps: [500, 300], lastRead: 1000, expected: 0, desc: 'all older' },
      { timestamps: [3000, 2000], lastRead: 1000, expected: 2, desc: 'all newer' },
      { timestamps: [1000], lastRead: 1000, expected: 0, desc: 'equal to lastRead' },
      { timestamps: [], lastRead: 1000, expected: 0, desc: 'empty list' },
    ])('should return $expected when $desc', async ({ timestamps, lastRead, expected }) => {
      vi.spyOn(Core.NotificationModel, 'bulkSave').mockResolvedValue(undefined);

      const flatNotifications = timestamps.map(createFlat);
      const unreadCount = await LocalNotificationService.persistAndGetUnreadCount({ flatNotifications, lastRead });

      expect(unreadCount).toBe(expected);
    });

    it('should bubble bulkSave errors', async () => {
      vi.spyOn(Core.NotificationModel, 'bulkSave').mockRejectedValue(new Error('db-error'));

      await expect(
        LocalNotificationService.persistAndGetUnreadCount({ flatNotifications: [createFlat(2000)], lastRead }),
      ).rejects.toThrow('db-error');
    });
  });

  describe('getOlderThan', () => {
    it('should delegate to NotificationModel.getOlderThan', async () => {
      const expected = [createFlat(4000), createFlat(3000)];
      const modelSpy = vi.spyOn(Core.NotificationModel, 'getOlderThan').mockResolvedValue(expected);

      const result = await LocalNotificationService.getOlderThan({ olderThan: 5000, limit: 10 });

      expect(modelSpy).toHaveBeenCalledWith(5000, 10);
      expect(result).toEqual(expected);
    });

    it('should return empty array when no notifications found', async () => {
      vi.spyOn(Core.NotificationModel, 'getOlderThan').mockResolvedValue([]);

      const result = await LocalNotificationService.getOlderThan({ olderThan: 1000, limit: 10 });

      expect(result).toEqual([]);
    });

    it('should bubble model errors', async () => {
      vi.spyOn(Core.NotificationModel, 'getOlderThan').mockRejectedValue(new Error('query-failed'));

      await expect(LocalNotificationService.getOlderThan({ olderThan: 1000, limit: 10 })).rejects.toThrow(
        'query-failed',
      );
    });
  });

  describe('getAll', () => {
    it('should delegate to NotificationModel.getAll', async () => {
      const expected = [createFlat(3000), createFlat(2000), createFlat(1000)];
      const modelSpy = vi.spyOn(Core.NotificationModel, 'getAll').mockResolvedValue(expected);

      const result = await LocalNotificationService.getAll();

      expect(modelSpy).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('should return empty array when no notifications exist', async () => {
      vi.spyOn(Core.NotificationModel, 'getAll').mockResolvedValue([]);

      const result = await LocalNotificationService.getAll();

      expect(result).toEqual([]);
    });

    it('should bubble model errors', async () => {
      vi.spyOn(Core.NotificationModel, 'getAll').mockRejectedValue(new Error('query-failed'));

      await expect(LocalNotificationService.getAll()).rejects.toThrow('query-failed');
    });
  });

  describe('countUnreadSince', () => {
    it('should delegate to NotificationModel.countNewerThan with the correct argument', async () => {
      const modelSpy = vi.spyOn(Core.NotificationModel, 'countNewerThan').mockResolvedValue(3);

      const result = await LocalNotificationService.countUnreadSince(1000);

      expect(modelSpy).toHaveBeenCalledWith(1000);
      expect(result).toBe(3);
    });

    it('should return 0 when no unread notifications exist', async () => {
      vi.spyOn(Core.NotificationModel, 'countNewerThan').mockResolvedValue(0);

      const result = await LocalNotificationService.countUnreadSince(5000);

      expect(result).toBe(0);
    });

    it('should bubble model errors', async () => {
      vi.spyOn(Core.NotificationModel, 'countNewerThan').mockRejectedValue(new Error('count-failed'));

      await expect(LocalNotificationService.countUnreadSince(1000)).rejects.toThrow('count-failed');
    });
  });
});
