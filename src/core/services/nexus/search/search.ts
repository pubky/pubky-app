import { queryNexus } from '@/services/nexus/nexus.utils';
import { searchApi } from '@/services/nexus/search/search.api';
import type {
  TPrefixSearchParams,
  TSearchResult,
  TUsersByTagsFetchParams,
  TUserTagSearchResult,
} from '@/services/nexus/search/search.types';
import { toSearchReachParams } from '@/services/nexus/search/search.utils';

/**
 * Nexus Search Service
 *
 * Handles search operations against the Nexus API.
 * Full-text post content search lives in NexusPostStreamService.fetch (content_search streams).
 */
export class NexusSearchService {
  private constructor() {}

  /**
   * Search users by ID prefix
   *
   * @param params - Parameters containing prefix and pagination options
   * @returns Array of user IDs matching the ID prefix
   */
  static async usersById(params: TPrefixSearchParams): Promise<TSearchResult> {
    const url = searchApi.byUser(params);
    return await queryNexus<TSearchResult>({ url });
  }

  /**
   * Search users by name prefix
   *
   * @param params - Parameters containing prefix and pagination options
   * @returns Array of user IDs matching the name prefix
   */
  static async usersByName(params: TPrefixSearchParams): Promise<TSearchResult> {
    const url = searchApi.byUsername(params);
    return await queryNexus<TSearchResult>({ url });
  }

  /**
   * Search tags by prefix
   *
   * @param params - Parameters containing prefix and pagination options
   * @returns Array of tag labels matching the prefix
   */
  static async tags(params: TPrefixSearchParams): Promise<TSearchResult> {
    const url = searchApi.byPrefix(params);
    return await queryNexus<TSearchResult>({ url });
  }

  /**
   * Search users by profile tags
   *
   * @param params - Comma-separated tag labels, pagination, and an optional reach with its viewer
   * @returns User ids with tagger-count scores, ordered by score
   */
  static async usersByTags({ reach, viewerId, ...params }: TUsersByTagsFetchParams): Promise<TUserTagSearchResult[]> {
    const url = searchApi.byTags({
      ...params,
      ...toSearchReachParams(reach, viewerId, 'NexusSearchService.usersByTags'),
    });
    return await queryNexus<TUserTagSearchResult[]>({ url });
  }
}
