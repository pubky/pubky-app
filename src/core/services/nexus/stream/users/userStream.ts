import { NEXUS_USERS_BY_IDS_MAX_IDS } from '@/config/nexus';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import type { Pubky } from '@/models/models.types';
import type { NexusUser, NexusUserIdsStream } from '@/services/nexus/nexus.types';
import { getNexusResponseStartedAt, markNexusResponseStartedAt, queryNexus } from '@/services/nexus/nexus.utils';
import { userStreamApi } from '@/services/nexus/stream/users/userStream.api';
import type {
  TFetchUserStreamParams,
  TUserStreamBase,
  TUserStreamInfluencersParams,
  TUserStreamStarterPackParams,
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
      case 'recommended':
        url = userStreamApi[reach](apiParams as TUserStreamWithUserIdParams);
        break;
      case 'influencers':
        url = userStreamApi.influencers(apiParams as TUserStreamInfluencersParams);
        break;
      case 'most_followed':
        url = userStreamApi.mostFollowed(apiParams as TUserStreamBase);
        break;
      case 'starter_pack':
        url = userStreamApi.starterPack(apiParams as TUserStreamStarterPackParams);
        break;
      default: {
        const exhaustiveCheck: never = reach;
        throw Err.validation(
          ValidationErrorCode.INVALID_INPUT,
          `Unsupported user stream source: ${String(exhaustiveCheck)}`,
          {
            service: ErrorService.Nexus,
            operation: 'fetch',
            context: { streamId },
          },
        );
      }
    }

    return await queryNexus<NexusUserIdsStream>({ url });
  }

  /**
   * Fetches full user details for the provided user IDs
   *
   * @param params - User IDs to fetch, optional viewer ID for relationship data
   * @returns Array of full user objects with details, counts, tags, and relationships
   */
  static async fetchByIds({
    force,
    ...params
  }: TUserStreamUsersByIdsParams & { force?: boolean }): Promise<NexusUser[]> {
    if (params.user_ids.length === 0) {
      return [];
    }
    // Canonicalize (sorted user_ids) so identical concurrent batches share one query key and
    // coalesce in the query cache instead of racing the rate-limited by_ids endpoint (PUBKY-APP-B3).
    const sortedIds = [...params.user_ids].sort();
    const fetchSlice = async (user_ids: Pubky[]) => {
      const { url, body } = userStreamApi.usersByIds({ ...params, user_ids });
      return await queryNexus<NexusUser[]>({ url, method: HttpMethod.POST, body: JSON.stringify(body), force });
    };
    // One request returns the response as queryNexus stamped it (see getNexusResponseStartedAt)
    if (sortedIds.length <= NEXUS_USERS_BY_IDS_MAX_IDS) {
      return await fetchSlice(sortedIds);
    }
    // Nexus takes at most NEXUS_USERS_BY_IDS_MAX_IDS ids per request, so a longer list goes in
    // sequential slices; the merged response carries the earliest start time of its parts.
    const users: NexusUser[] = [];
    let startedAt = Infinity;
    for (let start = 0; start < sortedIds.length; start += NEXUS_USERS_BY_IDS_MAX_IDS) {
      const page = await fetchSlice(sortedIds.slice(start, start + NEXUS_USERS_BY_IDS_MAX_IDS));
      startedAt = Math.min(startedAt, getNexusResponseStartedAt(page) ?? 0);
      users.push(...page);
    }
    if (startedAt > 0 && Number.isFinite(startedAt)) {
      markNexusResponseStartedAt(users, startedAt);
    }
    return users;
  }
}
