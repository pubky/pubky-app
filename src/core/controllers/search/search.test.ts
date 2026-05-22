import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchApplication } from '@/application/search/search';
import { SearchController } from './search';

describe('SearchController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchUsersById', () => {
    it('should call SearchApplication.fetchUsersById and return user IDs', async () => {
      const params = { prefix: 'pxnu33', skip: 0, limit: 5 };
      const mockUserIds = ['user1', 'user2'];
      const usersByIdSpy = vi.spyOn(SearchApplication, 'fetchUsersById').mockResolvedValue(mockUserIds);

      const result = await SearchController.fetchUsersById(params);

      expect(usersByIdSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when no users found', async () => {
      vi.spyOn(SearchApplication, 'fetchUsersById').mockResolvedValue([]);

      const result = await SearchController.fetchUsersById({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from application layer', async () => {
      vi.spyOn(SearchApplication, 'fetchUsersById').mockRejectedValue(new Error('API error'));

      await expect(SearchController.fetchUsersById({ prefix: 'test', skip: 0, limit: 5 })).rejects.toThrow('API error');
    });
  });

  describe('getUsersByName', () => {
    it('should call SearchApplication.fetchUsersByName and return user IDs', async () => {
      const params = { prefix: 'Test', skip: 0, limit: 5 };
      const mockUserIds = ['user1', 'user2'];
      const usersByNameSpy = vi.spyOn(SearchApplication, 'fetchUsersByName').mockResolvedValue(mockUserIds);

      const result = await SearchController.getUsersByName(params);

      expect(usersByNameSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when no users found', async () => {
      vi.spyOn(SearchApplication, 'fetchUsersByName').mockResolvedValue([]);

      const result = await SearchController.getUsersByName({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from application layer', async () => {
      vi.spyOn(SearchApplication, 'fetchUsersByName').mockRejectedValue(new Error('API error'));

      await expect(SearchController.getUsersByName({ prefix: 'test', skip: 0, limit: 5 })).rejects.toThrow('API error');
    });
  });

  describe('getTagsByPrefix', () => {
    it('should call SearchApplication.fetchTagsByPrefix with correct params', async () => {
      const params = { prefix: 'bit', skip: 0, limit: 5 };
      const mockTags = ['bitcoin', 'bitkit', 'bits'];
      const tagsSpy = vi.spyOn(SearchApplication, 'fetchTagsByPrefix').mockResolvedValue(mockTags);

      const result = await SearchController.getTagsByPrefix(params);

      expect(tagsSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockTags);
    });

    it('should return empty array when no tags found', async () => {
      vi.spyOn(SearchApplication, 'fetchTagsByPrefix').mockResolvedValue([]);

      const result = await SearchController.getTagsByPrefix({ prefix: 'xyz', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from application layer', async () => {
      vi.spyOn(SearchApplication, 'fetchTagsByPrefix').mockRejectedValue(new Error('API error'));

      await expect(SearchController.getTagsByPrefix({ prefix: 'test', skip: 0, limit: 5 })).rejects.toThrow(
        'API error',
      );
    });
  });
});
