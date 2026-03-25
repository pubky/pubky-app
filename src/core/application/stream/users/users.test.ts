import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Core from '@/core';

describe('UserStreamApplication', () => {
  const DEFAULT_USER_ID = 'user-1' as Core.Pubky;
  const DEFAULT_VIEWER_ID = 'viewer-123' as Core.Pubky;
  const BASE_TIMESTAMP = 1000000;

  // ============================================================================
  // Test Helpers
  // ============================================================================

  const createMockNexusUser = (
    userId: Core.Pubky = DEFAULT_USER_ID,
    overrides?: Partial<Core.NexusUser>,
  ): Core.NexusUser => ({
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

  const createUserDetails = async (userIds: Core.Pubky[]) => {
    return Promise.all(
      userIds.map((userId) =>
        Core.UserDetailsModel.create({
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
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const cachedUserIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Setup: Create cache
      await Core.LocalStreamUsersService.upsert({ streamId, stream: cachedUserIds });
      await createUserDetails(cachedUserIds);

      // Test
      const result = await Core.UserStreamApplication.getOrFetchStreamSlice({
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
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      const result = await Core.UserStreamApplication.getOrFetchStreamSlice({
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
      const cachedStream = await Core.LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3']);
    });

    it('should handle pagination with skip/limit', async () => {
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const cachedUserIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3', 'follower-4', 'follower-5'];

      // Setup: Create cache
      await Core.LocalStreamUsersService.upsert({ streamId, stream: cachedUserIds });
      await createUserDetails(cachedUserIds);

      // Test: Get second page
      const result = await Core.UserStreamApplication.getOrFetchStreamSlice({
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
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });

      // Mock Nexus API to return empty
      const fetchSpy = vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue([]);

      // Test
      const result = await Core.UserStreamApplication.getOrFetchStreamSlice({
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
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const cachedUserIds: Core.Pubky[] = ['follower-1', 'follower-2'];
      const newMockUserIds: Core.Pubky[] = ['follower-3', 'follower-4', 'follower-5'];

      // Setup: Create partial cache
      await Core.LocalStreamUsersService.upsert({ streamId, stream: cachedUserIds });
      await createUserDetails(cachedUserIds);

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue(newMockUserIds);

      // Test: Request more than cache has
      const result = await Core.UserStreamApplication.getOrFetchStreamSlice({
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
      const cachedStream = await Core.LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3', 'follower-4', 'follower-5']);
    });

    it('should handle cachedStream parameter correctly when appending', async () => {
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const existingUserIds: Core.Pubky[] = ['follower-1', 'follower-2'];
      const newMockUserIds: Core.Pubky[] = ['follower-3', 'follower-4'];

      // Setup: Create existing cache
      await Core.LocalStreamUsersService.upsert({ streamId, stream: existingUserIds });

      // Mock Nexus API to return user IDs only
      vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue(newMockUserIds);

      // Test
      await Core.UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 2,
        limit: 2,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert: Stream should be appended, not replaced
      const cachedStream = await Core.LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3', 'follower-4']);
    });

    it('should create new stream when cachedStream is null', async () => {
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Mock Nexus API to return user IDs only
      vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      await Core.UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 3,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert: New stream should be created
      const cachedStream = await Core.LocalStreamUsersService.findById(streamId);
      expect(cachedStream?.stream).toEqual(['follower-1', 'follower-2', 'follower-3']);
    });

    it('should return cacheMissUserIds correctly', async () => {
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      // Mock Nexus API to return user IDs only
      vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Note: Now we fetch only user IDs, so cacheMissUserIds will contain
      // all IDs that are not yet in the UserDetailsModel cache
      // These will need to be fetched separately via the by_ids endpoint

      // Test
      const result = await Core.UserStreamApplication.getOrFetchStreamSlice({
        streamId,
        skip: 0,
        limit: 3,
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Since these users don't exist in cache yet, they should all be cache misses
      expect(result.cacheMissUserIds).toEqual(['follower-1', 'follower-2', 'follower-3']);
    });

    it('should handle enum-based stream IDs (influencers)', async () => {
      const streamId = Core.UserStreamTypes.TODAY_INFLUENCERS_ALL;
      const mockUserIds: Core.Pubky[] = ['influencer-1', 'influencer-2', 'influencer-3'];

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      const result = await Core.UserStreamApplication.getOrFetchStreamSlice({
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
      const streamId = Core.buildUserCompositeId({ userId: DEFAULT_USER_ID, reach: 'followers' });
      const mockUserIds: Core.Pubky[] = ['follower-1', 'follower-2'];

      // Mock Nexus API to return user IDs only
      const fetchSpy = vi.spyOn(Core.NexusUserStreamService, 'fetch').mockResolvedValue(mockUserIds);

      // Test
      await Core.UserStreamApplication.getOrFetchStreamSlice({
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
  });

  // ============================================================================
  // fetchMissingUsersFromNexus Tests
  // ============================================================================

  describe('fetchMissingUsersFromNexus', () => {
    it('should fetch and persist users when cacheMissUserIds exist', async () => {
      const cacheMissUserIds: Core.Pubky[] = ['user-1', 'user-2', 'user-3'];
      const mockUsers = cacheMissUserIds.map((id) => createMockNexusUser(id));

      // Mock NexusUserStreamService.fetchByIds
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      // Mock persistUsers to track it was called
      const persistSpy = vi.spyOn(Core.LocalStreamUsersService, 'persistUsers');

      // Test
      await Core.UserStreamApplication.fetchMissingUsersFromNexus({
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
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds');

      // Test
      await Core.UserStreamApplication.fetchMissingUsersFromNexus({
        cacheMissUserIds: [],
        viewerId: DEFAULT_VIEWER_ID,
      });

      // Assert
      expect(fetchByIdsSpy).not.toHaveBeenCalled();
    });

    it('should pass viewerId to usersByIds API', async () => {
      const cacheMissUserIds: Core.Pubky[] = ['user-1', 'user-2'];
      const mockUsers = cacheMissUserIds.map((id) => createMockNexusUser(id));

      // Mock NexusUserStreamService.fetchByIds
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      // Test
      await Core.UserStreamApplication.fetchMissingUsersFromNexus({
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
      const cacheMissUserIds: Core.Pubky[] = ['user-1'];
      const mockUsers = [createMockNexusUser('user-1')];

      // Mock NexusUserStreamService.fetchByIds
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      // Test without viewerId
      await Core.UserStreamApplication.fetchMissingUsersFromNexus({
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
      const getNotPersistedSpy = vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache');
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds');

      await Core.UserStreamApplication.getOrFetchUsers({
        userIds: [],
        viewerId: DEFAULT_VIEWER_ID,
      });

      expect(getNotPersistedSpy).not.toHaveBeenCalled();
      expect(fetchByIdsSpy).not.toHaveBeenCalled();
    });

    it('should return early when all users are already cached', async () => {
      const userIds: Core.Pubky[] = ['user-1', 'user-2'];

      // All users are already in cache
      vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue([]);
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds');

      await Core.UserStreamApplication.getOrFetchUsers({
        userIds,
        viewerId: DEFAULT_VIEWER_ID,
      });

      expect(fetchByIdsSpy).not.toHaveBeenCalled();
    });

    it('should fetch missing users from Nexus when cache misses exist', async () => {
      const userIds: Core.Pubky[] = ['user-1', 'user-2', 'user-3'];
      const cacheMissUserIds: Core.Pubky[] = ['user-2', 'user-3'];
      const mockUsers = cacheMissUserIds.map((id) => createMockNexusUser(id));

      vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue(cacheMissUserIds);
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);
      const persistSpy = vi.spyOn(Core.LocalStreamUsersService, 'persistUsers');

      await Core.UserStreamApplication.getOrFetchUsers({
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
      const userIds: Core.Pubky[] = ['user-1'];
      const cacheMissUserIds: Core.Pubky[] = ['user-1'];
      const mockUsers = [createMockNexusUser('user-1')];

      vi.spyOn(Core.LocalStreamUsersService, 'getNotPersistedUsersInCache').mockResolvedValue(cacheMissUserIds);
      const fetchByIdsSpy = vi.spyOn(Core.NexusUserStreamService, 'fetchByIds').mockResolvedValue(mockUsers);

      await Core.UserStreamApplication.getOrFetchUsers({
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
