import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { stripPubkyPrefix } from '@/libs/utils/utils';

export class UserController {
  private constructor() {} // Prevent instantiation

  /**
   * Get user details from local database
   * This is a read-only operation that queries the local cache
   */
  static async getDetails(params: Core.TReadProfileParams): Promise<Core.NexusUserDetails | null> {
    return await Core.UserApplication.getDetails(params);
  }

  /**
   * Get multiple user details from local database (bulk operation)
   * This is a read-only operation that queries the local cache
   */
  static async getManyDetails(params: Core.TPubkyListParams): Promise<Map<Core.Pubky, Core.NexusUserDetails>> {
    return await Core.UserApplication.getManyDetails(params);
  }

  /**
   * Get user counts from local database.
   * This is a read-only operation that queries the local cache.
   */
  static async getCounts(params: Core.TReadProfileParams): Promise<Core.UserCountsModel | null> {
    return await Core.UserApplication.getCounts(params);
  }

  /**
   * Get user counts from local database, fetching from Nexus API if not found.
   */
  static async getOrFetchCounts(params: Core.TReadProfileParams): Promise<Core.TUserCountsOrFetchResult | null> {
    return await Core.UserApplication.getOrFetchCounts(params);
  }

  /**
   * Fetch user counts from Nexus and persist locally (network-only, no local read).
   * Use instead of `getOrFetchCounts` when the caller already knows counts are not cached.
   */
  static async fetchCounts(params: Core.TReadProfileParams): Promise<Core.NexusUserCounts | null> {
    return await Core.UserApplication.fetchCounts(params);
  }

  /**
   * Get multiple user counts from local database (bulk operation).
   * This is a read-only operation that queries the local cache.
   */
  static async getManyCounts(params: Core.TPubkyListParams): Promise<Map<Core.Pubky, Core.NexusUserCounts>> {
    return await Core.UserApplication.getManyCounts(params);
  }

  /**
   * Retrieves tags for a user from local IndexedDB.
   * @param userId - User ID to get tags for
   * @returns Promise resolving to an array of tags or empty array if not found
   */
  static async getTags(params: Core.TReadProfileParams): Promise<Core.NexusTag[]> {
    return await Core.UserApplication.getTags(params);
  }

  /**
   * Saves tags for a user to local IndexedDB.
   * @param userId - User ID to save tags for
   * @param tags - Array of tags to save
   */
  static async upsertTags(userId: Core.Pubky, tags: Core.NexusTag[]): Promise<void> {
    await Core.UserApplication.upsertTags(userId, tags);
  }

  /**
   * Fetch tags for a user from the Nexus API
   * @param params - The parameters for fetching tags
   * @returns The tags for the user
   */
  static async fetchTags(params: Core.TUserTagsParams): Promise<Core.NexusTag[]> {
    return await Core.UserApplication.fetchTags(params);
  }

  /**
   * Fetch taggers for a user from the Nexus API
   * @param params - The parameters for fetching taggers
   * @returns The taggers for the user
   */
  static async fetchTaggers(params: Core.TUserTaggersParams): Promise<Core.NexusTaggers[]> {
    return await Core.UserApplication.fetchTaggers(params);
  }

  /**
   * Get user relationships from local database
   * This is a read-only operation that queries the local cache
   */
  static async getRelationships(params: Core.TReadProfileParams): Promise<Core.NexusUserRelationship | null> {
    return await Core.UserApplication.getRelationships(params);
  }

  /**
   * Get multiple user relationships from local database (bulk operation)
   * This is a read-only operation that queries the local cache
   */
  static async getManyRelationships(
    params: Core.TPubkyListParams,
  ): Promise<Map<Core.Pubky, Core.UserRelationshipsModelSchema>> {
    return await Core.UserApplication.getManyRelationships(params);
  }

  /**
   * Get full user entity from local database or fetch from Nexus batch API.
   * Persists details, counts, relationships, tags, TTL, and moderation.
   * Preferred over `getOrFetchDetails` when the caller needs the full entity cached.
   */
  static async getOrFetch(params: Core.TReadProfileParams): Promise<Core.NexusUserDetails | null> {
    return await Core.UserApplication.getOrFetch(params);
  }

  /**
   * Fetch full user entity from Nexus batch API and persist locally (network-only, no local read).
   * Use instead of `getOrFetch` when the caller already knows the user is not cached.
   */
  static async fetch(params: Core.TReadProfileParams): Promise<Core.NexusUserDetails | null> {
    return await Core.UserApplication.fetch(params);
  }

  /**
   * Get user details from local database or fetch from Nexus API
   * This is a read-only operation that queries the local cache
   */
  static async getOrFetchDetails(param: Core.TReadProfileParams): Promise<Core.NexusUserDetails | null> {
    return await Core.UserApplication.getOrFetchDetails(param);
  }

  /**
   * Fetch user details from Nexus and persist locally (network-only, no local read).
   * Use instead of `getOrFetchDetails` when the caller already knows the user is not cached.
   */
  static async fetchDetails(param: Core.TReadProfileParams): Promise<Core.NexusUserDetails | null> {
    return await Core.UserApplication.fetchDetails(param);
  }

  /**
   * Get multiple user tags with local-first strategy (bulk operation)
   * Reads from cache first, fetches from API only for missing users
   */
  static async getManyTagsOrFetch(params: Core.TPubkyListParams): Promise<Map<Core.Pubky, Core.NexusTag[]>> {
    return await Core.UserApplication.getManyTagsOrFetch(params);
  }

  /**
   * Commit a follow action to indexeddb and the homeserver
   * @param eventType - The event type (PUT or DELETE)
   * @param follower - The follower user ID
   * @param followee - The followee user ID
   */
  static async commitFollow(eventType: HttpMethod, { follower, followee }: Core.TFollowParams) {
    // Normalize pubky IDs to ensure consistent format for storage and comparison
    // This strips any prefix (pubky or pk:) to get the raw 52-character key
    const normalizedFollowee = stripPubkyPrefix(followee) as Core.Pubky;
    const { meta, follow } = Core.FollowNormalizer.to({ follower, followee: normalizedFollowee });

    // Get active stream ID from store (controller layer responsibility)
    const activeStreamId = this.getActiveStreamId();

    await Core.UserApplication.commitFollow({
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
  private static getActiveStreamId(): Core.PostStreamTypes | null {
    if (typeof window === 'undefined' || window.location.pathname !== '/home') {
      return null;
    }

    try {
      const homeState = Core.useHomeStore.getState();
      return Core.getStreamId(homeState.sort, homeState.reach, homeState.content);
    } catch (error) {
      Logger.warn('Failed to get active stream ID', { error });
      return null;
    }
  }
}
