import { describe, it, expect, beforeEach } from 'vitest';
import * as Core from '@/core';
import * as Config from '@/config';

describe('LocalStreamUsersService', () => {
  const targetUserId = 'user-target' as Core.Pubky;
  const streamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
  const NON_EXISTENT_STREAM_ID = Core.buildUserCompositeId({ userId: 'non-existent', reach: 'followers' });
  const BASE_TIMESTAMP = 1000000;

  // ============================================================================
  // Test Helpers
  // ============================================================================

  const createMockNexusUser = (userId: Core.Pubky, overrides?: Partial<Core.NexusUser>): Core.NexusUser => ({
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
    tags: overrides?.tags ?? [],
    relationship: {
      following: false,
      followed_by: false,
      ...overrides?.relationship,
    },
    ...overrides,
  });

  const createStream = async (userIds: Core.Pubky[], customStreamId?: string) => {
    await Core.LocalStreamUsersService.upsert({ streamId: customStreamId || streamId, stream: userIds });
  };

  const verifyStream = async (expectedUserIds: Core.Pubky[], customStreamId?: string) => {
    const result = await Core.UserStreamModel.findById(customStreamId || streamId);
    expect(result).toBeTruthy();
    expect(result!.stream).toEqual(expectedUserIds);
  };

  const verifyStreamDoesNotExist = async (customStreamId?: string) => {
    const result = await Core.UserStreamModel.findById(customStreamId || streamId);
    expect(result).toBeNull();
  };

  const verifyUserPersisted = async (userId: Core.Pubky, expectedName: string) => {
    const details = await Core.UserDetailsModel.findById(userId);
    expect(details).toBeTruthy();
    expect(details?.name).toBe(expectedName);

    const counts = await Core.UserCountsModel.findById(userId);
    expect(counts).toBeTruthy();

    const relationships = await Core.UserRelationshipsModel.findById(userId);
    expect(relationships).toBeTruthy();

    const tags = await Core.UserTagsModel.findById(userId);
    expect(tags).toBeTruthy();

    const ttl = await Core.UserTtlModel.findById(userId);
    expect(ttl).toBeTruthy();
    expect(ttl?.lastUpdatedAt).toBeGreaterThan(0);
  };

  const persistAndVerifyUser = async (userId: Core.Pubky, overrides?: Partial<Core.NexusUser>) => {
    const mockUser = createMockNexusUser(userId, overrides);
    const result = await Core.LocalStreamUsersService.persistUsers([mockUser]);

    expect(result).toEqual([userId]);
    return { userId, mockUser };
  };

  beforeEach(async () => {
    // Clear all relevant tables
    await Core.UserStreamModel.table.clear();
    await Core.UserDetailsModel.table.clear();
    await Core.UserCountsModel.table.clear();
    await Core.UserRelationshipsModel.table.clear();
    await Core.UserTagsModel.table.clear();
    await Core.ModerationModel.table.clear();
    await Core.UserTtlModel.table.clear();
  });

  describe('upsert', () => {
    it('should create a new stream with user IDs', async () => {
      const userIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      await createStream(userIds);

      await verifyStream(userIds);
    });

    it('should update an existing stream with new user IDs', async () => {
      const initialUserIds: Core.Pubky[] = ['follower-1', 'follower-2'];
      const updatedUserIds: Core.Pubky[] = ['follower-3', 'follower-4', 'follower-5'];

      await createStream(initialUserIds);
      await verifyStream(initialUserIds);

      await createStream(updatedUserIds);
      await verifyStream(updatedUserIds);
    });

    it('should handle empty array', async () => {
      await createStream([]);

      await verifyStream([]);
    });

    it('should handle composite IDs (userId:reach format)', async () => {
      const followingStreamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const userIds: Core.Pubky[] = ['following-1', 'following-2'];

      await createStream(userIds, followingStreamId);
      await verifyStream(userIds, followingStreamId);
    });

    it('should handle different reach types', async () => {
      const followersIds: Core.Pubky[] = ['follower-1'];
      const followingIds: Core.Pubky[] = ['following-1'];
      const friendsIds: Core.Pubky[] = ['friend-1'];

      const followersStreamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const followingStreamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const friendsStreamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'friends' });

      await createStream(followersIds, followersStreamId);
      await createStream(followingIds, followingStreamId);
      await createStream(friendsIds, friendsStreamId);

      await verifyStream(followersIds, followersStreamId);
      await verifyStream(followingIds, followingStreamId);
      await verifyStream(friendsIds, friendsStreamId);
    });
  });

  describe('findById', () => {
    it('should return stream when it exists', async () => {
      const userIds: Core.Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      await createStream(userIds);

      const result = await Core.LocalStreamUsersService.findById(streamId);

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(userIds);
    });

    it('should return null when stream does not exist', async () => {
      const result = await Core.LocalStreamUsersService.findById(NON_EXISTENT_STREAM_ID);

      expect(result).toBeNull();
    });

    it('should handle composite IDs correctly', async () => {
      const followingStreamId = Core.buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const userIds: Core.Pubky[] = ['following-1', 'following-2'];

      await createStream(userIds, followingStreamId);

      const result = await Core.LocalStreamUsersService.findById(followingStreamId);

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(userIds);
    });
  });

  describe('deleteById', () => {
    it('should delete an existing stream', async () => {
      const userIds: Core.Pubky[] = ['follower-1', 'follower-2'];

      await createStream(userIds);
      await verifyStream(userIds);

      await Core.LocalStreamUsersService.deleteById(streamId);

      await verifyStreamDoesNotExist();
    });

    it('should not throw error when deleting non-existent stream', async () => {
      await expect(Core.LocalStreamUsersService.deleteById(NON_EXISTENT_STREAM_ID)).resolves.not.toThrow();

      await verifyStreamDoesNotExist(NON_EXISTENT_STREAM_ID);
    });
  });

  describe('persistUsers', () => {
    it('should persist users to normalized tables (details, counts, tags, relationships, ttl)', async () => {
      const userId = 'user-1' as Core.Pubky;
      const { mockUser } = await persistAndVerifyUser(userId);

      await verifyUserPersisted(userId, mockUser.details.name);
    });

    it('should return array of user IDs (Pubky[])', async () => {
      const userIds: Core.Pubky[] = ['user-1', 'user-2', 'user-3'];
      const mockUsers = userIds.map((id) => createMockNexusUser(id));

      const result = await Core.LocalStreamUsersService.persistUsers(mockUsers);

      expect(result).toEqual(userIds);
    });

    it('should handle users with tags', async () => {
      const userId = 'user-1' as Core.Pubky;
      const mockTags: Core.NexusTag[] = [
        {
          label: 'developer',
          taggers: ['tagger-1', 'tagger-2'],
          taggers_count: 2,
          relationship: true,
        },
        {
          label: 'designer',
          taggers: ['tagger-3'],
          taggers_count: 1,
          relationship: false,
        },
      ];

      await persistAndVerifyUser(userId, { tags: mockTags });

      const savedTagsModel = await Core.UserTagsModel.findById(userId);
      expect(savedTagsModel).toBeTruthy();
      const savedTags = savedTagsModel!.tags;
      expect(savedTags).toHaveLength(2);
      expect(savedTags[0].label).toBe('developer');
      expect(savedTags[1].label).toBe('designer');
    });

    it('should handle users with relationships', async () => {
      const userId = 'user-1' as Core.Pubky;
      const mockRelationship = {
        following: true,
        followed_by: true,
      };

      await persistAndVerifyUser(userId, { relationship: mockRelationship });

      const savedRelationship = await Core.UserRelationshipsModel.findById(userId);
      expect(savedRelationship).toBeTruthy();
      expect(savedRelationship!.following).toBe(true);
      expect(savedRelationship!.followed_by).toBe(true);
    });

    it('should convert NexusTag format correctly', async () => {
      const userId = 'user-1' as Core.Pubky;
      const mockUserTags: Core.NexusTag[] = [
        {
          label: 'expert',
          taggers: ['tagger-1'],
          taggers_count: 1,
          relationship: true,
        },
      ];

      await persistAndVerifyUser(userId, { tags: mockUserTags });

      const savedTagsModel = await Core.UserTagsModel.findById(userId);
      expect(savedTagsModel).toBeTruthy();
      const savedTags = savedTagsModel!.tags;
      expect(savedTags[0]).toHaveProperty('label');
      expect(savedTags[0]).toHaveProperty('taggers');
      expect(savedTags[0]).toHaveProperty('taggers_count');
      expect(savedTags[0]).toHaveProperty('relationship');
      expect(savedTags[0].label).toBe('expert');
    });

    it('should handle empty array', async () => {
      const result = await Core.LocalStreamUsersService.persistUsers([]);

      expect(result).toEqual([]);
    });

    it('should bulk save to all 5 tables in parallel (details, counts, tags, relationships, ttl)', async () => {
      const userIds: Core.Pubky[] = ['user-1', 'user-2', 'user-3'];
      const mockUsers = userIds.map((id) => createMockNexusUser(id));

      await Core.LocalStreamUsersService.persistUsers(mockUsers);

      // Verify all tables have data
      for (const userId of userIds) {
        const details = await Core.UserDetailsModel.findById(userId);
        expect(details).toBeTruthy();

        const counts = await Core.UserCountsModel.findById(userId);
        expect(counts).toBeTruthy();

        const relationships = await Core.UserRelationshipsModel.findById(userId);
        expect(relationships).toBeTruthy();

        const tags = await Core.UserTagsModel.findById(userId);
        expect(tags).toBeTruthy();

        const ttl = await Core.UserTtlModel.findById(userId);
        expect(ttl).toBeTruthy();
        expect(ttl?.lastUpdatedAt).toBeGreaterThan(0);
      }
    });

    it('should persist user details correctly', async () => {
      const userId = 'user-1' as Core.Pubky;
      const mockUser = createMockNexusUser(userId, {
        details: {
          id: userId,
          name: 'John Doe',
          bio: 'Software Engineer',
          links: [{ title: 'Website', url: 'https://example.com' }],
          status: 'active',
          image: 'https://example.com/avatar.jpg',
          indexed_at: BASE_TIMESTAMP,
        },
      });

      await Core.LocalStreamUsersService.persistUsers([mockUser]);

      const details = await Core.UserDetailsModel.findById(userId);
      expect(details).toBeTruthy();
      expect(details!.name).toBe('John Doe');
      expect(details!.bio).toBe('Software Engineer');
      expect(details!.links).toEqual([{ title: 'Website', url: 'https://example.com' }]);
      expect(details!.status).toBe('active');
      expect(details!.image).toBe('https://example.com/avatar.jpg');
    });

    it('should persist user counts correctly', async () => {
      const userId = 'user-1' as Core.Pubky;
      const mockUser = createMockNexusUser(userId, {
        counts: {
          tagged: 5,
          tags: 3,
          unique_tags: 2,
          posts: 100,
          replies: 50,
          following: 200,
          followers: 300,
          friends: 150,
          bookmarks: 25,
        },
      });

      await Core.LocalStreamUsersService.persistUsers([mockUser]);

      const counts = await Core.UserCountsModel.findById(userId);
      expect(counts).toBeTruthy();
      expect(counts!.posts).toBe(100);
      expect(counts!.replies).toBe(50);
      expect(counts!.followers).toBe(300);
      expect(counts!.following).toBe(200);
    });

    describe('moderation detection', () => {
      it('should create moderation record for user with moderation tag', async () => {
        const userId = 'user-moderated' as Core.Pubky;
        const moderatedTags: Core.NexusTag[] = [
          {
            label: Config.MODERATED_TAGS[0],
            taggers: [Config.MODERATION_ID],
            taggers_count: 1,
            relationship: { tagged: true, tagged_by_viewer: false },
          },
        ];

        const mockUser = createMockNexusUser(userId, { tags: moderatedTags });
        await Core.LocalStreamUsersService.persistUsers([mockUser]);

        const moderationRecord = await Core.ModerationModel.findById(userId);
        expect(moderationRecord).toBeTruthy();
        expect(moderationRecord!.type).toBe(Core.ModerationType.PROFILE);
        expect(moderationRecord!.is_blurred).toBe(true);
      });

      it('should not create moderation record for user without moderation tag', async () => {
        const userId = 'user-normal' as Core.Pubky;
        const normalTags: Core.NexusTag[] = [
          {
            label: 'developer',
            taggers: ['tagger-1'],
            taggers_count: 1,
            relationship: { tagged: true, tagged_by_viewer: false },
          },
        ];

        const mockUser = createMockNexusUser(userId, { tags: normalTags });
        await Core.LocalStreamUsersService.persistUsers([mockUser]);

        const moderationRecord = await Core.ModerationModel.findById(userId);
        expect(moderationRecord).toBeNull();
      });

      it('should not create moderation record when tag has wrong tagger', async () => {
        const userId = 'user-wrong-tagger' as Core.Pubky;
        const tagsWithWrongTagger: Core.NexusTag[] = [
          {
            label: Config.MODERATED_TAGS[0],
            taggers: ['wrong-tagger-id'],
            taggers_count: 1,
            relationship: { tagged: true, tagged_by_viewer: false },
          },
        ];

        const mockUser = createMockNexusUser(userId, { tags: tagsWithWrongTagger });
        await Core.LocalStreamUsersService.persistUsers([mockUser]);

        const moderationRecord = await Core.ModerationModel.findById(userId);
        expect(moderationRecord).toBeNull();
      });

      it('should handle mixed moderated and non-moderated users', async () => {
        const moderatedUserId = 'user-moderated' as Core.Pubky;
        const normalUserId = 'user-normal' as Core.Pubky;

        const moderatedUser = createMockNexusUser(moderatedUserId, {
          tags: [
            {
              label: Config.MODERATED_TAGS[0],
              taggers: [Config.MODERATION_ID],
              taggers_count: 1,
              relationship: { tagged: true, tagged_by_viewer: false },
            },
          ],
        });

        const normalUser = createMockNexusUser(normalUserId, { tags: [] });

        await Core.LocalStreamUsersService.persistUsers([moderatedUser, normalUser]);

        const moderatedRecord = await Core.ModerationModel.findById(moderatedUserId);
        expect(moderatedRecord).toBeTruthy();
        expect(moderatedRecord!.type).toBe(Core.ModerationType.PROFILE);

        const normalRecord = await Core.ModerationModel.findById(normalUserId);
        expect(normalRecord).toBeNull();
      });
    });
  });
});
