import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { stripPubkyPrefix } from '@/libs/utils/utils';
import { UserApplication } from '@/application/user/user';
import type { TUserCountsOrFetchResult } from '@/application/user/user.types';
import type { TReadProfileParams } from '@/controllers/profile/profile.types';
import type { TFollowParams, TPubkyListParams } from '@/controllers/user/user.type';
import type { Pubky } from '@/models/models.types';
import type { PostStreamTypes } from '@/models/stream/post/postStream.types';
import type { UserCountsModel } from '@/models/user/counts/userCounts';
import type { UserRelationshipsModelSchema } from '@/models/user/relationships/userRelationships.schema';
import { FollowNormalizer } from '@/pipes/follow/follow.normalizer';
import type {
  NexusTag,
  NexusTaggers,
  NexusUserCounts,
  NexusUserDetails,
  NexusUserRelationship,
} from '@/services/nexus/nexus.types';
import type { TUserTaggersParams, TUserTagsParams } from '@/services/nexus/user/user.types';
import { useHomeStore } from '@/stores/home/home.store';
import { getStreamId } from '@/stores/home/home.utils';
export class UserController {
  private constructor() {} // Prevent instantiation

  /**
   * Get user details from local database
   * This is a read-only operation that queries the local cache
   */
  static async getDetails(params: TReadProfileParams): Promise<NexusUserDetails | null> {
    return await UserApplication.getDetails(params);
  }

  /**
   * Get multiple user details from local database (bulk operation)
   * This is a read-only operation that queries the local cache
   */
  static async getManyDetails(params: TPubkyListParams): Promise<Map<Pubky, NexusUserDetails>> {
    return await UserApplication.getManyDetails(params);
  }

  /**
   * Get user counts from local database.
   * This is a read-only operation that queries the local cache.
   */
  static async getCounts(params: TReadProfileParams): Promise<UserCountsModel | null> {
    return await UserApplication.getCounts(params);
  }

  /**
   * Get user counts from local database, fetching from Nexus API if not found.
   */
  static async getOrFetchCounts(params: TReadProfileParams): Promise<TUserCountsOrFetchResult | null> {
    return await UserApplication.getOrFetchCounts(params);
  }

  /**
   * Fetch user counts from Nexus and persist locally (network-only, no local read).
   * Use instead of `getOrFetchCounts` when the caller already knows counts are not cached.
   */
  static async fetchCounts(params: TReadProfileParams): Promise<NexusUserCounts | null> {
    return await UserApplication.fetchCounts(params);
  }

  /**
   * Get multiple user counts from local database (bulk operation).
   * This is a read-only operation that queries the local cache.
   */
  static async getManyCounts(params: TPubkyListParams): Promise<Map<Pubky, NexusUserCounts>> {
    return await UserApplication.getManyCounts(params);
  }

  /**
   * Retrieves tags for a user from local IndexedDB.
   * @param userId - User ID to get tags for
   * @returns Promise resolving to an array of tags or empty array if not found
   */
  static async getTags(params: TReadProfileParams): Promise<NexusTag[]> {
    return await UserApplication.getTags(params);
  }

  /**
   * Saves tags for a user to local IndexedDB.
   * @param userId - User ID to save tags for
   * @param tags - Array of tags to save
   */
  static async upsertTags(userId: Pubky, tags: NexusTag[]): Promise<void> {
    await UserApplication.upsertTags(userId, tags);
  }

  /**
   * Fetch tags for a user from the Nexus API
   * @param params - The parameters for fetching tags
   * @returns The tags for the user
   */
  static async fetchTags(params: TUserTagsParams): Promise<NexusTag[]> {
    return await UserApplication.fetchTags(params);
  }

  /**
   * Fetch taggers for a user from the Nexus API
   * @param params - The parameters for fetching taggers
   * @returns The taggers for the user
   */
  static async fetchTaggers(params: TUserTaggersParams): Promise<NexusTaggers[]> {
    return await UserApplication.fetchTaggers(params);
  }

  /**
   * Get user relationships from local database
   * This is a read-only operation that queries the local cache
   */
  static async getRelationships(params: TReadProfileParams): Promise<NexusUserRelationship | null> {
    return await UserApplication.getRelationships(params);
  }

  /**
   * Get multiple user relationships from local database (bulk operation)
   * This is a read-only operation that queries the local cache
   */
  static async getManyRelationships(params: TPubkyListParams): Promise<Map<Pubky, UserRelationshipsModelSchema>> {
    return await UserApplication.getManyRelationships(params);
  }

  /**
   * Get full user entity from local database or fetch from Nexus batch API.
   * Persists details, counts, relationships, tags, TTL, and moderation.
   * Preferred over `getOrFetchDetails` when the caller needs the full entity cached.
   */
  static async getOrFetch(params: TReadProfileParams): Promise<NexusUserDetails | null> {
    return await UserApplication.getOrFetch(params);
  }

  /**
   * Fetch full user entity from Nexus batch API and persist locally (network-only, no local read).
   * Use instead of `getOrFetch` when the caller already knows the user is not cached.
   */
  static async fetch(params: TReadProfileParams): Promise<NexusUserDetails | null> {
    return await UserApplication.fetch(params);
  }

  /**
   * Get user details from local database or fetch from Nexus API
   * This is a read-only operation that queries the local cache
   */
  static async getOrFetchDetails(param: TReadProfileParams): Promise<NexusUserDetails | null> {
    return await UserApplication.getOrFetchDetails(param);
  }

  /**
   * Fetch user details from Nexus and persist locally (network-only, no local read).
   * Use instead of `getOrFetchDetails` when the caller already knows the user is not cached.
   */
  static async fetchDetails(param: TReadProfileParams): Promise<NexusUserDetails | null> {
    return await UserApplication.fetchDetails(param);
  }

  /**
   * Get multiple user tags with local-first strategy (bulk operation)
   * Reads from cache first, fetches from API only for missing users
   */
  static async getManyTagsOrFetch(params: TPubkyListParams): Promise<Map<Pubky, NexusTag[]>> {
    return await UserApplication.getManyTagsOrFetch(params);
  }

  /**
   * Commit a follow action to indexeddb and the homeserver
   * @param eventType - The event type (PUT or DELETE)
   * @param follower - The follower user ID
   * @param followee - The followee user ID
   */
  static async commitFollow(eventType: HttpMethod, { follower, followee }: TFollowParams) {
    // Normalize pubky IDs to ensure consistent format for storage and comparison
    // This strips any prefix (pubky or pk:) to get the raw 52-character key
    const normalizedFollowee = stripPubkyPrefix(followee) as Pubky;
    const { meta, follow } = FollowNormalizer.to({ follower, followee: normalizedFollowee });

    // Get active stream ID from store (controller layer responsibility)
    const activeStreamId = this.getActiveStreamId();

    await UserApplication.commitFollow({
      eventType,
      followUrl: meta.url,
      followJson: follow.toJson(),
      follower,
      followee: normalizedFollowee,
      activeStreamId,
    });
  }

  /**
   * Gets the currently active stream ID from the home store if on /home route.
   * This is a controller responsibility - controllers can access UI state stores.
   *
   * @returns The active stream ID, or null if not on /home route or if retrieval fails
   */
  private static getActiveStreamId(): PostStreamTypes | null {
    if (typeof window === 'undefined' || window.location.pathname !== '/home') {
      return null;
    }

    try {
      const homeState = useHomeStore.getState();
      return getStreamId(homeState.sort, homeState.reach, homeState.content);
    } catch (error) {
      Logger.warn('Failed to get active stream ID', { error });
      return null;
    }
  }
}
