import { detectModerationFromTags } from '@/application/moderation/moderation.utils';
import type { Pubky } from '@/models/models.types';
import { ModerationModel } from '@/models/moderation/moderation';
import { ModerationType, type ModerationModelSchema } from '@/models/moderation/moderation.schema';
import type { NexusModelTuple } from '@/models/shared/base/tuple/baseTuple.type';
import { UserStreamModel } from '@/models/stream/user/userStream';
import type { UserStreamId } from '@/models/stream/user/userStream.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import type { UserDetailsModelSchema } from '@/models/user/details/userDetails.schema';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import type { TUserStreamUpsertParams } from '@/services/local/stream/users/users.types';
import type { NexusTag, NexusUser, NexusUserCounts, NexusUserRelationship } from '@/services/nexus/nexus.types';
/**
 * Local Stream Users Service
 *
 * Simple service to manage user stream IDs in IndexedDB.
 * Only stores arrays of user IDs (Pubky), no user data.
 * Handles followers, following, friends, and other user stream types.
 */
export class LocalStreamUsersService {
  private constructor() {}

  /**
   * Save or update a stream of user IDs
   * @param streamId - Composite ID in format 'userId:streamType' (e.g., 'user-ABC:followers')
   */
  static async upsert({ streamId, stream }: TUserStreamUpsertParams): Promise<void> {
    await UserStreamModel.upsert(streamId, stream);
  }

  /**
   * Get a stream of user IDs by stream ID
   * @param streamId - Composite ID in format 'userId:streamType' (e.g., 'user-ABC:followers')
   */
  static async findById(streamId: string): Promise<{ stream: Pubky[] } | null> {
    return await UserStreamModel.findById(streamId);
  }

  /**
   * Delete a user stream from cache
   * @param streamId - Composite ID in format 'userId:streamType' (e.g., 'user-ABC:followers')
   */
  static async deleteById(streamId: string): Promise<void> {
    await UserStreamModel.deleteById(streamId);
  }

  /**
   * Prepend user ID(s) to a stream
   * Only adds users if not already present
   *
   * @param streamId - The stream to prepend to
   * @param userIds - The user ID(s) to prepend
   */
  static async prependToStream(streamId: UserStreamId, userIds: Pubky[]): Promise<void> {
    await UserStreamModel.prependItems(streamId, userIds);
  }

  /**
   * Remove user ID(s) from a stream
   *
   * @param streamId - The stream to remove from
   * @param userIds - The user ID(s) to remove
   */
  static async removeFromStream(streamId: UserStreamId, userIds: Pubky[]): Promise<void> {
    await UserStreamModel.removeItems(streamId, userIds);
  }

  /**
   * Find which users are not yet persisted in cache
   * Used to identify missing user data that needs to be fetched
   *
   * @param userIds - Array of user IDs to check
   * @returns Array of user IDs that are not persisted in cache
   */
  static async getNotPersistedUsersInCache(userIds: Pubky[]): Promise<Pubky[]> {
    const existingUserIds = await UserDetailsModel.findByIdsPreserveOrder(userIds);
    return userIds.filter((_userId, index) => existingUserIds[index] === undefined);
  }

  /**
   * Persist user data to normalized tables
   * Separates user details, counts, tags, relationships, and TTL records
   * Also detects and persists moderation status for flagged profiles
   *
   * @param users - Array of users from Nexus API
   * @returns Array of user IDs (Pubky)
   */
  static async persistUsers(users: NexusUser[]): Promise<Pubky[]> {
    const userCounts: NexusModelTuple<NexusUserCounts>[] = [];
    const userRelationships: NexusModelTuple<NexusUserRelationship>[] = [];
    const userTags: NexusModelTuple<NexusTag[]>[] = [];
    const userDetails: UserDetailsModelSchema[] = [];
    const userModerations: ModerationModelSchema[] = [];
    const userTtl: NexusModelTuple<{ lastUpdatedAt: number }>[] = [];

    const userIds: Pubky[] = [];
    const now = Date.now();

    for (const user of users) {
      const userId = user.details.id;
      userIds.push(userId);
      userCounts.push([userId, user.counts]);
      userRelationships.push([userId, user.relationship]);
      userTags.push([userId, user.tags]);
      userDetails.push(user.details);
      userTtl.push([userId, { lastUpdatedAt: now }]);

      // Detect moderation from user tags
      const isModerated = detectModerationFromTags(user.tags);
      if (isModerated) {
        userModerations.push({
          id: userId,
          type: ModerationType.PROFILE,
          is_blurred: true,
          created_at: Date.now(),
        });
      }
    }

    // Bulk save to normalized tables
    await Promise.all([
      UserDetailsModel.bulkSave(userDetails),
      UserCountsModel.bulkSave(userCounts),
      UserTagsModel.bulkSave(userTags),
      UserRelationshipsModel.bulkSave(userRelationships),
      UserTtlModel.bulkSave(userTtl),
      // Persist moderation records for flagged profiles
      userModerations.length > 0 ? ModerationModel.bulkSave(userModerations) : Promise.resolve(),
    ]);

    return userIds;
  }
}
