import { Env } from '@/libs/env/env';
import type { TReadProfileParams } from '@/controllers/profile/profile.types';
import type { TPubkyListParams } from '@/controllers/user/user.type';
import type { Pubky } from '@/models/models.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import type { TUserCountsParams } from '@/models/user/counts/userCounts.types';
import { UserDetailsModel } from '@/models/user/details/userDetails';
import { UserRelationshipsModel } from '@/models/user/relationships/userRelationships';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import { UserTagsModel } from '@/models/user/tags/userTags';
import { UserTtlModel } from '@/models/user/ttl/userTtl';
import type { NexusTag, NexusUserCounts, NexusUserDetails, NexusUserRelationship } from '@/services/nexus/nexus.types';
export class LocalUserService {
  private constructor() {} // Prevent instantiation

  /**
   * Reads user details from local database.
   * @param userId - User ID to read details for
   * @returns Promise resolving to user details or null if not found
   */
  static async readDetails({ userId }: TReadProfileParams): Promise<NexusUserDetails | null> {
    return await UserDetailsModel.findById(userId);
  }

  /**
   * Bulk reads multiple user details from local database.
   * @param userIds - Array of user IDs to read details for
   * @returns Promise resolving to Map of user ID to user details
   */
  static async readBulkDetails({ userIds }: TPubkyListParams): Promise<Map<Pubky, NexusUserDetails>> {
    if (userIds.length === 0) return new Map();

    const results = await UserDetailsModel.findByIdsPreserveOrder(userIds);
    const map = new Map<Pubky, NexusUserDetails>();

    for (const details of results) {
      if (details) {
        map.set(details.id, details);
      }
    }

    return map;
  }

  /**
   * Reads user counts from local database.
   * @param userId - The user ID to read counts for
   * @returns Promise resolving to the stored row (including `id`) or null if not found
   */
  static async readCounts({ userId }: TReadProfileParams): Promise<UserCountsModel | null> {
    return await UserCountsModel.findById(userId);
  }

  /**
   * Upserts user counts into local database.
   * Creates a new record if it doesn't exist, or replaces it if it does.
   * @param params - Parameters containing user ID
   * @param userCounts - The user counts to upsert
   * @returns Promise resolving to void
   */
  static async upsertCounts(params: TReadProfileParams, userCounts: NexusUserCounts): Promise<void> {
    // Use proper upsert (put) to create the record if it doesn't exist
    await UserCountsModel.upsert({
      id: params.userId,
      ...userCounts,
    });
  }

  /**
   * Updates user counts in local database by applying count changes.
   * @param params - Parameters containing user ID and count changes
   * @returns Promise resolving to void
   */
  static async updateCounts(params: TUserCountsParams): Promise<void> {
    await UserCountsModel.updateCounts(params);
  }

  /**
   * Bulk reads multiple user counts from local database.
   * @param userIds - Array of user IDs to read counts for
   * @returns Promise resolving to Map of user ID to user counts
   */
  static async readBulkCounts({ userIds }: TPubkyListParams): Promise<Map<Pubky, NexusUserCounts>> {
    if (userIds.length === 0) return new Map();

    const results = await UserCountsModel.findByIdsPreserveOrder(userIds);
    const map = new Map<Pubky, NexusUserCounts>();

    for (const counts of results) {
      if (counts) {
        map.set(counts.id, counts);
      }
    }

    return map;
  }

  /**
   * Reads user relationships from local database.
   * @param userId - User ID to read relationships for
   * @returns Promise resolving to user relationships or null if not found
   */
  static async readRelationships({ userId }: TReadProfileParams): Promise<NexusUserRelationship | null> {
    return await UserRelationshipsModel.findById(userId);
  }

  /**
   * Bulk reads multiple user relationships from local database.
   * @param userIds - Array of user IDs to read relationships for
   * @returns Promise resolving to Map of user ID to user relationships
   */
  static async readBulkRelationships({ userIds }: TPubkyListParams): Promise<Map<Pubky, UserRelationshipsModelSchema>> {
    if (userIds.length === 0) return new Map();

    const results = await UserRelationshipsModel.findByIds(userIds);
    const map = new Map<Pubky, UserRelationshipsModelSchema>();

    for (const relationship of results) {
      if (relationship) {
        map.set(relationship.id, relationship);
      }
    }

    return map;
  }

  /**
   * Reads tags for a single user from local database.
   * @param userId - User ID to read tags for
   * @returns Promise resolving to array of tags or empty array if not found
   */
  static async readTags({ userId }: TReadProfileParams): Promise<NexusTag[]> {
    const userTags = await UserTagsModel.findById(userId);
    return userTags?.tags ?? [];
  }

  /**
   * Bulk reads multiple user tags from local database.
   * @param userIds - Array of user IDs to read tags for
   * @returns Promise resolving to Map of user ID to user tags
   */
  static async readBulkTags({ userIds }: TPubkyListParams): Promise<Map<Pubky, NexusTag[]>> {
    if (userIds.length === 0) return new Map();

    const results = await UserTagsModel.findByIdsPreserveOrder(userIds);
    const map = new Map<Pubky, NexusTag[]>();

    for (const tagsData of results) {
      if (tagsData) {
        map.set(tagsData.id, tagsData.tags);
      }
    }

    return map;
  }

  /**
   * Upserts user tags into local database.
   * Creates a new record if it doesn't exist, or replaces it if it does.
   * @param userId - The user ID
   * @param tags - The user tags to upsert
   * @returns Promise resolving to void
   */
  static async upsertTags(userId: Pubky, tags: NexusTag[]): Promise<void> {
    await UserTagsModel.upsert({ id: userId, tags });
  }

  /**
   * Upserts user TTL record with a calculated timestamp for delayed refresh.
   * Used to schedule refresh for users not yet indexed in Nexus.
   *
   * The timestamp is calculated as: now - (userTtlMs - retryDelayMs)
   * This ensures the entity becomes stale after the specified delay.
   *
   * @param userId - The user ID
   * @param retryDelayMs - Delay in milliseconds before the entity should become stale.
   *   If retryDelayMs >= NEXT_PUBLIC_TTL_USER_MS, the entity becomes immediately stale
   *   (triggers immediate refresh on next TTL coordinator tick). This is intentional
   *   and can be useful for forcing immediate refresh.
   * @returns Promise resolving to void
   */
  static async upsertTtlWithDelay(userId: Pubky, retryDelayMs: number): Promise<void> {
    const lastUpdatedAt = Date.now() - (Env.NEXT_PUBLIC_TTL_USER_MS - retryDelayMs);
    await UserTtlModel.upsert({ id: userId, lastUpdatedAt });
  }
}
