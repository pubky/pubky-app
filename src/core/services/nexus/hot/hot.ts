import type { NexusHotTag } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { tagApi } from '@/services/nexus/tag/tag.api';
import type { TTagHotParams } from '@/services/nexus/tag/tag.types';

/**
 * Nexus Hot Service
 *
 * Handles fetching hot/trending tags from Nexus API
 */
export class NexusHotService {
  private constructor() {}

  /**
   * Fetches hot tags from Nexus API
   *
   * @param params - Parameters for fetching hot tags (TTagHotParams with all pagination and reach options)
   * @returns Array of hot tags with metadata
   */
  static async fetch(params: TTagHotParams): Promise<NexusHotTag[]> {
    const url = tagApi.hot(params);
    return await queryNexus<NexusHotTag[]>({ url });
  }
}
