import { UserStreamApplication } from '@/application/stream/users/users';
import { Logger } from '@/libs/logger/logger';
import { buildHotTagsId } from '@/models/hot/hot.helper';
import { LocalHotService } from '@/services/local/hot/hot';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import { NexusHotService } from '@/services/nexus/hot/hot';
import { type NexusHotTag, UserStreamTimeframe } from '@/services/nexus/nexus.types';
import type { TTagHotParams } from '@/services/nexus/tag/tag.types';

const TOP_TAGS_TO_FETCH_USERS = 3;

export class HotApplication {
  private constructor() {}

  /**
   * Get or fetch hot tags with cache-first strategy
   *
   * 1. Build stream ID from timeframe and reach parameters
   * 2. Check local cache first (skip if pagination)
   * 3. Return cached data immediately if found
   * 4. Fetch from Nexus API on cache miss
   * 5. Store fetched data in IndexedDB for future requests
   * 6. Fetch missing tagger user details in background
   *
   * @param params - Parameters for fetching hot tags (includes reach, timeframe, skip, limit)
   * @returns Array of hot tags
   */
  static async getOrFetch(params: TTagHotParams): Promise<NexusHotTag[]> {
    try {
      // Build composite ID from params: timeframe:reach
      const timeframe = params.timeframe || UserStreamTimeframe.THIS_MONTH;
      const reach = params.reach || 'all';

      const id = buildHotTagsId(timeframe, reach);

      // Skip cache for pagination
      if (params.skip && params.skip > 0) {
        Logger.debug('Fetching hot tags from Nexus (pagination)', { id, skip: params.skip });
        const tags = await NexusHotService.fetch(params);

        // Fetch missing tagger users
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);

        return tags;
      }

      // Check cache first
      const cached = await LocalHotService.findById(id);

      if (cached && cached.tags.length > 0) {
        Logger.debug('Hot tags cache hit', { id, count: cached.tags.length });

        // Apply limit if specified
        const tags = params.limit ? cached.tags.slice(0, params.limit) : cached.tags;

        // Optionally refresh cache in background (fire and forget)
        this.refreshCacheInBackground(id, params);

        // Fetch missing tagger users
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);

        return tags;
      }

      // Cache miss - fetch from Nexus without limit so the full tag set is cached.
      // This prevents cache pollution when multiple consumers with different limits
      // share the same cache entry (e.g., HotTagsCardsSection with limit=5 vs HotTagsOverview with limit=50).
      Logger.debug('Hot tags cache miss, fetching from Nexus', { id });
      const { limit, ...fetchParams } = params;
      const tags = await NexusHotService.fetch(fetchParams);

      if (tags.length > 0) {
        // Fetch and persist users first, then persist hot tags.
        // This prevents excessive rerender where liveQuery triggers before users are cached
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);
        await LocalHotService.upsert(id, tags);
      }

      // Apply caller's limit only on return, not on what gets cached
      return limit ? tags.slice(0, limit) : tags;
    } catch (error) {
      Logger.error('Error in HotApplication.getOrFetch:', error);
      return [];
    }
  }

  /**
   * Refreshes cache in background without blocking the response
   * This ensures users get cached data quickly while keeping cache fresh
   * Persists users first, then hot tags to prevent race conditions
   *
   * @private
   * @param id - Composite ID (timeframe:reach)
   * @param params - Parameters for fetching hot tags
   */
  private static async refreshCacheInBackground(id: string, params: TTagHotParams) {
    try {
      // Strip limit so the full tag set is fetched and cached, preventing cache pollution
      // when different consumers request different limits for the same cache entry.
      const { limit: _limit, ...fetchParams } = params;

      // Fetch and persist users first, then persist hot tags (blocking within this background task)
      // This prevents excessive rerender where liveQuery triggers before users are cached
      const tags = await NexusHotService.fetch(fetchParams);
      if (tags.length > 0) {
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);
        await LocalHotService.upsert(id, tags);
      }
    } catch (error) {
      Logger.error('Failed to refresh cache in background', { id, error });
    }
  }

  /**
   * Fetches missing tagger user details in background
   * Only fetches taggers for the top 3 most scored tags (used for featured cards display).
   * Tags are already sorted by score from Nexus API.
   *
   * @private
   * @param tags - Array of hot tags containing tagger IDs (sorted by score)
   * @param userId - Optional user ID for relationship data
   */
  private static async fetchUsersForTags(tags: NexusHotTag[], userId?: string) {
    // Extract all unique tagger IDs from tags
    const allTaggerIds = [...new Set(tags.flatMap((tag) => tag.taggers_id))];
    if (allTaggerIds.length === 0) {
      return;
    }

    // Check which users are not already in cache
    const cacheMissUserIds = await LocalStreamUsersService.getNotPersistedUsersInCache(allTaggerIds);
    if (cacheMissUserIds.length === 0) {
      return;
    }

    // Fetch only missing users
    await UserStreamApplication.fetchMissingUsersFromNexus({
      cacheMissUserIds,
      viewerId: userId,
    });
  }
}
