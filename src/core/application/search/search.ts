import { NexusSearchService } from '@/services/nexus/search/search';
import type { TPrefixSearchParams, TSearchResult } from '@/services/nexus/search/search.types';
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
}
