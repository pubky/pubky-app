import { queryNexus } from '@/services/nexus/nexus.utils';
import { searchApi } from '@/services/nexus/search/search.api';
import type {
  TContentSearchParams,
  TContentSearchResult,
  TPrefixSearchParams,
  TSearchResult,
} from '@/services/nexus/search/search.types';

/**
 * Nexus Search Service
 *
 * Handles search operations against the Nexus API
 */
export class NexusSearchService {
  private constructor() {}

  /** Search post content, ordered by Nexus full-text relevance. */
  static async postsByContent(params: TContentSearchParams): Promise<TContentSearchResult> {
    const url = searchApi.byContent(params);
    return await queryNexus<TContentSearchResult>({ url });
  }

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
}
