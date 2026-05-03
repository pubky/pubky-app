import { NEXUS_USERS_PER_PAGE } from '@/config/nexus';
import { Logger } from '@/libs/logger/logger';
import type {
  TFetchStreamFromNexusParams,
  TFetchUserStreamChunkParams,
  TGetOrFetchUsersParams,
  TMissingUsersParams,
  TUserStreamChunkResponse,
} from '@/application/stream/users/users.types';
import type { Pubky } from '@/models/models.types';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { TCacheUserStreamParams } from '@/services/local/stream/users/users.types';
import { NexusUserStreamService } from '@/services/nexus/stream/users/userStream';
/**
 * Internal type for fetchStreamFromNexus parameters
 * Extends the internal fetch params type with optional cached stream data
 */

/**
 * User Stream Application
 *
 * Manages user stream data flow between Nexus API and local cache.
 * Handles followers, following, friends, and other user stream types with cache-first strategy.
 */
export class UserStreamApplication {
  private constructor() {}

  /**
   * Get or fetch a slice of a user stream (followers, following, friends, etc.)
   * Uses cache-first strategy with fallback to Nexus API
   *
   * @param streamId - User stream identifier (e.g., 'user123:followers', 'influencers:today:all')
   * @param skip - Number of users to skip (for pagination)
   * @param limit - Number of users to return
   * @param viewerId - The current authenticated user (for relationship data)
   * @returns Next page of user IDs, cache miss IDs, and pagination offset
   */
  static async getOrFetchStreamSlice({
    streamId,
    skip,
    limit,
    viewerId,
  }: TFetchUserStreamChunkParams): Promise<TUserStreamChunkResponse> {
    // Try cache first
    const cachedStream = await LocalStreamUsersService.findById(streamId);
    if (cachedStream) {
      const nextPageIds = this.getStreamFromCache({ skip, limit, cachedStream });
      if (nextPageIds) {
        // Cache hit - return undefined skip to signal cache source
        return { nextPageIds, cacheMissUserIds: [], skip: undefined };
      }
    }

    // Cache miss - fetch from Nexus
    return await this.fetchStreamFromNexus({ streamId, skip, limit, viewerId, cachedStream });
  }

  /**
   * Fetch missing user details from Nexus
   * Called in background to populate cache with full user data
   *
   * @param cacheMissUserIds - Array of user IDs that need to be fetched
   * @param viewerId - Optional viewer ID for relationship data
   */
  static async fetchMissingUsersFromNexus({ cacheMissUserIds, viewerId }: TMissingUsersParams): Promise<void> {
    if (cacheMissUserIds.length === 0) {
      return;
    }

    try {
      const userBatch = await NexusUserStreamService.fetchByIds({
        user_ids: cacheMissUserIds,
        viewer_id: viewerId,
      });
      await LocalStreamUsersService.persistUsers(userBatch);
    } catch (error) {
      Logger.warn('Failed to fetch missing users from Nexus:', { error });
    }
  }

  /**
   * Fetches user IDs from Nexus API and persists stream to cache
   * Returns IDs and identifies which users need full details fetched
   *
   * @private
   */
  private static async fetchStreamFromNexus({
    streamId,
    skip = 0,
    limit = NEXUS_USERS_PER_PAGE,
    viewerId,
    cachedStream,
  }: TFetchStreamFromNexusParams): Promise<TUserStreamChunkResponse> {
    // Fetch user IDs from Nexus
    const userIds = await NexusUserStreamService.fetch({
      streamId,
      params: { skip, limit, viewer_id: viewerId },
    });

    // Handle empty response
    if (userIds.length === 0) {
      return { nextPageIds: [], cacheMissUserIds: [], skip: undefined };
    }

    // Upsert stream (append to existing or create new)
    let stream = userIds;
    if (cachedStream) {
      // Filter out duplicates before appending
      const newUserIds = userIds.filter((id) => !cachedStream.stream.includes(id));
      stream = [...cachedStream.stream, ...newUserIds];
    }
    await LocalStreamUsersService.upsert({ streamId, stream });

    // Identify users missing from cache that need full details fetched
    const cacheMissUserIds = await this.getNotPersistedUsersInCache(userIds);

    // Calculate next skip value for pagination
    const nextSkip = skip + userIds.length;

    return { nextPageIds: userIds, cacheMissUserIds, skip: nextSkip };
  }

  /**
   * Get user stream slice from cache
   * Returns null if cache doesn't have sufficient data
   *
   * @private
   */
  private static getStreamFromCache({ skip = 0, limit, cachedStream }: TCacheUserStreamParams): Pubky[] | null {
    // Check if cache has enough data for the requested range
    const endIndex = skip + limit;
    if (cachedStream.stream.length >= endIndex) {
      return cachedStream.stream.slice(skip, endIndex);
    }

    // Not enough data in cache
    return null;
  }

  /**
   * Ensures user details are available in cache for the given IDs.
   * Checks which users are missing from IndexedDB and fetches them from Nexus.
   *
   * @param userIds - Array of user IDs to ensure are cached
   * @param viewerId - Optional viewer ID for relationship data
   */
  static async getOrFetchUsers({ userIds, viewerId }: TGetOrFetchUsersParams): Promise<void> {
    if (userIds.length === 0) return;

    const cacheMissUserIds = await this.getNotPersistedUsersInCache(userIds);
    if (cacheMissUserIds.length === 0) return;

    await this.fetchMissingUsersFromNexus({ cacheMissUserIds, viewerId });
  }

  /**
   * Find which users are not yet persisted in cache
   * Used to identify missing user data that needs to be fetched
   *
   * @private
   */
  private static async getNotPersistedUsersInCache(userIds: Pubky[]): Promise<Pubky[]> {
    return await LocalStreamUsersService.getNotPersistedUsersInCache(userIds);
  }
}
