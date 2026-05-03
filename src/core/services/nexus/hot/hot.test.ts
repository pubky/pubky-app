import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type NexusHotTag, UserStreamReach, UserStreamTimeframe } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { tagApi } from '@/services/nexus/tag/tag.api';
import type { TTagHotParams } from '@/services/nexus/tag/tag.types';
import { NexusHotService } from './hot';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    queryNexus: vi.fn(),
  };
});

const mockQueryNexus = vi.mocked(queryNexus);

describe('NexusHotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetch', () => {
    it('should fetch hot tags successfully', async () => {
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

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
    });

    it('should fetch with pagination params', async () => {
      const mockHotTags = [
        {
          label: 'music',
          tagged_count: 75,
          taggers_count: 1,
          taggers_id: ['user4'],
        },
      ] as NexusHotTag[];

      const params: TTagHotParams = {
        reach: UserStreamReach.FRIENDS,
        timeframe: UserStreamTimeframe.THIS_MONTH,
        skip: 10,
        limit: 20,
      };

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
    });

    it('should return empty array when response is empty array', async () => {
      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
      };

      mockQueryNexus.mockResolvedValue([]);

      const result = await NexusHotService.fetch(params);

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

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);
      const tagApiHotSpy = vi.spyOn(tagApi, 'hot');

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(tagApiHotSpy).toHaveBeenCalledWith(params);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
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

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);
      const tagApiHotSpy = vi.spyOn(tagApi, 'hot');

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(tagApiHotSpy).toHaveBeenCalledWith(params);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
    });

    it('should handle limit: 0', async () => {
      const mockHotTags = [] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        limit: 0,
      };

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);
      const tagApiHotSpy = vi.spyOn(tagApi, 'hot');

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(tagApiHotSpy).toHaveBeenCalledWith(params);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
    });

    it('should handle skip: 0', async () => {
      const mockHotTags = [] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        skip: 0,
      };

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);
      const tagApiHotSpy = vi.spyOn(tagApi, 'hot');

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(tagApiHotSpy).toHaveBeenCalledWith(params);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
    });

    it('should handle large limit values', async () => {
      const mockHotTags = [] as NexusHotTag[];

      const params: TTagHotParams = {
        timeframe: UserStreamTimeframe.TODAY,
        limit: 10_000,
      };

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);
      const tagApiHotSpy = vi.spyOn(tagApi, 'hot');

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(tagApiHotSpy).toHaveBeenCalledWith(params);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
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

      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);
      const tagApiHotSpy = vi.spyOn(tagApi, 'hot');

      const result = await NexusHotService.fetch(params);

      expect(result).toEqual(mockHotTags);
      expect(tagApiHotSpy).toHaveBeenCalledWith(params);
      expect(queryNexusSpy).toHaveBeenCalledOnce();
    });

    it('should bubble when queryNexus fails', async () => {
      const params: TTagHotParams = {
        reach: UserStreamReach.FOLLOWING,
        timeframe: UserStreamTimeframe.TODAY,
      };

      mockQueryNexus.mockRejectedValue(new Error('nexus-fail'));

      await expect(NexusHotService.fetch(params)).rejects.toThrow('nexus-fail');
    });

    it('should handle different reach values', async () => {
      const mockHotTags = [] as NexusHotTag[];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);

      await NexusHotService.fetch({ reach: UserStreamReach.FOLLOWING, timeframe: UserStreamTimeframe.TODAY });
      await NexusHotService.fetch({ reach: UserStreamReach.FRIENDS, timeframe: UserStreamTimeframe.TODAY });
      await NexusHotService.fetch({ timeframe: UserStreamTimeframe.TODAY });

      expect(queryNexusSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle different timeframe values', async () => {
      const mockHotTags = [] as NexusHotTag[];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockHotTags);

      await NexusHotService.fetch({ timeframe: UserStreamTimeframe.TODAY });
      await NexusHotService.fetch({ timeframe: UserStreamTimeframe.THIS_WEEK });
      await NexusHotService.fetch({ timeframe: UserStreamTimeframe.THIS_MONTH });
      await NexusHotService.fetch({ timeframe: UserStreamTimeframe.ALL_TIME });

      expect(queryNexusSpy).toHaveBeenCalledTimes(4);
    });
  });
});
