import { HotApplication } from '@/application/hot/hot';
import type { NexusHotTag } from '@/services/nexus/nexus.types';
import type { TTagHotParams } from '@/services/nexus/tag/tag.types';
import { useAuthStore } from '@/stores/auth/auth.store';

export class HotController {
  private constructor() {} // Prevent instantiation

  /**
   * Get or fetch hot/trending tags based on reach and timeframe
   * @param params - Parameters object
   * @param params.reach - Reach filter (followers, following, friends, wot)
   * @param params.timeframe - Time period (today, this_week, this_month, all_time)
   * @param params.limit - Maximum number of tags to return
   * @param params.skip - Number of tags to skip
   * @param params.user_id - Optional user ID for personalized results
   * @param params.taggers_limit - Limit for taggers array in response
   * @returns Array of hot tags with metadata
   */
  static async getOrFetch(params: TTagHotParams): Promise<NexusHotTag[]> {
    const viewerId = useAuthStore.getState().currentUserPubky;

    // API requires user_id and reach to be provided together; the viewer is always forwarded
    // separately so tagger profiles are persisted with viewer-relative follow state (#1803).
    if (params.reach && !params.user_id && viewerId) {
      return await HotApplication.getOrFetch({ ...params, user_id: viewerId, viewerId });
    }
    return await HotApplication.getOrFetch({ ...params, viewerId });
  }
}
