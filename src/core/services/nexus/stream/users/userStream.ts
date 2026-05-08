import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import type { NexusUser, NexusUserIdsStream } from '@/services/nexus/nexus.types';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { userStreamApi } from '@/services/nexus/stream/users/userStream.api';
import type {
  TFetchUserStreamParams,
  TUserStreamBase,
  TUserStreamInfluencersParams,
  TUserStreamUsersByIdsParams,
  TUserStreamWithUserIdParams,
} from '@/services/nexus/stream/users/userStream.types';
import { createUserStreamParams } from '@/services/nexus/stream/users/userStream.utils';

/**
 * Nexus User Stream Service
 *
 * Handles fetching user stream data from Nexus API.
 */
export class NexusUserStreamService {
  /**
   * Fetches user IDs from Nexus API user stream endpoint
   *
   * @param streamId - Composite stream identifier (e.g., 'user123:followers', 'influencers:today:all')
   * @param params - Pagination parameters (skip, limit)
   * @returns Array of user IDs
   */
  static async fetch({ streamId, params }: TFetchUserStreamParams): Promise<Pubky[]> {
    const { reach, apiParams } = createUserStreamParams(streamId, params);

    let url: string;

    // Type-safe dispatch - apiParams type is correctly mapped via UserStreamApiParamsMap
    switch (reach) {
      case 'followers':
      case 'following':
      case 'friends':
      case 'muted':
      case 'recommended':
        url = userStreamApi[reach](apiParams as TUserStreamWithUserIdParams);
        break;
      case 'influencers':
        url = userStreamApi.influencers(apiParams as TUserStreamInfluencersParams);
        break;
      case 'most_followed':
        url = userStreamApi.mostFollowed(apiParams as TUserStreamBase);
        break;
      default:
        throw new Error(`Invalid reach type: ${reach}`);
    }

    return await queryNexus<NexusUserIdsStream>({ url });
  }

  /**
   * Fetches full user details for the provided user IDs
   *
   * @param params - User IDs to fetch, optional viewer ID for relationship data
   * @returns Array of full user objects with details, counts, tags, and relationships
   */
  static async fetchByIds(params: TUserStreamUsersByIdsParams): Promise<NexusUser[]> {
    if (params.user_ids.length === 0) {
      return [];
    }
    const { url, body } = userStreamApi.usersByIds(params);
    return await queryNexus<NexusUser[]>({ url, method: HttpMethod.POST, body: JSON.stringify(body) });
  }
}
