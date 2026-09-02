import { followUriBuilder } from 'pubky-app-specs';
import type {
  TEnsureModerationFollowParams,
  TUserApplicationFollowParams,
  TUserCountsOrFetchResult,
} from '@/application/user/user.types';
import type { TReadProfileParams } from '@/controllers/profile/profile.types';
import type { TPubkyListParams } from '@/controllers/user/user.type';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import type { UserCountsModel } from '@/models/user/counts/userCounts';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import { FollowNormalizer } from '@/pipes/follow/follow.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalFollowService } from '@/services/local/follow/follow';
import { LocalProfileService } from '@/services/local/profile/profile';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { LocalUserTagService } from '@/services/local/tag/user/tag.user';
import { LocalUserService } from '@/services/local/user/user';
import type {
  NexusTag,
  NexusTaggers,
  NexusUserCounts,
  NexusUserDetails,
  NexusUserRelationship,
} from '@/services/nexus/nexus.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
import { NexusUserService } from '@/services/nexus/user/user';
import type { TUserTaggersParams, TUserTagsParams } from '@/services/nexus/user/user.types';

export class UserApplication {
  /**
   * Get user details from local database
   * This is a read-only operation that queries the local cache
   */
  static async getDetails(param: TReadProfileParams): Promise<NexusUserDetails | null> {
    // Try to get from local database first
    // TODO: Throw an error and do not return null
    return await LocalUserService.readDetails(param);
  }

  /**
   * Bulk read multiple user details from local database.
   * Returns a Map for efficient lookup by user ID.
   */
  static async getManyDetails(param: TPubkyListParams): Promise<Map<Pubky, NexusUserDetails>> {
    return await LocalUserService.readBulkDetails(param);
  }

  /**
   * Retrieves user details from local database. If not found, fetches from Nexus API and persists to local database.
   * @param params - Parameters containing user ID
   * @returns Promise resolving to user details or null if not found
   */
  static async getOrFetchDetails({ userId }: TReadProfileParams) {
    const userDetails = await LocalUserService.readDetails({ userId });
    if (userDetails) {
      return userDetails;
    }
    const nexusUserDetails = await NexusUserService.details({ user_id: userId });
    await LocalProfileService.upsertDetails(nexusUserDetails);
    return await LocalUserService.readDetails({ userId });
  }

  /**
   * Fetches user details from Nexus and persists to local database (network-only, no local read).
   * Use instead of `getOrFetchDetails` when the caller already knows the user is not cached
   * (e.g. `useLocalFirstQuery` hook where `useLiveQuery` handles the local read).
   * @param params - Parameters containing user ID
   * @returns Promise resolving to user details or null if not found
   */
  static async fetchDetails({ userId }: TReadProfileParams) {
    const nexusUserDetails = await NexusUserService.details({ user_id: userId });
    await LocalProfileService.upsertDetails(nexusUserDetails);
    return await LocalUserService.readDetails({ userId });
  }

  /**
   * Retrieves a full user entity (details, counts, relationships, tags, TTL, moderation) from local database.
   * If not found locally, fetches from Nexus batch endpoint and persists everything via stream persistence.
   *
   * Preferred over `getOrFetchDetails` / `getOrFetchCounts` when the caller needs the full entity cached.
   *
   * @param params - Parameters containing user ID
   * @returns Promise resolving to user details or null if not found
   */
  static async getOrFetch({ userId }: TReadProfileParams): Promise<NexusUserDetails | null> {
    // 1. Check local cache first
    const localDetails = await LocalUserService.readDetails({ userId });
    if (localDetails) {
      return localDetails;
    }

    // 2. Fetch full user from Nexus batch endpoint
    try {
      const users = await NexusUserStreamService.fetchByIds({ user_ids: [userId] });

      if (!users || users.length === 0) {
        Logger.warn('User not found on Nexus', { userId });
        return null;
      }

      // 3. Persist full user entity (details, counts, relationships, tags, TTL, moderation)
      await LocalStreamUsersService.persistUsers(users);
    } catch (error) {
      Logger.warn('Failed to fetch user from Nexus', { userId, error });
      return null;
    }

    // 4. Return from local cache (now populated)
    return await LocalUserService.readDetails({ userId });
  }

  /**
   * Fetches a full user entity from Nexus batch endpoint and persists locally (network-only, no local read).
   * Use instead of `getOrFetch` when the caller already knows the user is not cached
   * (e.g. `useLocalFirstQuery` hook where `useLiveQuery` handles the local read).
   *
   * @param params - Parameters containing user ID
   * @returns Promise resolving to user details or null if not found on Nexus
   */
  static async fetch({ userId }: TReadProfileParams): Promise<NexusUserDetails | null> {
    try {
      const users = await NexusUserStreamService.fetchByIds({ user_ids: [userId] });

      if (!users || users.length === 0) {
        Logger.warn('User not found on Nexus', { userId });
        return null;
      }

      await LocalStreamUsersService.persistUsers(users);
    } catch (error) {
      Logger.warn('Failed to fetch user from Nexus', { userId, error });
      return null;
    }

    return await LocalUserService.readDetails({ userId });
  }

  /**
   * Retrieves user counts from local database.
   * Local-only read per ADR 0001 (get* methods don't call Nexus).
   * @param params - Parameters containing user ID
   * @returns Promise resolving to the cached row (includes `id`) or null if not found
   */
  static async getCounts({ userId }: TReadProfileParams): Promise<UserCountsModel | null> {
    return await LocalUserService.readCounts({ userId });
  }

  /**
   * Retrieves user counts from local database. If not found, fetches from Nexus API and persists to local database.
   * @param params - Parameters containing user ID
   * @returns Cached row (includes `id`) or Nexus payload or null if unavailable
   */
  static async getOrFetchCounts({ userId }: TReadProfileParams): Promise<TUserCountsOrFetchResult | null> {
    const userCounts = await LocalUserService.readCounts({ userId });
    if (userCounts) {
      return userCounts;
    }

    try {
      const nexusUserCounts = await NexusUserService.counts({ user_id: userId });
      await LocalProfileService.upsertCounts(userId, nexusUserCounts);
      return nexusUserCounts;
    } catch (error) {
      // Return null if user counts cannot be fetched (e.g., user not indexed yet)
      Logger.warn('Failed to fetch user counts from Nexus', { userId, error });
      return null;
    }
  }

  /**
   * Fetches user counts from Nexus and persists to local database (network-only, no local read).
   * Use instead of `getOrFetchCounts` when the caller already knows counts are not cached
   * (e.g. `useLocalFirstQuery` hook where `useLiveQuery` handles the local read).
   * @param params - Parameters containing user ID
   * @returns Promise resolving to user counts or null if fetch fails
   */
  static async fetchCounts({ userId }: TReadProfileParams): Promise<NexusUserCounts | null> {
    try {
      const nexusUserCounts = await NexusUserService.counts({ user_id: userId });
      await LocalProfileService.upsertCounts(userId, nexusUserCounts);
      return nexusUserCounts;
    } catch (error) {
      Logger.warn('Failed to fetch user counts from Nexus', { userId, error });
      return null;
    }
  }

  /**
   * Bulk read multiple user counts from local database.
   * Returns a Map for efficient lookup by user ID.
   */
  static async getManyCounts(param: TPubkyListParams): Promise<Map<Pubky, NexusUserCounts>> {
    return await LocalUserService.readBulkCounts(param);
  }

  /**
   * Get user relationships from local database
   * This is a read-only operation that queries the local cache
   */
  static async getRelationships(params: TReadProfileParams): Promise<NexusUserRelationship | null> {
    // TODO: Throw an error and do not return null
    return await LocalUserService.readRelationships(params);
  }

  /**
   * Bulk read multiple user relationships from local database.
   * Returns a Map for efficient lookup by user ID.
   * @param userIds - Array of user IDs to fetch relationships for
   * @returns Promise resolving to a Map of user ID to relationship data
   */
  static async getManyRelationships(param: TPubkyListParams): Promise<Map<Pubky, UserRelationshipsModelSchema>> {
    return await LocalUserService.readBulkRelationships(param);
  }

  /**
   * Get user tags from local database
   * This is a read-only operation that queries the local cache
   */
  static async getTags(params: TReadProfileParams): Promise<NexusTag[]> {
    return await LocalUserService.readTags(params);
  }

  /**
   * Saves tags for a user to local IndexedDB.
   * @param userId - User ID to save tags for
   * @param tags - Array of tags to save
   */
  static async upsertTags(userId: Pubky, tags: NexusTag[]) {
    await LocalUserService.upsertTags(userId, tags);
  }

  /**
   * Retrieves tags for a user from the nexus service.
   * @param params - Parameters containing user ID and pagination options
   * @returns Promise resolving to an array of tags
   */
  static async fetchTags(params: TUserTagsParams): Promise<NexusTag[]> {
    return await NexusUserService.tags(params);
  }

  /**
   * Handles following or unfollowing a user.
   * Performs local database operations and syncs with the homeserver.
   * @param params - Parameters containing event type, URLs, JSON data, and user IDs
   */
  static async commitFollow({
    eventType,
    followUrl,
    followJson,
    follower,
    followee,
    signal,
  }: TUserApplicationFollowParams) {
    if (signal?.aborted) return;

    if (eventType === HttpMethod.PUT) {
      await LocalFollowService.create({ follower, followee });
    } else if (eventType === HttpMethod.DELETE) {
      await LocalFollowService.delete({ follower, followee });
    }

    if (signal?.aborted) return;

    await HomeserverService.request({ method: eventType, url: followUrl, bodyJson: followJson });
  }

  /**
   * Applies the moderation-bot default follow once per account and bot: skipped when settings already
   * record the configured bot, so a later manual unfollow is never undone. The canonical follow
   * resource makes retries idempotent.
   * @returns The processed bot Pubky when the caller should persist it, otherwise undefined
   */
  static async ensureModerationFollow({
    follower,
    moderationId,
    moderationBot,
    signal,
  }: TEnsureModerationFollowParams): Promise<Pubky | undefined> {
    if (!moderationId || follower === moderationId || signal?.aborted || moderationBot === moderationId) {
      return undefined;
    }

    const { meta, follow } = FollowNormalizer.to({ follower, followee: moderationId });
    const expectedFollowUrl = followUriBuilder(follower, moderationId);
    if (meta.url !== expectedFollowUrl) {
      throw Err.validation(ValidationErrorCode.INVALID_INPUT, 'Follow resource belongs to an unexpected account', {
        service: ErrorService.PubkyAppSpecs,
        operation: 'ensureModerationFollow',
        context: { follower, moderationId, followUrl: meta.url },
      });
    }

    const followExists = await HomeserverService.exists(meta.url);
    if (signal?.aborted) return undefined;

    if (!followExists) {
      await this.commitFollow({
        eventType: HttpMethod.PUT,
        followUrl: meta.url,
        followJson: follow.toJson(),
        follower,
        followee: moderationId,
        signal,
      });
    }

    if (signal?.aborted) return undefined;
    return moderationId;
  }

  /**
   * Retrieves taggers for a specific tag label on a user from the nexus service.
   * @param params - Parameters containing user ID, label, and pagination options
   * @returns Promise resolving to an array of users who tagged the user with the specified label
   */
  static async fetchTaggers(params: TUserTaggersParams): Promise<NexusTaggers[]> {
    return await NexusUserService.taggers(params);
  }

  /**
   * Bulk read multiple user tags with local-first strategy.
   * First reads from local cache, then fetches missing from Nexus API.
   * @param userIds - Array of user IDs to fetch tags for
   * @returns Promise resolving to a Map of user ID to tags array
   */
  static async getManyTagsOrFetch({ userIds }: TPubkyListParams): Promise<Map<Pubky, NexusTag[]>> {
    if (userIds.length === 0) return new Map();

    // 1. Find users without cached tags
    const cacheMissUserIds = await LocalUserTagService.getNotPersistedUserTagsInCache(userIds);

    // 2. Fetch missing from API (parallel requests)
    if (cacheMissUserIds.length > 0) {
      await this.fetchMissingUserTagsFromNexus(cacheMissUserIds);
    }

    // 3. Return all tags from cache (now populated with fetched data)
    return await LocalUserService.readBulkTags({ userIds });
  }

  /**
   * Fetch missing user tags from Nexus API and persist to cache.
   * @param cacheMissUserIds - Array of user IDs that need tags fetched
   */
  private static async fetchMissingUserTagsFromNexus(cacheMissUserIds: Pubky[]) {
    if (cacheMissUserIds.length === 0) return;

    const fetchPromises = cacheMissUserIds.map(async (userId) => {
      try {
        const tags = await NexusUserService.tags({ user_id: userId, skip_tags: 0, limit_tags: 10 });
        await LocalUserService.upsertTags(userId, tags);
      } catch {
        // Silently fail for individual user - they'll just have no tags
      }
    });

    await Promise.all(fetchPromises);
  }
}
