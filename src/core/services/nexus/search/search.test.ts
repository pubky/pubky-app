import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NexusSearchService } from './search';
import * as queryNexusModule from '@/services/nexus/nexus.utils';
describe('NexusSearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('usersById', () => {
    it('should call queryNexus with correct URL and return user IDs', async () => {
      const mockUserIds = ['user1', 'user2'];
      const queryNexusSpy = vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue(mockUserIds);

      const result = await NexusSearchService.usersById({ prefix: 'pxnu33', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/v0/search/users/by_id/pxnu33'),
      });
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when queryNexus returns empty array', async () => {
      vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue([]);

      const result = await NexusSearchService.usersById({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should include pagination params in URL', async () => {
      const queryNexusSpy = vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue([]);

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
      const queryNexusSpy = vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue(mockUserIds);

      const result = await NexusSearchService.usersByName({ prefix: 'Test', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/v0/search/users/by_name/Test'),
      });
      expect(result).toEqual(mockUserIds);
    });

    it('should return empty array when queryNexus returns empty array', async () => {
      vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue([]);

      const result = await NexusSearchService.usersByName({ prefix: 'nonexistent', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });
  });

  describe('tags', () => {
    it('should call queryNexus with correct URL and return tags', async () => {
      const mockTags = ['bitcoin', 'bitkit', 'bits'];
      const queryNexusSpy = vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue(mockTags);

      const result = await NexusSearchService.tags({ prefix: 'bit', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('/v0/search/tags/by_prefix/bit'),
      });
      expect(result).toEqual(mockTags);
    });

    it('should return empty array when queryNexus returns empty array', async () => {
      vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue([]);

      const result = await NexusSearchService.tags({ prefix: 'xyz', skip: 0, limit: 5 });

      expect(result).toEqual([]);
    });

    it('should handle special characters in prefix', async () => {
      const queryNexusSpy = vi.spyOn(queryNexusModule, 'queryNexus').mockResolvedValue([]);

      await NexusSearchService.tags({ prefix: 'tag#123', skip: 0, limit: 5 });

      expect(queryNexusSpy).toHaveBeenCalledWith({
        url: expect.stringContaining('tag%23123'),
      });
    });
  });
});
