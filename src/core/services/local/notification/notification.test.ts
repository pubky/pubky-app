import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalNotificationService } from './notification';
import { NotificationModel } from '@/models/notification/notification';
import { NotificationType, type FlatNotification } from '@/models/notification/notification.types';
const createFlat = (timestamp: number): FlatNotification =>
  ({ type: NotificationType.Follow, timestamp, followed_by: `user-${timestamp}` }) as FlatNotification;

describe('LocalNotificationService', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getOlderThan', () => {
    it('should delegate to NotificationModel.getOlderThan', async () => {
      const expected = [createFlat(4000), createFlat(3000)];
      const modelSpy = vi.spyOn(NotificationModel, 'getOlderThan').mockResolvedValue(expected);

      const result = await LocalNotificationService.getOlderThan({ olderThan: 5000, limit: 10 });

      expect(modelSpy).toHaveBeenCalledWith(5000, 10);
      expect(result).toEqual(expected);
    });

    it('should return empty array when no notifications found', async () => {
      vi.spyOn(NotificationModel, 'getOlderThan').mockResolvedValue([]);

      const result = await LocalNotificationService.getOlderThan({ olderThan: 1000, limit: 10 });

      expect(result).toEqual([]);
    });

    it('should bubble model errors', async () => {
      vi.spyOn(NotificationModel, 'getOlderThan').mockRejectedValue(new Error('query-failed'));

      await expect(LocalNotificationService.getOlderThan({ olderThan: 1000, limit: 10 })).rejects.toThrow(
        'query-failed',
      );
    });
  });

  describe('getAll', () => {
    it('should delegate to NotificationModel.getAll', async () => {
      const expected = [createFlat(3000), createFlat(2000), createFlat(1000)];
      const modelSpy = vi.spyOn(NotificationModel, 'getAll').mockResolvedValue(expected);

      const result = await LocalNotificationService.getAll();

      expect(modelSpy).toHaveBeenCalled();
      expect(result).toEqual(expected);
    });

    it('should return empty array when no notifications exist', async () => {
      vi.spyOn(NotificationModel, 'getAll').mockResolvedValue([]);

      const result = await LocalNotificationService.getAll();

      expect(result).toEqual([]);
    });

    it('should bubble model errors', async () => {
      vi.spyOn(NotificationModel, 'getAll').mockRejectedValue(new Error('query-failed'));

      await expect(LocalNotificationService.getAll()).rejects.toThrow('query-failed');
    });
  });

  describe('countUnreadSince', () => {
    it('should delegate to NotificationModel.countNewerThan with the correct argument', async () => {
      const modelSpy = vi.spyOn(NotificationModel, 'countNewerThan').mockResolvedValue(3);

      const result = await LocalNotificationService.countUnreadSince(1000);

      expect(modelSpy).toHaveBeenCalledWith(1000);
      expect(result).toBe(3);
    });

    it('should return 0 when no unread notifications exist', async () => {
      vi.spyOn(NotificationModel, 'countNewerThan').mockResolvedValue(0);

      const result = await LocalNotificationService.countUnreadSince(5000);

      expect(result).toBe(0);
    });

    it('should bubble model errors', async () => {
      vi.spyOn(NotificationModel, 'countNewerThan').mockRejectedValue(new Error('count-failed'));

      await expect(LocalNotificationService.countUnreadSince(1000)).rejects.toThrow('count-failed');
    });
  });
});
