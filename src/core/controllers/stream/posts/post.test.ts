import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Core from '@/core';
import * as Config from '@/config';
import { StreamPostsController } from './posts';

describe('StreamPostsController', () => {
  const streamId = Core.PostStreamTypes.TIMELINE_ALL_ALL;
  const viewerId = 'user-viewer' as Core.Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock useAuthStore.getState() to return currentUserPubky directly
    // (implementation accesses state.currentUserPubky instead of selectCurrentUserPubky())
    vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue({
      ...Core.useAuthStore.getState(),
      currentUserPubky: viewerId,
    });
  });

  describe('getOrFetchStreamSlice', () => {
    it('should return posts when no cache misses', async () => {
      const nextPageIds = ['user-1:post-1', 'user-1:post-2'];
      const timestamp = 1000000;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp,
      });

      const fetchMissingPostsSpy = vi.spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus');

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
      });
      expect(fetchMissingPostsSpy).not.toHaveBeenCalled();
      expect(result).toEqual({
        nextPageIds,
        timestamp,
      });
    });

    it('should fetch missing posts when cacheMissPostIds exist', async () => {
      const nextPageIds = ['user-1:post-1', 'user-1:post-2'];
      const cacheMissPostIds = ['user-1:post-3', 'user-1:post-4'];
      const timestamp = 1000000;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds,
        timestamp,
      });

      const fetchMissingPostsSpy = vi
        .spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus')
        .mockResolvedValue();

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
      });
      expect(fetchMissingPostsSpy).toHaveBeenCalledWith({
        cacheMissPostIds,
        viewerId,
      });
      expect(result).toEqual({
        nextPageIds,
        timestamp,
      });
    });

    it('should pass lastPostId and streamTail to getOrFetchStreamSlice', async () => {
      const nextPageIds = ['user-1:post-5', 'user-1:post-6'];
      const lastPostId = 'user-1:post-4';
      const streamTail = 1000004;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp: 1000005,
      });

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        lastPostId,
        streamTail,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        lastPostId,
        streamTail,
        viewerId,
      });
      expect(result.nextPageIds).toEqual(nextPageIds);
      expect(result.timestamp).toBe(1000005);
    });

    it('should use default limit when not provided', async () => {
      const nextPageIds = ['user-1:post-1'];
      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp: undefined,
      });

      await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
      });
    });

    it('should not fetch missing posts when cacheMissPostIds is empty array', async () => {
      const nextPageIds = ['user-1:post-1', 'user-1:post-2'];
      const timestamp = 1000000;

      vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp,
      });

      const fetchMissingPostsSpy = vi.spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus');

      await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
      });

      expect(fetchMissingPostsSpy).not.toHaveBeenCalled();
    });

    it('should handle undefined timestamp in response', async () => {
      const nextPageIds = ['user-1:post-1'];

      vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp: undefined,
      });

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
      });

      expect(result.timestamp).toBeUndefined();
      expect(result.nextPageIds).toEqual(nextPageIds);
    });

    it('should handle unauthenticated users (null viewerId)', async () => {
      // Mock currentUserPubky as null (user not authenticated)
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue({
        ...Core.useAuthStore.getState(),
        currentUserPubky: null,
      });

      const nextPageIds = ['user-1:post-1', 'user-1:post-2'];
      const timestamp = 1000000;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp,
      });

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
      });

      // Should call with null viewerId (unauthenticated users can still view posts)
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId: null,
      });
      expect(result).toEqual({
        nextPageIds,
        timestamp,
      });
    });

    it('should propagate error when PostStreamApplication.getOrFetchStreamSlice throws', async () => {
      // Mock getOrFetchStreamSlice to throw error
      const applicationError = new Error('Network error');
      const getOrFetchStreamSliceSpy = vi
        .spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice')
        .mockRejectedValue(applicationError);

      // Set up spy to verify it's not called
      const fetchMissingPostsSpy = vi.spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus');

      // Should propagate the error
      await expect(
        StreamPostsController.getOrFetchStreamSlice({
          streamId,
          streamTail: 0,
        }),
      ).rejects.toThrow('Network error');

      // Verify getOrFetchStreamSlice was called (error happened during execution)
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
      });

      // Should not call fetchMissingPostsFromNexus when getOrFetchStreamSlice fails
      expect(fetchMissingPostsSpy).not.toHaveBeenCalled();
    });

    it('should fetch missing posts and propagate errors if fetch fails', async () => {
      const nextPageIds = ['user-1:post-1', 'user-1:post-2'];
      const cacheMissPostIds = ['user-1:post-3', 'user-1:post-4'];
      const timestamp = 1000000;

      // Mock getOrFetchStreamSlice to return cache misses
      vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds,
        timestamp,
      });

      // Mock fetchMissingPostsFromNexus to throw error
      const fetchError = new Error('Failed to fetch missing posts');
      const fetchMissingPostsSpy = vi
        .spyOn(Core.PostStreamApplication, 'fetchMissingPostsFromNexus')
        .mockRejectedValue(fetchError);

      // Should propagate the error since fetchMissingPostsFromNexus is awaited
      await expect(
        StreamPostsController.getOrFetchStreamSlice({
          streamId,
          streamTail: 0,
        }),
      ).rejects.toThrow('Failed to fetch missing posts');

      // Verify fetchMissingPostsFromNexus was called
      expect(fetchMissingPostsSpy).toHaveBeenCalledWith({
        cacheMissPostIds,
        viewerId,
      });
    });

    it('should handle when lastPostId is provided and streamTail is 0', async () => {
      const nextPageIds = ['user-1:post-5', 'user-1:post-6'];
      const lastPostId = 'user-1:post-4';
      const streamTail = 0;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp: 1000005,
      });

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        lastPostId,
        streamTail,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        lastPostId,
        streamTail,
        viewerId,
      });
      expect(result.nextPageIds).toEqual(nextPageIds);
    });

    it('WIP: should handle tags parameter when provided', async () => {
      const nextPageIds = ['user-1:post-1'];
      const tags = ['tag1', 'tag2'];

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp: undefined,
      });

      await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
        tags,
      });

      // Note: tags parameter is not currently used in the implementation
      // This test verifies the method accepts it without error
      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
      });
    });

    it('should handle engagement:all:images streamId', async () => {
      const engagementStreamId = 'engagement:all:images' as Core.PostStreamTypes;
      const nextPageIds = ['user-1:post-1', 'user-1:post-2'];
      const timestamp = 1000000;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp,
      });

      const result = await StreamPostsController.getOrFetchStreamSlice({
        streamId: engagementStreamId,
        streamTail: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId: engagementStreamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
      });
      expect(result).toEqual({
        nextPageIds,
        timestamp,
      });
    });
  });

  describe('getCachedLastPostTimestamp', () => {
    it('should delegate to PostStreamApplication.getCachedLastPostTimestamp with correct params', async () => {
      const expectedTimestamp = 1000000;
      const getCachedLastPostTimestampSpy = vi
        .spyOn(Core.PostStreamApplication, 'getCachedLastPostTimestamp')
        .mockResolvedValue(expectedTimestamp);

      const result = await StreamPostsController.getCachedLastPostTimestamp({ streamId });

      expect(getCachedLastPostTimestampSpy).toHaveBeenCalledWith({ streamId });
      expect(result).toBe(expectedTimestamp);
    });

    it('should propagate errors from application layer', async () => {
      const applicationError = new Error('Database error');
      vi.spyOn(Core.PostStreamApplication, 'getCachedLastPostTimestamp').mockRejectedValue(applicationError);

      await expect(StreamPostsController.getCachedLastPostTimestamp({ streamId })).rejects.toThrow('Database error');
    });
  });

  describe('getStreamHead', () => {
    it('should delegate to PostStreamApplication.getStreamHead with correct params', async () => {
      const expectedStreamHead = 1000000;
      const getStreamHeadSpy = vi
        .spyOn(Core.PostStreamApplication, 'getStreamHead')
        .mockResolvedValue(expectedStreamHead);

      const result = await StreamPostsController.getStreamHead({ streamId });

      expect(getStreamHeadSpy).toHaveBeenCalledWith({ streamId });
      expect(result).toBe(expectedStreamHead);
    });

    it('should propagate errors from application layer', async () => {
      const applicationError = new Error('Database error');
      vi.spyOn(Core.PostStreamApplication, 'getStreamHead').mockRejectedValue(applicationError);

      await expect(StreamPostsController.getStreamHead({ streamId })).rejects.toThrow('Database error');
    });
  });

  describe('mergeUnreadStreamWithPostStream', () => {
    it('should delegate to PostStreamApplication.mergeUnreadStreamWithPostStream with correct params', async () => {
      const mergeUnreadStreamWithPostStreamSpy = vi
        .spyOn(Core.PostStreamApplication, 'mergeUnreadStreamWithPostStream')
        .mockResolvedValue();

      await StreamPostsController.mergeUnreadStreamWithPostStream({ streamId });

      expect(mergeUnreadStreamWithPostStreamSpy).toHaveBeenCalledWith({ streamId });
    });

    it('should propagate errors from application layer', async () => {
      const applicationError = new Error('Database error');
      vi.spyOn(Core.PostStreamApplication, 'mergeUnreadStreamWithPostStream').mockRejectedValue(applicationError);

      await expect(StreamPostsController.mergeUnreadStreamWithPostStream({ streamId })).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('getLocalStream', () => {
    it('should delegate to PostStreamApplication.getLocalStream with correct params', async () => {
      const mockStream = { stream: ['post-1', 'post-2'] };
      const getLocalStreamSpy = vi.spyOn(Core.PostStreamApplication, 'getLocalStream').mockResolvedValue(mockStream);

      const result = await StreamPostsController.getLocalStream({ streamId });

      expect(getLocalStreamSpy).toHaveBeenCalledWith({ streamId });
      expect(result).toEqual(mockStream);
    });

    it('should return null when stream does not exist', async () => {
      vi.spyOn(Core.PostStreamApplication, 'getLocalStream').mockResolvedValue(null);

      const result = await StreamPostsController.getLocalStream({ streamId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const applicationError = new Error('Database error');
      vi.spyOn(Core.PostStreamApplication, 'getLocalStream').mockRejectedValue(applicationError);

      await expect(StreamPostsController.getLocalStream({ streamId })).rejects.toThrow('Database error');
    });
  });

  describe('clearUnreadStream', () => {
    it('should delegate to PostStreamApplication.clearUnreadStream with correct params', async () => {
      const mockPostIds = ['post-1', 'post-2', 'post-3'];
      const clearUnreadStreamSpy = vi
        .spyOn(Core.PostStreamApplication, 'clearUnreadStream')
        .mockResolvedValue(mockPostIds);

      const result = await StreamPostsController.clearUnreadStream({ streamId });

      expect(clearUnreadStreamSpy).toHaveBeenCalledWith({ streamId });
      expect(result).toEqual(mockPostIds);
    });

    it('should return empty array when unread stream does not exist', async () => {
      vi.spyOn(Core.PostStreamApplication, 'clearUnreadStream').mockResolvedValue([]);

      const result = await StreamPostsController.clearUnreadStream({ streamId });

      expect(result).toEqual([]);
    });

    it('should propagate errors from application layer', async () => {
      const applicationError = new Error('Database error');
      vi.spyOn(Core.PostStreamApplication, 'clearUnreadStream').mockRejectedValue(applicationError);

      await expect(StreamPostsController.clearUnreadStream({ streamId })).rejects.toThrow('Database error');
    });
  });

  describe('getUnreadStream', () => {
    it('should delegate to PostStreamApplication.getUnreadStream with correct params', async () => {
      const mockUnreadStream = { stream: ['post-1', 'post-2'] };
      const getUnreadStreamSpy = vi
        .spyOn(Core.PostStreamApplication, 'getUnreadStream')
        .mockResolvedValue(mockUnreadStream);

      const result = await StreamPostsController.getUnreadStream({ streamId });

      expect(getUnreadStreamSpy).toHaveBeenCalledWith({ streamId });
      expect(result).toEqual(mockUnreadStream);
    });

    it('should return null when unread stream does not exist', async () => {
      vi.spyOn(Core.PostStreamApplication, 'getUnreadStream').mockResolvedValue(null);

      const result = await StreamPostsController.getUnreadStream({ streamId });

      expect(result).toBeNull();
    });

    it('should propagate errors from application layer', async () => {
      const applicationError = new Error('Database error');
      vi.spyOn(Core.PostStreamApplication, 'getUnreadStream').mockRejectedValue(applicationError);

      await expect(StreamPostsController.getUnreadStream({ streamId })).rejects.toThrow('Database error');
    });
  });

  describe('getOrFetchStreamSlice with order parameter', () => {
    it('should pass order parameter to application layer', async () => {
      const nextPageIds = ['user-1:post-1', 'user-1:post-2'];
      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp: undefined,
      });

      await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
        order: Core.StreamOrder.ASCENDING,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
        order: Core.StreamOrder.ASCENDING,
      });
    });

    it('should handle DESCENDING order', async () => {
      const nextPageIds = ['user-1:post-1'];
      const getOrFetchStreamSliceSpy = vi.spyOn(Core.PostStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissPostIds: [],
        timestamp: undefined,
      });

      await StreamPostsController.getOrFetchStreamSlice({
        streamId,
        streamTail: 0,
        order: Core.StreamOrder.DESCENDING,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        limit: Config.NEXUS_POSTS_PER_PAGE,
        streamHead: 0,
        streamTail: 0,
        lastPostId: undefined,
        viewerId,
        order: Core.StreamOrder.DESCENDING,
      });
    });
  });
});
