import { TagNormalizer } from '@/pipes/tag/tag.normalizer';
import type {
  NexusNotification,
  NexusTag,
  NexusTaggers,
  NexusTaggersWire,
  NexusTagWire,
  NexusUserCounts,
  NexusUserDetails,
  TUserId,
} from '@/services/nexus/nexus.types';
import { mapNexusResponse, queryNexus } from '@/services/nexus/nexus.utils';
import type { TQueryNexusParams } from '@/services/nexus/nexus.utils.types';
import { userApi } from '@/services/nexus/user/user.api';
import {
  PROFILE_LOOKUP_NOT_FOUND_RETRIES,
  type TUserDetailsParams,
  type TUserPaginationParams,
  type TUserTaggersParams,
  type TUserTagsParams,
} from '@/services/nexus/user/user.types';

/**
 * Nexus User Service
 *
 * Handles fetching user data from Nexus API.
 */
export class NexusUserService {
  /**
   * Retrieves user data from Nexus API
   *
   * @param pubky - User's public key
   * @returns user data (users, posts, streams)
   */
  static async notifications(params: TUserPaginationParams): Promise<NexusNotification[]> {
    const url = userApi.notifications(params);
    return await queryNexus<NexusNotification[]>({ url });
  }

  /**
   * Retrieves tags for a user from Nexus API
   *
   * @param params - Parameters containing user ID and pagination options
   * @returns Array of tags assigned to the user
   */
  static async tags({ force = false, ...params }: TUserTagsParams & { force?: boolean }): Promise<NexusTag[]> {
    const url = userApi.tags(params);
    const tags = await queryNexus<NexusTagWire[]>({ url, ...(force ? { force: true } : {}) });
    return mapNexusResponse(tags, (tag) => TagNormalizer.fromNexus(tag));
  }

  /**
   * Retrieves taggers for a specific tag label on a user from Nexus API
   *
   * @param params - Parameters containing user ID, label, and pagination options
   * @param params.notFoundRetries - 404 attempts allowed after the first, overriding the shared budget
   * @returns Users who tagged the user with the specified label (`{ users, relationship }`)
   */
  static async taggers({
    notFoundRetries,
    ...params
  }: TUserTaggersParams & Pick<TQueryNexusParams, 'notFoundRetries'>): Promise<NexusTaggers> {
    const url = userApi.taggers(params);
    // Tagger lists revalidate after local mutations or count changes.
    const taggers = await queryNexus<NexusTaggersWire>({ url, staleTime: 0, notFoundRetries });
    return TagNormalizer.fromNexus(taggers);
  }

  /**
   * Retrieves user details from Nexus API.
   *
   * Shared detail consumers retain the indexing retry window. Only a profile page
   * opts into the shorter not-found budget via `profileLookup`.
   *
   * @param params - Parameters containing user ID
   * @returns User details including name, bio, status, image, and links
   */
  static async details({ profileLookup, ...params }: TUserDetailsParams): Promise<NexusUserDetails> {
    const url = userApi.details(params);
    return await queryNexus<NexusUserDetails>({
      url,
      ...(profileLookup ? { notFoundRetries: PROFILE_LOOKUP_NOT_FOUND_RETRIES } : {}),
    });
  }

  /**
   * Retrieves user counts from Nexus API
   *
   * @param params - Parameters containing user ID
   * @returns User counts including followers, following, and friends
   */
  static async counts(params: TUserId): Promise<NexusUserCounts> {
    const url = userApi.counts(params);
    return await queryNexus<NexusUserCounts>({ url });
  }
}
