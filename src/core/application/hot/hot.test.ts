import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Core from '@/core';
import * as Libs from '@/libs';
import { HotApplication } from './hot';

describe('HotApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock user fetching to prevent actual network calls
    vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
    vi.spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue(undefined);
  });

  describe('getOrFetch', () => {
    it('should fetch hot tags and return them', async () => {
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
      ] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
        limit: 10,
      };

      // Mock cache miss
      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue(null);
      vi.spyOn(Core.LocalHotService, 'upsert').mockResolvedValue(undefined);
      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      // On cache miss, limit is stripped from fetch params to cache the full set
      expect(fetchSpy).toHaveBeenCalledWith({ timeframe: Core.UserStreamTimeframe.TODAY });
      expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it('should pass pagination params to service', async () => {
      const mockHotTags = [
        {
          label: 'music',
          tagged_count: 75,
          taggers_count: 1,
          taggers_id: ['user4'],
        },
      ] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        reach: Core.UserStreamReach.FRIENDS,
        timeframe: Core.UserStreamTimeframe.THIS_MONTH,
        skip: 10,
        limit: 20,
      };

      // When skip > 0, bypasses cache
      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(fetchSpy).toHaveBeenCalledWith(params);
    });

    it('should return empty array when service fails', async () => {
      const params: Core.TTagHotParams = {
        reach: Core.UserStreamReach.FOLLOWING,
        timeframe: Core.UserStreamTimeframe.TODAY,
      };

      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue(null);
      vi.spyOn(Core.NexusHotService, 'fetch').mockRejectedValue(new Error('service-fail'));

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual([]);
    });

    it('should return empty array when service returns empty array', async () => {
      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
      };

      vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue([]);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual([]);
    });

    it('should handle AppError and return empty array', async () => {
      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
      };

      const appError = Libs.Err.network(Libs.NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
        service: Libs.ErrorService.Nexus,
        operation: 'fetch',
        context: { statusCode: 500 },
      });
      vi.spyOn(Core.NexusHotService, 'fetch').mockRejectedValue(appError);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual([]);
    });

    it('should log error when service fails', async () => {
      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
      };

      const error = new Error('service-fail');
      const loggerSpy = vi.spyOn(Libs.Logger, 'error');
      vi.spyOn(Core.NexusHotService, 'fetch').mockRejectedValue(error);

      await HotApplication.getOrFetch(params);

      expect(loggerSpy).toHaveBeenCalledWith('Error in HotApplication.getOrFetch:', error);
    });

    it('should handle user_id parameter', async () => {
      const mockHotTags = [
        {
          label: 'personalised',
          tagged_count: 10,
          taggers_count: 1,
          taggers_id: ['user1'],
        },
      ] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
        user_id: 'user-123',
      };

      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(fetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle taggers_limit parameter', async () => {
      const mockHotTags = [
        {
          label: 'limited',
          tagged_count: 50,
          taggers_count: 5,
          taggers_id: ['user1', 'user2'],
        },
      ] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
        taggers_limit: 2,
      };

      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(fetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle limit: 0', async () => {
      const mockHotTags = [] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
        limit: 0,
      };

      // Mock cache miss
      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue(null);
      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      // limit is stripped from fetch params on cache miss
      expect(fetchSpy).toHaveBeenCalledWith({ timeframe: Core.UserStreamTimeframe.TODAY });
    });

    it('should handle skip: 0', async () => {
      const mockHotTags = [] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
        skip: 0,
      };

      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(fetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle large limit values', async () => {
      const mockHotTags = [] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        timeframe: Core.UserStreamTimeframe.TODAY,
        limit: 9999,
      };

      // Mock cache miss
      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue(null);
      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      // limit is stripped from fetch params on cache miss
      expect(fetchSpy).toHaveBeenCalledWith({ timeframe: Core.UserStreamTimeframe.TODAY });
    });

    it('should handle all optional parameters together', async () => {
      const mockHotTags = [
        {
          label: 'comprehensive',
          tagged_count: 200,
          taggers_count: 10,
          taggers_id: ['user1', 'user2', 'user3'],
        },
      ] as Core.NexusHotTag[];

      const params: Core.TTagHotParams = {
        reach: Core.UserStreamReach.FRIENDS,
        timeframe: Core.UserStreamTimeframe.THIS_MONTH,
        skip: 5,
        limit: 25,
        user_id: 'user-456',
        taggers_limit: 3,
      };

      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch(params);

      expect(result).toEqual(mockHotTags);
      expect(fetchSpy).toHaveBeenCalledWith(params);
    });

    it('should handle different reach values', async () => {
      const mockHotTags = [] as Core.NexusHotTag[];

      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue(null);
      vi.spyOn(Core.LocalHotService, 'upsert').mockResolvedValue(undefined);
      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      await HotApplication.getOrFetch({
        reach: Core.UserStreamReach.FOLLOWING,
        timeframe: Core.UserStreamTimeframe.TODAY,
      });
      await HotApplication.getOrFetch({
        reach: Core.UserStreamReach.FRIENDS,
        timeframe: Core.UserStreamTimeframe.TODAY,
      });
      await HotApplication.getOrFetch({ timeframe: Core.UserStreamTimeframe.TODAY });

      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle different timeframe values', async () => {
      const mockHotTags = [] as Core.NexusHotTag[];

      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue(null);
      vi.spyOn(Core.LocalHotService, 'upsert').mockResolvedValue(undefined);
      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      await HotApplication.getOrFetch({ timeframe: Core.UserStreamTimeframe.TODAY });
      await HotApplication.getOrFetch({ timeframe: Core.UserStreamTimeframe.THIS_WEEK });
      await HotApplication.getOrFetch({ timeframe: Core.UserStreamTimeframe.THIS_MONTH });
      await HotApplication.getOrFetch({ timeframe: Core.UserStreamTimeframe.ALL_TIME });

      expect(fetchSpy).toHaveBeenCalledTimes(4);
    });

    it('should strip limit from Nexus fetch on cache miss and apply it on return', async () => {
      const mockHotTags = [
        { label: 'tag1', tagged_count: 100, taggers_count: 1, taggers_id: ['u1'] },
        { label: 'tag2', tagged_count: 90, taggers_count: 1, taggers_id: ['u2'] },
        { label: 'tag3', tagged_count: 80, taggers_count: 1, taggers_id: ['u3'] },
        { label: 'tag4', tagged_count: 70, taggers_count: 1, taggers_id: ['u4'] },
        { label: 'tag5', tagged_count: 60, taggers_count: 1, taggers_id: ['u5'] },
      ] as Core.NexusHotTag[];

      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue(null);
      const upsertSpy = vi.spyOn(Core.LocalHotService, 'upsert').mockResolvedValue(undefined);
      const fetchSpy = vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(mockHotTags);

      const result = await HotApplication.getOrFetch({
        timeframe: Core.UserStreamTimeframe.TODAY,
        limit: 3,
      });

      // Nexus should be called without limit to get the full tag set
      expect(fetchSpy).toHaveBeenCalledWith({ timeframe: Core.UserStreamTimeframe.TODAY });

      // Cache should store the full set (all 5 tags)
      expect(upsertSpy).toHaveBeenCalledWith(expect.any(String), mockHotTags);

      // Return value should be sliced to the caller's limit
      expect(result).toHaveLength(3);
      expect(result).toEqual(mockHotTags.slice(0, 3));
    });

    it('should cache full tag set so different consumers with different limits get correct data', async () => {
      const allTags = [
        { label: 'tag1', tagged_count: 100, taggers_count: 1, taggers_id: ['u1'] },
        { label: 'tag2', tagged_count: 90, taggers_count: 1, taggers_id: ['u2'] },
        { label: 'tag3', tagged_count: 80, taggers_count: 1, taggers_id: ['u3'] },
        { label: 'tag4', tagged_count: 70, taggers_count: 1, taggers_id: ['u4'] },
        { label: 'tag5', tagged_count: 60, taggers_count: 1, taggers_id: ['u5'] },
        { label: 'tag6', tagged_count: 50, taggers_count: 1, taggers_id: ['u6'] },
        { label: 'tag7', tagged_count: 40, taggers_count: 1, taggers_id: ['u7'] },
        { label: 'tag8', tagged_count: 30, taggers_count: 1, taggers_id: ['u8'] },
        { label: 'tag9', tagged_count: 20, taggers_count: 1, taggers_id: ['u9'] },
        { label: 'tag10', tagged_count: 10, taggers_count: 1, taggers_id: ['u10'] },
      ] as Core.NexusHotTag[];

      // First call: consumer with small limit (e.g., sidebar with limit=5)
      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValueOnce(null);
      vi.spyOn(Core.LocalHotService, 'upsert').mockResolvedValue(undefined);
      vi.spyOn(Core.NexusHotService, 'fetch').mockResolvedValue(allTags);

      const smallLimitResult = await HotApplication.getOrFetch({
        timeframe: Core.UserStreamTimeframe.TODAY,
        limit: 5,
      });
      expect(smallLimitResult).toHaveLength(5);

      // Second call: consumer with large limit (e.g., HotTagsOverview with limit=50)
      // Cache now has the full set of 10 tags (not just 5)
      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValueOnce({
        id: 'today:all',
        tags: allTags,
      } as Core.HotTagsModel);

      const largeLimitResult = await HotApplication.getOrFetch({
        timeframe: Core.UserStreamTimeframe.TODAY,
        limit: 50,
      });

      // Should get all 10 tags from cache (not just 5 from the first consumer's limit)
      expect(largeLimitResult).toHaveLength(10);
      expect(largeLimitResult).toEqual(allTags);
    });

    it('should return all tags from cache when no limit is specified', async () => {
      const allTags = [
        { label: 'tag1', tagged_count: 100, taggers_count: 1, taggers_id: ['u1'] },
        { label: 'tag2', tagged_count: 90, taggers_count: 1, taggers_id: ['u2'] },
        { label: 'tag3', tagged_count: 80, taggers_count: 1, taggers_id: ['u3'] },
      ] as Core.NexusHotTag[];

      vi.spyOn(Core.LocalHotService, 'findById').mockResolvedValue({
        id: 'today:all',
        tags: allTags,
      } as Core.HotTagsModel);

      const result = await HotApplication.getOrFetch({
        timeframe: Core.UserStreamTimeframe.TODAY,
      });

      expect(result).toEqual(allTags);
    });
  });
});
