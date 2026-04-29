import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HotController } from './hot';
import { HotApplication } from '@/application/hot/hot';
import type { Pubky } from '@/models/models.types';
import { UserStreamReach, UserStreamTimeframe, type NexusHotTag } from '@/services/nexus/nexus.types';
import type { TTagHotParams } from '@/services/nexus/tag/tag.types';
import { useAuthStore } from '@/stores/auth/auth.store';
const mockCurrentUserPubky = 'current-user-pubky' as Pubky;

describe('HotController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      ...useAuthStore.getState(),
      currentUserPubky: mockCurrentUserPubky,
    });
  });

  describe('getOrFetch', () => {
    it('should delegate to HotApplication.getOrFetch', async () => {
      const mockHotTags = [
        {
          label: 'bitcoin',
          tagged_count: 100,
          taggers_count: 2,
          taggers_id: ['user1', 'user2'],
        },
        {
          label: 'pubky',
          tagged_count: 50,
          taggers_count: 1,
          taggers_id: ['user3'],
        },
      ] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        limit: 10,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
      expect(getOrFetchSpy).toHaveBeenCalledOnce();
    });

    it('should pass pagination params correctly', async () => {
      const mockHotTags = [] as NexusHotTag[];

      const params: TTagHotParams = {
        reach: UserStreamReach.FRIENDS,
        timeframe: UserStreamTimeframe.THIS_MONTH,
        skip: 10,
        limit: 20,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      await HotController.getOrFetch(params);

      expect(getOrFetchSpy).toHaveBeenCalledWith({ ...params, user_id: mockCurrentUserPubky });
    });

    it('should bubble when HotApplication.getOrFetch fails', async () => {
      const params: TTagHotParams = {
        reach: UserStreamReach.FOLLOWING,
        timeframe: UserStreamTimeframe.TODAY,
        user_id: 'user-123',
      };

      vi.spyOn(HotApplication, 'getOrFetch').mockRejectedValue(new Error('application-fail'));

      await expect(HotController.getOrFetch(params)).rejects.toThrow('application-fail');
    });

    it('should return empty array when application returns empty array', async () => {
      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
      };

      vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue([]);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual([]);
    });

    it('should handle user_id parameter', async () => {
      const mockHotTags = [
        {
          label: 'personalised',
          tagged_count: 10,
          taggers_count: 1,
          taggers_id: ['user1'],
        },
      ] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        user_id: 'user-123',
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle taggers_limit parameter', async () => {
      const mockHotTags = [
        {
          label: 'limited',
          tagged_count: 50,
          taggers_count: 5,
          taggers_id: ['user1', 'user2'],
        },
      ] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        taggers_limit: 2,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle limit: 0', async () => {
      const mockHotTags = [] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        limit: 0,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle skip: 0', async () => {
      const mockHotTags = [] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        skip: 0,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle large limit values', async () => {
      const mockHotTags = [] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        limit: 1000,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle all optional parameters together', async () => {
      const mockHotTags = [
        {
          label: 'comprehensive',
          tagged_count: 200,
          taggers_count: 10,
          taggers_id: ['user1', 'user2', 'user3'],
        },
      ] as NexusHotTag[];

      const params: TTagHotParams = {
        reach: UserStreamReach.FRIENDS,
        timeframe: UserStreamTimeframe.THIS_MONTH,
        skip: 5,
        limit: 25,
        user_id: 'user-456',
        taggers_limit: 3,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      const result = await HotController.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle different reach values', async () => {
      const mockHotTags = [] as NexusHotTag[];
      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      await HotController.getOrFetch({
        reach: UserStreamReach.FOLLOWING,
        timeframe: UserStreamTimeframe.TODAY,
      });
      await HotController.getOrFetch({
        reach: UserStreamReach.FRIENDS,
        timeframe: UserStreamTimeframe.TODAY,
      });
      await HotController.getOrFetch({ timeframe: UserStreamTimeframe.TODAY });

      expect(getOrFetchSpy).toHaveBeenCalledTimes(3);
      // reach calls should have user_id injected
      expect(getOrFetchSpy).toHaveBeenNthCalledWith(1, {
        reach: UserStreamReach.FOLLOWING,
        timeframe: UserStreamTimeframe.TODAY,
        user_id: mockCurrentUserPubky,
      });
      expect(getOrFetchSpy).toHaveBeenNthCalledWith(2, {
        reach: UserStreamReach.FRIENDS,
        timeframe: UserStreamTimeframe.TODAY,
        user_id: mockCurrentUserPubky,
      });
      // No reach → no user_id injection
      expect(getOrFetchSpy).toHaveBeenNthCalledWith(3, {
        timeframe: UserStreamTimeframe.TODAY,
      });
    });

    it('should not inject user_id when user is not authenticated', async () => {
      vi.spyOn(useAuthStore, 'getState').mockReturnValue({
        ...useAuthStore.getState(),
        currentUserPubky: null,
      });

      const mockHotTags = [] as NexusHotTag[];
      const params: TTagHotParams = {
        reach: UserStreamReach.FOLLOWING,
        timeframe: UserStreamTimeframe.TODAY,
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      await HotController.getOrFetch(params);

      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should not inject user_id when user_id is already provided', async () => {
      const mockHotTags = [] as NexusHotTag[];
      const params: TTagHotParams = {
        reach: UserStreamReach.FOLLOWING,
        timeframe: UserStreamTimeframe.TODAY,
        user_id: 'explicit-user-id',
      };

      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      await HotController.getOrFetch(params);

      // Should use the explicitly provided user_id, not inject from auth store
      expect(getOrFetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle different timeframe values', async () => {
      const mockHotTags = [] as NexusHotTag[];
      const getOrFetchSpy = vi.spyOn(HotApplication, 'getOrFetch').mockResolvedValue(mockHotTags);

      await HotController.getOrFetch({ timeframe: UserStreamTimeframe.TODAY });
      await HotController.getOrFetch({ timeframe: UserStreamTimeframe.THIS_WEEK });
      await HotController.getOrFetch({ timeframe: UserStreamTimeframe.THIS_MONTH });
      await HotController.getOrFetch({ timeframe: UserStreamTimeframe.ALL_TIME });

      expect(getOrFetchSpy).toHaveBeenCalledTimes(4);
    });
  });
});
