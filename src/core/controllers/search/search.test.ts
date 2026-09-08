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

  describe('fetchTagsByPrefix', () => {
    it('should call SearchApplication.fetchTagsByPrefix with correct params', async () => {
      const params = { prefix: 'bit', skip: 0, limit: 5 };
      const mockTags = ['bitcoin', 'bitkit', 'bits'];
      const tagsSpy = vi.spyOn(SearchApplication, 'fetchTagsByPrefix').mockResolvedValue(mockTags);

      const result = await SearchController.fetchTagsByPrefix(params);

      expect(tagsSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockTags);
    });

    it('should return empty array when no tags found', async () => {
      vi.spyOn(SearchApplication, 'fetchTagsByPrefix').mockResolvedValue([]);

      const result = await SearchController.fetchTagsByPrefix({ prefix: 'xyz', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from application layer', async () => {
      vi.spyOn(SearchApplication, 'fetchTagsByPrefix').mockRejectedValue(new Error('API error'));

      await expect(SearchController.fetchTagsByPrefix({ prefix: 'test', skip: 0, limit: 5 })).rejects.toThrow(
        'API error',
      );
    });
  });
  describe('fetchUsersByTags', () => {
    it('should call SearchApplication.fetchUsersByTags with correct params', async () => {
      const params = { tags: 'synonym,rust', skip: 0, limit: 20 };
      const mockResults = [
        { user_id: 'user1', score: 12 },
        { user_id: 'user2', score: 3 },
      ];
      const usersByTagsSpy = vi.spyOn(SearchApplication, 'fetchUsersByTags').mockResolvedValue(mockResults);

      const result = await SearchController.fetchUsersByTags(params);

      expect(usersByTagsSpy).toHaveBeenCalledWith(params);
      expect(result).toEqual(mockResults);
    });

    it('should return empty array when no users found', async () => {
      vi.spyOn(SearchApplication, 'fetchUsersByTags').mockResolvedValue([]);

      const result = await SearchController.fetchUsersByTags({ tags: 'xyz', skip: 0, limit: 20 });

      expect(result).toEqual([]);
    });

    it('should propagate errors from application layer', async () => {
      vi.spyOn(SearchApplication, 'fetchUsersByTags').mockRejectedValue(new Error('API error'));

      await expect(SearchController.fetchUsersByTags({ tags: 'test', skip: 0, limit: 20 })).rejects.toThrow(
        'API error',
      );
    });
  });
});
