import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchApplication } from './search';
import { NexusSearchService } from '@/services/nexus/search/search';
describe('SearchApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchUsersById', () => {
    it('should call NexusSearchService.usersById with correct params', async () => {
      const params = { prefix: 'pxnu33', skip: 0, limit: 5 };
      const mockUserIds = ['user1', 'user2'];
      const usersByIdSpy = vi.spyOn(NexusSearchService, 'usersById').mockResolvedValue(mockUserIds);

      const result = await SearchApplication.fetchUsersById(params);

      expect(usersByIdSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when no users found', async () => {
      vi.spyOn(NexusSearchService, 'usersById').mockResolvedValue([]);

      const result = await SearchApplication.fetchUsersById({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from service', async () => {
      vi.spyOn(NexusSearchService, 'usersById').mockRejectedValue(new Error('API error'));

      await expect(SearchApplication.fetchUsersById({ prefix: 'test', skip: 0, limit: 5 })).rejects.toThrow(
        'API error',
      );
    });
  });

  describe('fetchUsersByName', () => {
    it('should call NexusSearchService.usersByName with correct params', async () => {
      const params = { prefix: 'Test', skip: 0, limit: 5 };
      const mockUserIds = ['user1', 'user2'];
      const usersByNameSpy = vi.spyOn(NexusSearchService, 'usersByName').mockResolvedValue(mockUserIds);

      const result = await SearchApplication.fetchUsersByName(params);

      expect(usersByNameSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when no users found', async () => {
      vi.spyOn(NexusSearchService, 'usersByName').mockResolvedValue([]);

      const result = await SearchApplication.fetchUsersByName({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from service', async () => {
      vi.spyOn(NexusSearchService, 'usersByName').mockRejectedValue(new Error('API error'));

      await expect(SearchApplication.fetchUsersByName({ prefix: 'test', skip: 0, limit: 5 })).rejects.toThrow(
        'API error',
      );
    });
  });

  describe('fetchTagsByPrefix', () => {
    it('should call NexusSearchService.tags with correct params', async () => {
      const params = { prefix: 'bit', skip: 0, limit: 5 };
      const mockTags = ['bitcoin', 'bitkit', 'bits'];
      const tagsSpy = vi.spyOn(NexusSearchService, 'tags').mockResolvedValue(mockTags);

      const result = await SearchApplication.fetchTagsByPrefix(params);

      expect(tagsSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockTags);
    });

    it('should return empty array when no tags found', async () => {
      vi.spyOn(NexusSearchService, 'tags').mockResolvedValue([]);

      const result = await SearchApplication.fetchTagsByPrefix({ prefix: 'xyz', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from service', async () => {
      vi.spyOn(NexusSearchService, 'tags').mockRejectedValue(new Error('API error'));

      await expect(SearchApplication.fetchTagsByPrefix({ prefix: 'test', skip: 0, limit: 5 })).rejects.toThrow(
        'API error',
      );
    });
  });
});
