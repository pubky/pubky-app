import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Config from '@/config';
import { StreamUserController } from './users';
import { UserStreamApplication } from '@/application/stream/users/users';
import type { Pubky } from '@/models/models.types';
import { buildUserCompositeId } from '@/models/stream/user/userStream.helper';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { useAuthStore } from '@/stores/auth/auth.store';
describe('StreamUserController', () => {
  const targetUserId = 'user-target' as Pubky;
  const viewerId = 'user-viewer' as Pubky;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock useAuthStore.getState() to return currentUserPubky directly
    // (implementation accesses state.currentUserPubky instead of selectCurrentUserPubky())
    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      ...useAuthStore.getState(),
      currentUserPubky: viewerId,
    });
  });

  describe('getOrFetchStreamSlice', () => {
    it('should return users when no cache misses', async () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const nextPageIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      const getOrFetchStreamSliceSpy = vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissUserIds: [],
        skip: undefined,
      });

      const fetchMissingUsersSpy = vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus');

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
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const nextPageIds: Pubky[] = ['follower-1', 'follower-2'];
      const cacheMissUserIds: Pubky[] = ['follower-3', 'follower-4'];

      const getOrFetchStreamSliceSpy = vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissUserIds,
        skip: 20,
      });

      const fetchMissingUsersSpy = vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue();

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
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const skip = 20;

      const getOrFetchStreamSliceSpy = vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
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
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const customViewerId = 'custom-viewer' as Pubky;

      // Update mock to return custom viewer
      vi.spyOn(useAuthStore, 'getState').mockReturnValue({
        ...useAuthStore.getState(),
        currentUserPubky: customViewerId,
      });

      const getOrFetchStreamSliceSpy = vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
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
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });

      const getOrFetchStreamSliceSpy = vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
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
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });

      vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds: ['follower-1'],
        cacheMissUserIds: [],
        skip: 20,
      });

      const fetchMissingUsersSpy = vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus');

      await StreamUserController.getOrFetchStreamSlice({
        streamId,
        limit: Config.NEXUS_USERS_PER_PAGE,
        skip: 0,
      });

      expect(fetchMissingUsersSpy).not.toHaveBeenCalled();
    });

    it('should handle undefined skip in response', async () => {
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });

      vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
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
      const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;

      const getOrFetchStreamSliceSpy = vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
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
      const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const nextPageIds: Pubky[] = ['follower-1', 'follower-2'];
      const cacheMissUserIds: Pubky[] = ['follower-3'];

      vi.spyOn(UserStreamApplication, 'getOrFetchStreamSlice').mockResolvedValue({
        nextPageIds,
        cacheMissUserIds,
        skip: 20,
      });

      const fetchMissingUsersSpy = vi.spyOn(UserStreamApplication, 'fetchMissingUsersFromNexus').mockResolvedValue();

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
      const userIds: Pubky[] = ['user-1', 'user-2', 'user-3'];

      const getOrFetchUsersSpy = vi.spyOn(UserStreamApplication, 'getOrFetchUsers').mockResolvedValue();

      await StreamUserController.getOrFetchUsers({ userIds });

      expect(getOrFetchUsersSpy).toHaveBeenCalledWith({
        userIds,
        viewerId,
      });
    });

    it('should pass undefined as viewerId when currentUserPubky is null', async () => {
      vi.spyOn(useAuthStore, 'getState').mockReturnValue({
        ...useAuthStore.getState(),
        currentUserPubky: null,
      });

      const userIds: Pubky[] = ['user-1'];

      const getOrFetchUsersSpy = vi.spyOn(UserStreamApplication, 'getOrFetchUsers').mockResolvedValue();

      await StreamUserController.getOrFetchUsers({ userIds });

      expect(getOrFetchUsersSpy).toHaveBeenCalledWith({
        userIds,
        viewerId: undefined,
      });
    });

    it('should propagate errors from UserStreamApplication.getOrFetchUsers', async () => {
      const userIds: Pubky[] = ['user-1'];

      vi.spyOn(UserStreamApplication, 'getOrFetchUsers').mockRejectedValue(new Error('fetch-users-fail'));

      await expect(StreamUserController.getOrFetchUsers({ userIds })).rejects.toThrow('fetch-users-fail');
    });
  });
});
