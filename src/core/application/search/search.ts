import { NexusSearchService } from '@/services/nexus/search/search';
import type {
  TPrefixSearchParams,
  TSearchResult,
  TUsersByTagsSearchParams,
  TUserTagSearchResult,
} from '@/services/nexus/search/search.types';

/**
 * Search Application Layer
 *
 * Orchestrates search operations between controllers and services.
 */
export class SearchApplication {
  private constructor() {}

  /**
   * Search users by ID prefix (pubky)
   * @returns Array of user IDs (pubkeys) matching the search prefix
   */
  static async fetchUsersById(params: TPrefixSearchParams): Promise<TSearchResult> {
    return await NexusSearchService.usersById(params);
  }

  /**
   * Search users by name prefix
   * @returns Array of user IDs (pubkeys) matching the search prefix
   */
  static async fetchUsersByName(params: TPrefixSearchParams): Promise<TSearchResult> {
    return await NexusSearchService.usersByName(params);
  }

  /**
   * Search tags by prefix
   */
  static async fetchTagsByPrefix(params: TPrefixSearchParams): Promise<TSearchResult> {
    return await NexusSearchService.tags(params);
  }

  /**
   * Search users by profile tags
   * @returns User ids with tagger-count scores, ordered by score
   */
  static async fetchUsersByTags(params: TUsersByTagsSearchParams): Promise<TUserTagSearchResult[]> {
    return await NexusSearchService.usersByTags(params);
  }
}
