import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Core from '@/core';
import * as Config from '@/config';
import { StreamUserController } from './users';

describe('StreamUserController', () => {
  const targetUserId = 'user-target' as Core.Pubky;
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
    it('should return users when no cache misses', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const nextPageIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissUserIds: [],
        skip: undefined,
      });

      const fetchMissingUsersSpy = vi.spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus');

      const result = await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        skip: 0,
        limit: Config.NEXUS_USERS_PER_PAGE,
        viewerId,
      });
      expect(fetchMissingUsersSpy).not.toHaveBeenCalled();
      expect(result).toEqual({
        nextPageIds,
        skip: undefined,
      });
    });

    it('should fetch missing users when cacheMissUserIds exist', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const nextPageIds: Core.Pubky[] = ['follower-1', 'follower-2'];
      const cacheMissUserIds: Core.Pubky[] = ['follower-3', 'follower-4'];

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissUserIds,
        skip: 20,
      });

      const fetchMissingUsersSpy = vi
        .spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus')
        .mockResolvedValue();

      const result = await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        skip: 0,
        limit: Config.NEXUS_USERS_PER_PAGE,
        viewerId,
      });
      expect(fetchMissingUsersSpy).toHaveBeenCalledWith({
        cacheMissUserIds,
        viewerId,
      });
      expect(result).toEqual({
        nextPageIds,
        skip: 20,
      });
    });

    it('should pass streamId and skip correctly to application layer', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const skip = 20;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: [],
        cacheMissUserIds: [],
        skip: undefined,
      });

      await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        skip,
        limit: Config.NEXUS_USERS_PER_PAGE,
        viewerId,
      });
    });

    it('should extract viewerId from auth store correctly', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const customViewerId = 'custom-viewer' as Core.Pubky;

      // Update mock to return custom viewer
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue({
        ...Core.useAuthStore.getState(),
        currentUserPubky: customViewerId,
      });

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: [],
        cacheMissUserIds: [],
        skip: undefined,
      });

      await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        skip: 0,
        limit: Config.NEXUS_USERS_PER_PAGE,
        viewerId: customViewerId,
      });
    });

    it('should use Config.NEXUS_USERS_PER_PAGE as limit', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: [],
        cacheMissUserIds: [],
        skip: undefined,
      });

      await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        skip: 0,
        limit: Config.NEXUS_USERS_PER_PAGE,
        viewerId,
      });
    });

    it('should not fetch missing users when cacheMissUserIds is empty array', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });

      vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: ['follower-1'],
        cacheMissUserIds: [],
        skip: 20,
      });

      const fetchMissingUsersSpy = vi.spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus');

      await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(fetchMissingUsersSpy).not.toHaveBeenCalled();
    });

    it('should handle undefined skip in response', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });

      vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: ['follower-1', 'follower-2'],
        cacheMissUserIds: [],
        skip: undefined,
      });

      const result = await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(result.skip).toBeUndefined();
    });

    it('should handle enum-based stream IDs (influencers)', async () => {
      const streamId = Core.UserStreamTypes.TODAY_INFLUENCERS_ALL;

      const getOrFetchStreamSliceSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: ['influencer-1', 'influencer-2'],
        cacheMissUserIds: [],
        skip: undefined,
      });

      await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(getOrFetchStreamSliceSpy).toHaveBeenCalledWith({
        streamId,
        skip: 0,
        limit: Config.NEXUS_USERS_PER_PAGE,
        viewerId,
      });
    });

    it('should await background fetch for missing users', async () => {
      const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const nextPageIds: Core.Pubky[] = ['follower-1', 'follower-2'];
      const cacheMissUserIds: Core.Pubky[] = ['follower-3'];

      vi.spyOn(Core.UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissUserIds,
        skip: 20,
      });

      const fetchMissingUsersSpy = vi
        .spyOn(Core.UserStreamApplication, 'fetchMissingUsersFromNexus')
        .mockResolvedValue();

      const result = await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(result).toEqual({
        nextPageIds,
        skip: 20,
      });

      // fetchMissingUsersFromNexus should be called and awaited
      expect(fetchMissingUsersSpy).toHaveBeenCalledWith({
        cacheMissUserIds,
        viewerId,
      });
    });
  });

  describe('getOrFetchUsers', () => {
    it('should delegate to UserStreamApplication.getOrFetchUsers with correct args', async () => {
      const userIds: Core.Pubky[] = ['user-1', 'user-2', 'user-3'];

      const getOrFetchUsersSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchUsers').mockResolvedValue();

      await StreamUserController.getOrFetchUsers({ userIds });

      expect(getOrFetchUsersSpy).toHaveBeenCalledWith({
        userIds,
        viewerId,
      });
    });

    it('should pass undefined as viewerId when currentUserPubky is null', async () => {
      vi.spyOn(Core.useAuthStore, 'getState').mockReturnValue({
        ...Core.useAuthStore.getState(),
        currentUserPubky: null,
      });

      const userIds: Core.Pubky[] = ['user-1'];

      const getOrFetchUsersSpy = vi.spyOn(Core.UserStreamApplication, 'getOrFetchUsers').mockResolvedValue();

      await StreamUserController.getOrFetchUsers({ userIds });

      expect(getOrFetchUsersSpy).toHaveBeenCalledWith({
        userIds,
        viewerId: undefined,
      });
    });

    it('should propagate errors from UserStreamApplication.getOrFetchUsers', async () => {
      const userIds: Core.Pubky[] = ['user-1'];

      vi.spyOn(Core.UserStreamApplication, 'getOrFetchUsers').mockRejectedValue(new Error('fetch-users-fail'));

      await expect(StreamUserController.getOrFetchUsers({ userIds })).rejects.toThrow('fetch-users-fail');
    });
  });
});
