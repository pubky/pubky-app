import { SearchApplication } from '@/application/search/search';
import type {
  TPrefixSearchParams,
  TSearchResult,
  TUsersByTagsSearchParams,
  TUserTagSearchResult,
} from '@/services/nexus/search/search.types';

export class SearchController {
  private constructor() {}

  /**
   * Search users by ID prefix (pubky)
   * @returns Array of user IDs (pubkeys) matching the search prefix
   */
  static async fetchUsersById(params: TPrefixSearchParams): Promise<TSearchResult> {
    return await SearchApplication.fetchUsersById(params);
  }

  /**
   * Search users by name prefix
   * @returns Array of user IDs (pubkeys) matching the search prefix
   */
  static async getUsersByName(params: TPrefixSearchParams): Promise<TSearchResult> {
    return await SearchApplication.fetchUsersByName(params);
  }

  /**
   * Search tags by prefix
   */
  static async getTagsByPrefix(params: TPrefixSearchParams): Promise<TSearchResult> {
    return await SearchApplication.fetchTagsByPrefix(params);
  }

  /**
   * Search users by profile tags
   * @returns User ids with tagger-count scores, ordered by score
   */
  static async fetchUsersByTags(params: TUsersByTagsSearchParams): Promise<TUserTagSearchResult[]> {
    return await SearchApplication.fetchUsersByTags(params);
  }
}
