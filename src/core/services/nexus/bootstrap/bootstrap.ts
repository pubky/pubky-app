import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { bootstrapApi } from '@/services/nexus/bootstrap/bootstrap.api';
import type { NexusBootstrapResponse } from '@/services/nexus/bootstrap/bootstrap.types';
import { fetchNexusNoContent, queryNexus } from '@/services/nexus/nexus.utils';

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

  /**
   * Asks Nexus to ingest a user: resolves their homeserver and starts indexing them.
   * Idempotent server-side (no-op if the user is already known).
   *
   * Best-effort: never rejects. Nexus being down must not block onboarding or
   * sign-in; the indexed:false gate in bootstrap retries on the next sign-in.
   * Errors are already logged by the Err factories.
   *
   * @param pubky - User's public key
   */
  static async ingest(pubky: Pubky): Promise<void> {
    await fetchNexusNoContent({ url: bootstrapApi.ingest(pubky), method: HttpMethod.PUT }).catch(() => {});
  }
}
