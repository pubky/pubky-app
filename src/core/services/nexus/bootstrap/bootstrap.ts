import * as Core from '@/core';
import { Logger } from '@/libs/logger/logger';

/**
 * Nexus Bootstrap Service
 *
 * Handles fetching bootstrap data from Nexus API.
 */
export class NexusBootstrapService {
  /**
   * Retrieves bootstrap data from Nexus API
   *
   * @param pubky - User's public key
   * @returns Bootstrap data (users, posts, streams)
   */
  static async fetch(pubky: Core.Pubky): Promise<Core.NexusBootstrapResponse> {
    const url = Core.bootstrapApi.get(pubky);
    const data = await Core.queryNexus<Core.NexusBootstrapResponse>({ url });
    Logger.debug('Bootstrap data fetched successfully', { data });
    return data;
  }
}
