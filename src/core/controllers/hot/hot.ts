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
    // API requires user_id and reach to be provided together
    if (params.reach && !params.user_id) {
      const currentUserPubky = useAuthStore.getState().currentUserPubky;
      if (currentUserPubky) {
        return await HotApplication.getOrFetch({ ...params, user_id: currentUserPubky });
      }
    }
    return await HotApplication.getOrFetch(params);
  }
}
