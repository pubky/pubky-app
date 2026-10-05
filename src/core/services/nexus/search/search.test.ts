import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { ErrorCategory } from '@/libs/error/error.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { NexusSearchService } from './search';

vi.mock('@/services/nexus/nexus.utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/nexus/nexus.utils')>();
  return {
    ...actual,
    queryNexus: vi.fn(),
  };
});

const mockQueryNexus = vi.mocked(queryNexus);

describe('NexusSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usersById', () => {
    it('should call queryNexus with correct URL and return user IDs', async () => {
      const mockUserIds = ['user1', 'user2'];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockUserIds);

      const result = await NexusSearchService.usersById({ prefix: 'pxnu33', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/v0/search/users/by_id/pxnu33'),
      });
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when queryNexus returns empty array', async () => {
      mockQueryNexus.mockResolvedValue([]);

      const result = await NexusSearchService.usersById({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should include pagination params in URL', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      await NexusSearchService.usersById({ prefix: 'test', skip: 10, limit: 20 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('skip=10'),
      });
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('limit=20'),
      });
    });
  });

  describe('usersByName', () => {
    it('should call queryNexus with correct URL and return user IDs', async () => {
      const mockUserIds = ['user1', 'user2'];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockUserIds);

      const result = await NexusSearchService.usersByName({ prefix: 'Test', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/v0/search/users/by_name/Test'),
      });
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when queryNexus returns empty array', async () => {
      mockQueryNexus.mockResolvedValue([]);

      const result = await NexusSearchService.usersByName({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });
  });

  describe('tags', () => {
    it('should call queryNexus with correct URL and return tags', async () => {
      const mockTags = ['bitcoin', 'bitkit', 'bits'];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockTags);

      const result = await NexusSearchService.tags({ prefix: 'bit', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/v0/search/tags/by_prefix/bit'),
      });
      expect(result).toEqual(mockTags);
    });

    it('should return empty array when queryNexus returns empty array', async () => {
      mockQueryNexus.mockResolvedValue([]);

      const result = await NexusSearchService.tags({ prefix: 'xyz', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should handle special characters in prefix', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      await NexusSearchService.tags({ prefix: 'tag#123', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('tag%23123'),
      });
    });
  });

  describe('usersByTags', () => {
    it.each(['following', 'friends', 'wot'] as const)(
      'includes the paired viewer and %s reach on every People page',
      async (reach) => {
        mockQueryNexus.mockResolvedValue([]);
        await NexusSearchService.usersByTags({ tags: 'bitcoin,pubky', skip: 20, limit: 20, reach, viewerId: 'viewer' });
        expect(Object.fromEntries(new URL(mockQueryNexus.mock.calls[0][0].url).searchParams)).toEqual({
          tags: 'bitcoin,pubky',
          skip: '20',
          limit: '20',
          reach,
          user_id: 'viewer',
        });
      },
    );
    it('rejects a scoped People search without a viewer instead of searching All', async () => {
      await expect(NexusSearchService.usersByTags({ tags: 'pubky', reach: 'wot' })).rejects.toMatchObject({
        category: ErrorCategory.Auth,
        code: AuthErrorCode.UNAUTHORIZED,
      });
      expect(mockQueryNexus).not.toHaveBeenCalled();
    });

    it('sends no viewer for an All People search', async () => {
      mockQueryNexus.mockResolvedValue([]);
      await NexusSearchService.usersByTags({ tags: 'pubky', skip: 0, limit: 20, viewerId: 'viewer' });
      expect(Object.fromEntries(new URL(mockQueryNexus.mock.calls[0][0].url).searchParams)).toEqual({
        tags: 'pubky',
        skip: '0',
        limit: '20',
      });
    });

    it('should call queryNexus with correct URL and return scored user ids', async () => {
      const mockResults = [
        { user_id: 'user1', score: 12 },
        { user_id: 'user2', score: 3 },
      ];
      const queryNexusSpy = mockQueryNexus.mockResolvedValue(mockResults);

      const result = await NexusSearchService.usersByTags({ tags: 'synonym,rust', skip: 0, limit: 20 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/v0/search/users/by_tags'),
      });
      expect(result).toEqual(mockResults);
    });

    it('should pass tags and pagination as query params', async () => {
      const queryNexusSpy = mockQueryNexus.mockResolvedValue([]);

      await NexusSearchService.usersByTags({ tags: 'synonym,rust', skip: 10, limit: 20 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('tags=synonym%2Crust'),
      });
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('skip=10'),
      });
      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('limit=20'),
      });
    });

    it('should return empty array when queryNexus returns empty array', async () => {
      mockQueryNexus.mockResolvedValue([]);

      const result = await NexusSearchService.usersByTags({ tags: 'nonexistent', skip: 0, limit: 20 });

      expect(result).toEqual([]);
    });
  });
});
