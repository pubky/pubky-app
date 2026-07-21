import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserStreamApplication } from '@/application/stream/users/users';
import type { Pubky } from '@/models/models.types';
import { buildUserCompositeId } from '@/models/stream/user/userStream.helper';
import { UserStreamTypes } from '@/models/stream/user/userStream.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { NexusUser } from '@/services/nexus/nexus.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';

describe('UserStreamApplication', () => {
  const DEFAULT_USER_ID = 'user-1' as Pubky;
  const DEFAULT_VIEWER_ID = 'viewer-123' as Pubky;
  const BASE_TIMESTAMP = 1000000;

  // ============================================================================
  // Test Helpers
  // ============================================================================

  const createMockNexusUser = (userId: Pubky = DEFAULT_USER_ID, overrides?: Partial<NexusUser>): NexusUser => ({
    details: {
      id: userId,
      name: `User ${userId}`,
      bio: `Bio for ${userId}`,
      links: null,
      status: null,
      image: null,
      indexed_at: BASE_TIMESTAMP,
      ...overrides?.details,
    },
    counts: {
      tagged: 0,
      tags: 0,
      unique_tags: 0,
      posts: 10,
      replies: 5,
      following: 20,
      followers: 30,
      friends: 15,
      collections: 0,
      bookmarks: 8,
      ...overrides?.counts,
    },
    tags: [],
    relationship: {
      following: false,
      followed_by: false,
      ...overrides?.relationship,
    },
    ...overrides,
  });

  const createUserDetails = async (userIds: Pubky[]) => {
    return Promise.all(
      userIds.map((userId) =>
        UserDetailsModel.create({
          id: userId,
          name: `User ${userId}`,
          bio: `Bio for ${userId}`,
          links: null,
          status: null,
          image: null,
          indexed_at: BASE_TIMESTAMP,
        }),
      ),
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // getOrFetchStreamSlice Tests
  // ============================================================================

  describe('getOrFetchStreamSlice', () => {
    it('should return users from cache when available', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const cachedUserIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Setup: Create cache
      await LocalStreamUsersService.upsert({ streamId, stream: cachedUserIds });
      await createUserDetails(cachedUserIds);

      // Test
      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 2,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(result.nextPageIds).toEqual(['follower-1', 'follower-2']);
      expect(result.cacheMissUserIds).toEqual([]);
      expect(result.skip).toBeUndefined(); // Cache hit returns undefined skip
    });

    it('should fetch from Nexus when cache is empty', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 3,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(fetchSpy).toHaveBeenCalledWith({
        streamId,
        params: { skip: 0, limit: 3, viewer_id: DEFAULT_VIEWER_ID },
      });
      expect(result.nextPageIds).toEqual(['follower-1', 'follower-2', 'follower-3']);
      expect(result.skip).toBe(3); // Nexus returns next skip value

      // Verify cache was updated
      const cachedStream = await LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3']);
    });

    it('should handle pagination with skip/limit', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const cachedUserIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3', 'follower-4', 'follower-5'];

      // Setup: Create cache
      await LocalStreamUsersService.upsert({ streamId, stream: cachedUserIds });
      await createUserDetails(cachedUserIds);

      // Test: Get second page
      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 2,
        limit: 2,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(result.nextPageIds).toEqual(['follower-3', 'follower-4']);
      expect(result.skip).toBeUndefined();
    });

    it('should return empty array when no more users available', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });

      // Mock Nexus API to return empty
      const fetchSpy = vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue([]);

      // Test
      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 20,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(fetchSpy).toHaveBeenCalled();
      expect(result.nextPageIds).toEqual([]);
      expect(result.cacheMissUserIds).toEqual([]);
      expect(result.skip).toBeUndefined();
    });

    it('should fetch from Nexus when cache has insufficient data', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const cachedUserIds: Pubky[] = ['follower-1', 'follower-2'];
      const newMockUserIds: Pubky[] = ['follower-3', 'follower-4', 'follower-5'];

      // Setup: Create partial cache
      await LocalStreamUsersService.upsert({ streamId, stream: cachedUserIds });
      await createUserDetails(cachedUserIds);

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(newMockUserIds);

      // Test: Request more than cache has
      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 2,
        limit: 3,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert: Should fetch from Nexus
      expect(fetchSpy).toHaveBeenCalledWith({
        streamId,
        params: { skip: 2, limit: 3, viewer_id: DEFAULT_VIEWER_ID },
      });
      expect(result.nextPageIds).toEqual(['follower-3', 'follower-4', 'follower-5']);

      // Verify cache was appended (not replaced)
      const cachedStream = await LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3', 'follower-4', 'follower-5']);
    });

    it('should handle cachedStream parameter correctly when appending', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const existingUserIds: Pubky[] = ['follower-1', 'follower-2'];
      const newMockUserIds: Pubky[] = ['follower-3', 'follower-4'];

      // Setup: Create existing cache
      await LocalStreamUsersService.upsert({ streamId, stream: existingUserIds });

      // Mock Nexus API to return user IDs only
      vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(newMockUserIds);

      // Test
      await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 2,
        limit: 2,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert: Stream should be appended, not replaced
      const cachedStream = await LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3', 'follower-4']);
    });

    it('should create new stream when cachedStream is null', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Mock Nexus API to return user IDs only
      vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 3,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert: New stream should be created
      const cachedStream = await LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3']);
    });

    it('should return cacheMissUserIds correctly', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Mock Nexus API to return user IDs only
      vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Note: Now we fetch only user IDs, so cacheMissUserIds will contain
      // all IDs that are not yet in the UserDetailsModel cache
      // These will need to be fetched separately via the by_ids endpoint

      // Test
      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 3,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Since these users don't exist in cache yet, they should all be cache misses
      expect(result.cacheMissUserIds).toEqual(['follower-1', 'follower-2', 'follower-3']);
    });

    it('should handle enum-based stream IDs (influencers)', async () => {
      const streamId = UserStreamTypes.TODAY_INFLUENCERS_ALL;
      const mockUserIds: Pubky[] = ['influencer-1', 'influencer-2', 'influencer-3'];

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 3,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(fetchSpy).toHaveBeenCalledWith({
        streamId,
        params: { skip: 0, limit: 3, viewer_id: DEFAULT_VIEWER_ID },
      });
      expect(result.nextPageIds).toEqual(['influencer-1', 'influencer-2', 'influencer-3']);
    });

    it('should pass viewerId to Nexus API for relationship data', async () => {
      const streamId = buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Pubky[] = ['follower-1', 'follower-2'];

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 2,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert: viewerId should be passed through
      expect(fetchSpy).toHaveBeenCalledWith({
        streamId,
        params: { skip: 0, limit: 2, viewer_id: DEFAULT_VIEWER_ID },
      });
    });

    it('should return a partial cached stream when allowed', async () => {
      const streamId = UserStreamTypes.RECOMMENDED;
      const cachedUserIds: Pubky[] = ['recommended-1', 'recommended-2', 'recommended-3'];

      await LocalStreamUsersService.upsert({ streamId, stream: cachedUserIds });
      await createUserDetails(cachedUserIds);
      const fetchSpy = vi.spyOn(NexusUserStreamService, 'fetch');

      const result = await UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 10,
        viewerId: DEFAULT_VIEWER_ID,
        allowPartialCache: true,
      });

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.nextPageIds).toEqual(cachedUserIds);
      expect(result.isExhausted).toBe(false);
    });
  });

  describe('refreshStreamSlice', () => {
    it('should bypass cache and replace the cached stream on first page refresh', async () => {
      const streamId = UserStreamTypes.RECOMMENDED;
      await LocalStreamUsersService.upsert({ streamId, stream: ['old-user'] as Pubky[] });

      vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(['new-user-1', 'new-user-2'] as Pubky[]);

      const result = await UserStreamApplication.refreshStreamSlice({
        streamId,
        skip: 0,
        limit: 2,
        viewerId: DEFAULT_VIEWER_ID,
      });

      const cachedStream = await LocalStreamUsersService.findById(streamId);
      expect(result.nextPageIds).toEqual(['new-user-1', 'new-user-2']);
      expect(result.isExhausted).toBe(false);
      expect(cachedStream?.stream).toEqual(['new-user-1', 'new-user-2']);
    });

    it('should replace the cached stream with an empty stream on empty first page refresh', async () => {
      const streamId = UserStreamTypes.RECOMMENDED;
      await LocalStreamUsersService.upsert({ streamId, stream: ['old-user'] as Pubky[] });

      vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue([]);

      const result = await UserStreamApplication.refreshStreamSlice({
        streamId,
        skip: 0,
        limit: 10,
        viewerId: DEFAULT_VIEWER_ID,
      });

      const cachedStream = await LocalStreamUsersService.findById(streamId);
      expect(result.nextPageIds).toEqual([]);
      expect(result.isExhausted).toBe(true);
      expect(cachedStream?.stream).toEqual([]);
    });

    it('should append and dedupe later pages', async () => {
      const streamId = UserStreamTypes.RECOMMENDED;
      await LocalStreamUsersService.upsert({ streamId, stream: ['user-1', 'user-2'] as Pubky[] });

      vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(['user-2', 'user-3'] as Pubky[]);

      await UserStreamApplication.refreshStreamSlice({
        streamId,
        skip: 2,
        limit: 2,
        viewerId: DEFAULT_VIEWER_ID,
      });

      const cachedStream = await LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['user-1', 'user-2', 'user-3']);
    });

    it('should mark short Nexus pages as exhausted', async () => {
      const streamId = UserStreamTypes.RECOMMENDED;
      vi.spyOn(NexusUserStreamService, 'fetch').mockResolvedValue(['user-1'] as Pubky[]);

      const result = await UserStreamApplication.refreshStreamSlice({
        streamId,
        skip: 0,
        limit: 10,
        viewerId: DEFAULT_VIEWER_ID,
      });

      expect(result.isExhausted).toBe(true);
      expect(result.skip).toBe(1);
    });
  });

  // ============================================================================
  // fetchMissingUsersFromNexus Tests
  // ============================================================================

  describe('fetchMissingUsersFromNexus', () => {
    it('should fetch and persist users when cacheMissUserIds exist', async () => {
      const cacheMissUserIds: Pubky[] = ['user-1', 'user-2', 'user-3'];
      const mockUsers = cacheMissUserIds.map((id) => createMockNexusUser(id));

      // Mock NexusUserStreamService.fetchByIds
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      // Mock persistUsers to track it was called
      const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

      // Test
      await UserStreamApplication.fetchMissingUsersFromNexus({
        cacheMissUserIds,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(fetchByIdsSpy).toHaveBeenCalledWith({
        user_ids: cacheMissUserIds,
        viewer_id: DEFAULT_VIEWER_ID,
      });
      expect(persistSpy).toHaveBeenCalledWith(mockUsers);
    });

    it('should not fetch when cacheMissUserIds is empty', async () => {
      // Mock NexusUserStreamService.fetchByIds to track it's not called
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds');

      // Test
      await UserStreamApplication.fetchMissingUsersFromNexus({
        cacheMissUserIds: [],
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(fetchByIdsSpy).not.toHaveBeenCalled();
    });

    it('should pass viewerId to usersByIds API', async () => {
      const cacheMissUserIds: Pubky[] = ['user-1', 'user-2'];
      const mockUsers = cacheMissUserIds.map((id) => createMockNexusUser(id));

      // Mock NexusUserStreamService.fetchByIds
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      // Test
      await UserStreamApplication.fetchMissingUsersFromNexus({
        cacheMissUserIds,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert: Check viewer_id is passed
      expect(fetchByIdsSpy).toHaveBeenCalledWith({
        user_ids: cacheMissUserIds,
        viewer_id: DEFAULT_VIEWER_ID,
      });
    });

    it('should handle missing viewerId', async () => {
      const cacheMissUserIds: Pubky[] = ['user-1'];
      const mockUsers = [createMockNexusUser('user-1')];

      // Mock NexusUserStreamService.fetchByIds
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      // Test without viewerId
      await UserStreamApplication.fetchMissingUsersFromNexus({
        cacheMissUserIds,
        viewerId: undefined,
      });

      // Assert: Should still work, just without viewer_id
      expect(fetchByIdsSpy).toHaveBeenCalledWith({
        user_ids: cacheMissUserIds,
        viewer_id: undefined,
      });
    });
  });

  // ============================================================================
  // getOrFetchUsers Tests
  // ============================================================================

  describe('getOrFetchUsers', () => {
    it('should return early when userIds is empty', async () => {
      const getNotPersistedSpy = vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache');
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds');

      await UserStreamApplication.getOrFetchUsers({
        userIds: [],
        viewerId: DEFAULT_VIEWER_ID,
      });

      expect(getNotPersistedSpy).not.toHaveBeenCalled();
      expect(fetchByIdsSpy).not.toHaveBeenCalled();
    });

    it('should return early when all users are already cached', async () => {
      const userIds: Pubky[] = ['user-1', 'user-2'];

      // All users are already in cache
      vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds');

      await UserStreamApplication.getOrFetchUsers({
        userIds,
        viewerId: DEFAULT_VIEWER_ID,
      });

      expect(fetchByIdsSpy).not.toHaveBeenCalled();
    });

    it('should fetch missing users from Nexus when cache misses exist', async () => {
      const userIds: Pubky[] = ['user-1', 'user-2', 'user-3'];
      const cacheMissUserIds: Pubky[] = ['user-2', 'user-3'];
      const mockUsers = cacheMissUserIds.map((id) => createMockNexusUser(id));

      vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue(cacheMissUserIds);
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);
      const persistSpy = vi.spyOn(LocalStreamUsersService, 'persistUsers');

      await UserStreamApplication.getOrFetchUsers({
        userIds,
        viewerId: DEFAULT_VIEWER_ID,
      });

      expect(fetchByIdsSpy).toHaveBeenCalledWith({
        user_ids: cacheMissUserIds,
        viewer_id: DEFAULT_VIEWER_ID,
      });
      expect(persistSpy).toHaveBeenCalledWith(mockUsers);
    });

    it('should pass viewerId through to fetchMissingUsersFromNexus', async () => {
      const userIds: Pubky[] = ['user-1'];
      const cacheMissUserIds: Pubky[] = ['user-1'];
      const mockUsers = [createMockNexusUser('user-1')];

      vi.spyOn(LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue(cacheMissUserIds);
      const fetchByIdsSpy = vi.spyOn(NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      await UserStreamApplication.getOrFetchUsers({
        userIds,
        viewerId: undefined,
      });

      expect(fetchByIdsSpy).toHaveBeenCalledWith({
        user_ids: cacheMissUserIds,
        viewer_id: undefined,
      });
    });
  });
});
