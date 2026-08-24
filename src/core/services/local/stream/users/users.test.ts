import { beforeEach, describe, expect, it } from 'vitest';
import { getModeratedTags } from '@/config/moderation';
import { APP_RUNTIME_DEFAULTS } from '@/libs/runtime-config/runtime-config.schema';
import type { Pubky } from '@/models/models.types';
import { ModerationModel } from '@/models/moderation/moderation';
import { ModerationType } from '@/models/moderation/moderation.schema';
import { UserStreamModel } from '@/models/stream/user/userStream';
import { buildUserCompositeId } from '@/models/stream/user/userStream.helper';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { NexusTag, NexusUser } from '@/services/nexus/nexus.types';

describe('LocalStreamUsersService', () => {
  const targetUserId = 'user-target' as Pubky;
  const streamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
  const NON_EXISTENT_STREAM_ID = buildUserCompositeId({ userId: 'non-existent', reach: 'followers' });
  const BASE_TIMESTAMP = 1000000;

  // ============================================================================
  // Test Helpers
  // ============================================================================

  const createMockNexusUser = (userId: Pubky, overrides?: Partial<NexusUser>): NexusUser => ({
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
    tags: overrides?.tags ?? [],
    relationship: {
      following: false,
      followed_by: false,
      ...overrides?.relationship,
    },
    ...overrides,
  });

  const createStream = async (userIds: Pubky[], customStreamId?: string) => {
    await LocalStreamUsersService.upsert({ streamId: customStreamId || streamId, stream: userIds });
  };

  const verifyStream = async (expectedUserIds: Pubky[], customStreamId?: string) => {
    const result = await UserStreamModel.findById(customStreamId || streamId);
    expect(result).toBeTruthy();
    expect(result!.stream).toEqual(expectedUserIds);
  };

  const verifyStreamDoesNotExist = async (customStreamId?: string) => {
    const result = await UserStreamModel.findById(customStreamId || streamId);
    expect(result).toBeNull();
  };

  const verifyUserPersisted = async (userId: Pubky, expectedName: string) => {
    const details = await UserDetailsModel.findById(userId);
    expect(details).toBeTruthy();
    expect(details?.name).toBe(expectedName);

    const counts = await UserCountsModel.findById(userId);
    expect(counts).toBeTruthy();

    const relationships = await UserRelationshipsModel.findById(userId);
    expect(relationships).toBeTruthy();

    const tags = await UserTagsModel.findById(userId);
    expect(tags).toBeTruthy();

    const ttl = await UserTtlModel.findById(userId);
    expect(ttl).toBeTruthy();
    expect(ttl?.lastUpdatedAt).toBeGreaterThan(0);
  };

  const persistAndVerifyUser = async (userId: Pubky, overrides?: Partial<NexusUser>) => {
    const mockUser = createMockNexusUser(userId, overrides);
    const result = await LocalStreamUsersService.persistUsers([mockUser]);

    expect(result).toEqual([userId]);
    return { userId, mockUser };
  };

  beforeEach(async () => {
    // Clear all relevant tables
    await UserStreamModel.table.clear();
    await UserDetailsModel.table.clear();
    await UserCountsModel.table.clear();
    await UserRelationshipsModel.table.clear();
    await UserTagsModel.table.clear();
    await ModerationModel.table.clear();
    await UserTtlModel.table.clear();
  });

  describe('upsert', () => {
    it('should create a new stream with user IDs', async () => {
      const userIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      await createStream(userIds);

      await verifyStream(userIds);
    });

    it('should update an existing stream with new user IDs', async () => {
      const initialUserIds: Pubky[] = ['follower-1', 'follower-2'];
      const updatedUserIds: Pubky[] = ['follower-3', 'follower-4', 'follower-5'];

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
      const followingStreamId = buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const userIds: Pubky[] = ['following-1', 'following-2'];

      await createStream(userIds, followingStreamId);
      await verifyStream(userIds, followingStreamId);
    });

    it('should handle different reach types', async () => {
      const followersIds: Pubky[] = ['follower-1'];
      const followingIds: Pubky[] = ['following-1'];
      const friendsIds: Pubky[] = ['friend-1'];

      const followersStreamId = buildUserCompositeId({ userId: targetUserId, reach: 'followers' });
      const followingStreamId = buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const friendsStreamId = buildUserCompositeId({ userId: targetUserId, reach: 'friends' });

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
      const userIds: Pubky[] = ['follower-1', 'follower-2', 'follower-3'];

      await createStream(userIds);

      const result = await LocalStreamUsersService.findById(streamId);

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(userIds);
    });

    it('should return null when stream does not exist', async () => {
      const result = await LocalStreamUsersService.findById(NON_EXISTENT_STREAM_ID);

      expect(result).toBeNull();
    });

    it('should handle composite IDs correctly', async () => {
      const followingStreamId = buildUserCompositeId({ userId: targetUserId, reach: 'following' });
      const userIds: Pubky[] = ['following-1', 'following-2'];

      await createStream(userIds, followingStreamId);

      const result = await LocalStreamUsersService.findById(followingStreamId);

      expect(result).toBeTruthy();
      expect(result!.stream).toEqual(userIds);
    });
  });

  describe('deleteById', () => {
    it('should delete an existing stream', async () => {
      const userIds: Pubky[] = ['follower-1', 'follower-2'];

      await createStream(userIds);
      await verifyStream(userIds);

      await LocalStreamUsersService.deleteById(streamId);

      await verifyStreamDoesNotExist();
    });

    it('should not throw error when deleting non-existent stream', async () => {
      await expect(LocalStreamUsersService.deleteById(NON_EXISTENT_STREAM_ID)).resolves.not.toThrow();

      await verifyStreamDoesNotExist(NON_EXISTENT_STREAM_ID);
    });
  });

  describe('persistUsers', () => {
    it('should persist users to normalized tables (details, counts, tags, relationships, ttl)', async () => {
      const userId = 'user-1' as Pubky;
      const { mockUser } = await persistAndVerifyUser(userId);

      await verifyUserPersisted(userId, mockUser.details.name);
    });

    it('should return array of user IDs (Pubky[])', async () => {
      const userIds: Pubky[] = ['user-1', 'user-2', 'user-3'];
      const mockUsers = userIds.map((id) => createMockNexusUser(id));

      const result = await LocalStreamUsersService.persistUsers(mockUsers);

      expect(result).toEqual(userIds);
    });

    it('should handle users with tags', async () => {
      const userId = 'user-1' as Pubky;
      const mockTags: NexusTag[] = [
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

      const savedTagsModel = await UserTagsModel.findById(userId);
      expect(savedTagsModel).toBeTruthy();
      const savedTags = savedTagsModel!.tags;
      expect(savedTags).toHaveLength(2);
      expect(savedTags[0].label).toBe('developer');
      expect(savedTags[1].label).toBe('designer');
    });

    it('should handle users with relationships', async () => {
      const userId = 'user-1' as Pubky;
      const mockRelationship = {
        following: true,
        followed_by: true,
      };

      await persistAndVerifyUser(userId, { relationship: mockRelationship });

      const savedRelationship = await UserRelationshipsModel.findById(userId);
      expect(savedRelationship).toBeTruthy();
      expect(savedRelationship!.following).toBe(true);
      expect(savedRelationship!.followed_by).toBe(true);
    });

    it('should convert NexusTag format correctly', async () => {
      const userId = 'user-1' as Pubky;
      const mockUserTags: NexusTag[] = [
        {
          label: 'expert',
          taggers: ['tagger-1'],
          taggers_count: 1,
          relationship: true,
        },
      ];

      await persistAndVerifyUser(userId, { tags: mockUserTags });

      const savedTagsModel = await UserTagsModel.findById(userId);
      expect(savedTagsModel).toBeTruthy();
      const savedTags = savedTagsModel!.tags;
      expect(savedTags[0]).toHaveProperty('label');
      expect(savedTags[0]).toHaveProperty('taggers');
      expect(savedTags[0]).toHaveProperty('taggers_count');
      expect(savedTags[0]).toHaveProperty('relationship');
      expect(savedTags[0].label).toBe('expert');
    });

    it('should handle empty array', async () => {
      const result = await LocalStreamUsersService.persistUsers([]);

      expect(result).toEqual([]);
    });

    it('should bulk save to all 5 tables in parallel (details, counts, tags, relationships, ttl)', async () => {
      const userIds: Pubky[] = ['user-1', 'user-2', 'user-3'];
      const mockUsers = userIds.map((id) => createMockNexusUser(id));

      await LocalStreamUsersService.persistUsers(mockUsers);

      // Verify all tables have data
      for (const userId of userIds) {
        const details = await UserDetailsModel.findById(userId);
        expect(details).toBeTruthy();

        const counts = await UserCountsModel.findById(userId);
        expect(counts).toBeTruthy();

        const relationships = await UserRelationshipsModel.findById(userId);
        expect(relationships).toBeTruthy();

        const tags = await UserTagsModel.findById(userId);
        expect(tags).toBeTruthy();

        const ttl = await UserTtlModel.findById(userId);
        expect(ttl).toBeTruthy();
        expect(ttl?.lastUpdatedAt).toBeGreaterThan(0);
      }
    });

    it('should persist user details correctly', async () => {
      const userId = 'user-1' as Pubky;
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

      await LocalStreamUsersService.persistUsers([mockUser]);

      const details = await UserDetailsModel.findById(userId);
      expect(details).toBeTruthy();
      expect(details!.name).toBe('John Doe');
      expect(details!.bio).toBe('Software Engineer');
      expect(details!.links).toEqual([{ title: 'Website', url: 'https://example.com' }]);
      expect(details!.status).toBe('active');
      expect(details!.image).toBe('https://example.com/avatar.jpg');
    });

    it('should persist user counts correctly', async () => {
      const userId = 'user-1' as Pubky;
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
          collections: 0,
          bookmarks: 25,
        },
      });

      await LocalStreamUsersService.persistUsers([mockUser]);

      const counts = await UserCountsModel.findById(userId);
      expect(counts).toBeTruthy();
      expect(counts!.posts).toBe(100);
      expect(counts!.replies).toBe(50);
      expect(counts!.followers).toBe(300);
      expect(counts!.following).toBe(200);
    });

    describe('moderation detection', () => {
      it('should create moderation record for user with moderation tag', async () => {
        const userId = 'user-moderated' as Pubky;
        const moderatedTags: NexusTag[] = [
          {
            label: getModeratedTags()[0],
            taggers: [APP_RUNTIME_DEFAULTS.moderationId],
            taggers_count: 1,
            relationship: true,
          },
        ];

        const mockUser = createMockNexusUser(userId, { tags: moderatedTags });
        await LocalStreamUsersService.persistUsers([mockUser]);

        const moderationRecord = await ModerationModel.findById(userId);
        expect(moderationRecord).toBeTruthy();
        expect(moderationRecord!.type).toBe(ModerationType.PROFILE);
        expect(moderationRecord!.is_blurred).toBe(true);
      });

      it('should not create moderation record for user without moderation tag', async () => {
        const userId = 'user-normal' as Pubky;
        const normalTags: NexusTag[] = [
          {
            label: 'developer',
            taggers: ['tagger-1'],
            taggers_count: 1,
            relationship: true,
          },
        ];

        const mockUser = createMockNexusUser(userId, { tags: normalTags });
        await LocalStreamUsersService.persistUsers([mockUser]);

        const moderationRecord = await ModerationModel.findById(userId);
        expect(moderationRecord).toBeNull();
      });

      it('should not create moderation record when tag has wrong tagger', async () => {
        const userId = 'user-wrong-tagger' as Pubky;
        const tagsWithWrongTagger: NexusTag[] = [
          {
            label: getModeratedTags()[0],
            taggers: ['wrong-tagger-id'],
            taggers_count: 1,
            relationship: true,
          },
        ];

        const mockUser = createMockNexusUser(userId, { tags: tagsWithWrongTagger });
        await LocalStreamUsersService.persistUsers([mockUser]);

        const moderationRecord = await ModerationModel.findById(userId);
        expect(moderationRecord).toBeNull();
      });

      it('should handle mixed moderated and non-moderated users', async () => {
        const moderatedUserId = 'user-moderated' as Pubky;
        const normalUserId = 'user-normal' as Pubky;

        const moderatedUser = createMockNexusUser(moderatedUserId, {
          tags: [
            {
              label: getModeratedTags()[0],
              taggers: [APP_RUNTIME_DEFAULTS.moderationId],
              taggers_count: 1,
              relationship: true,
            },
          ],
        });

        const normalUser = createMockNexusUser(normalUserId, { tags: [] });

        await LocalStreamUsersService.persistUsers([moderatedUser, normalUser]);

        const moderatedRecord = await ModerationModel.findById(moderatedUserId);
        expect(moderatedRecord).toBeTruthy();
        expect(moderatedRecord!.type).toBe(ModerationType.PROFILE);

        const normalRecord = await ModerationModel.findById(normalUserId);
        expect(normalRecord).toBeNull();
      });
    });
  });
});
