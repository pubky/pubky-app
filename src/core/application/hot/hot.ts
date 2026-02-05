import * as Core from '@/core';
import * as Libs from '@/libs';

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
  static async getOrFetch(params: Core.TTagHotParams): Promise<Core.NexusHotTag[]> {
    try {
      // Build composite ID from params: timeframe:reach
      const timeframe = params.timeframe || Core.UserStreamTimeframe.THIS_MONTH;
      const reach = params.reach || 'all';

      const id = Core.buildHotTagsId(timeframe, reach);

      // Skip cache for pagination
      if (params.skip && params.skip > 0) {
        Libs.Logger.debug('Fetching hot tags from Nexus (pagination)', { id, skip: params.skip });
        const tags = await Core.NexusHotService.fetch(params);

        // Fetch missing tagger users
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);

        return tags;
      }

      // Check cache first
      const cached = await Core.LocalHotService.findById(id);

      if (cached && cached.tags.length > 0) {
        Libs.Logger.debug('Hot tags cache hit', { id, count: cached.tags.length });

        // Apply limit if specified
        const tags = params.limit ? cached.tags.slice(0, params.limit) : cached.tags;

        // Optionally refresh cache in background (fire and forget)
        this.refreshCacheInBackground(id, params);

        // Fetch missing tagger users
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);

        return tags;
      }

      // Cache miss - fetch from Nexus
      Libs.Logger.debug('Hot tags cache miss, fetching from Nexus', { id });
      const tags = await Core.NexusHotService.fetch(params);

      if (tags.length > 0) {
        // Fetch and persist users first, then persist hot tags.
        // This prevents excessive rerender where liveQuery triggers before users are cached
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);
        await Core.LocalHotService.upsert(id, tags);
      }

      return tags;
    } catch (error) {
      Libs.Logger.error('Error in HotApplication.getOrFetch:', error);
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
  private static async refreshCacheInBackground(id: string, params: Core.TTagHotParams) {
    try {
      // Fetch and persist users first, then persist hot tags (blocking within this background task)
      // This prevents excessive rerender where liveQuery triggers before users are cached
      const tags = await Core.NexusHotService.fetch(params);
      if (tags.length > 0) {
        await this.fetchUsersForTags(tags.slice(0, TOP_TAGS_TO_FETCH_USERS), params.user_id);
        await Core.LocalHotService.upsert(id, tags);
      }
    } catch (error) {
      Libs.Logger.error('Failed to refresh cache in background', { id, error });
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
  private static async fetchUsersForTags(tags: Core.NexusHotTag[], userId?: string) {
    // Extract all unique tagger IDs from tags
    const allTaggerIds = [...new Set(tags.flatMap((tag) => tag.taggers_id))];
    if (allTaggerIds.length === 0) {
      return;
    }

    // Check which users are not already in cache
    const cacheMissUserIds = await Core.LocalStreamUsersService.getNotPersistedUsersInCache(allTaggerIds);
    if (cacheMissUserIds.length === 0) {
      return;
    }

    // Fetch only missing users
    await Core.UserStreamApplication.fetchMissingUsersFromNexus({
      cacheMissUserIds,
      viewerId: userId,
    });
  }
}
