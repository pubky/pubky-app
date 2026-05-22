import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { bootstrapApi } from '@/services/nexus/bootstrap/bootstrap.api';
import type { NexusBootstrapResponse } from '@/services/nexus/bootstrap/bootstrap.types';
import { queryNexus } from '@/services/nexus/nexus.utils';

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
  static async fetch(pubky: Pubky): Promise<NexusBootstrapResponse> {
    const url = bootstrapApi.get(pubky);
    const data = await queryNexus<NexusBootstrapResponse>({ url });
    Logger.debug('Bootstrap data fetched successfully', { data });
    return data;
  }
}
