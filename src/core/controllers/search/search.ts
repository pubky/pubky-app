import { SearchApplication } from '@/application/search/search';
import type {
  TPrefixSearchParams,
  TSearchResult,
  TUsersByTagsQuery,
  TUserTagSearchResult,
} from '@/services/nexus/search/search.types';
import { useAuthStore } from '@/stores/auth/auth.store';

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
  static async fetchTagsByPrefix(params: TPrefixSearchParams): Promise<TSearchResult> {
    return await SearchApplication.fetchTagsByPrefix(params);
  }

  /**
   * Search users by profile tags, optionally within the viewer's network.
   * Read-only, so callers drop the results of a scope they have left.
   * @returns User ids with tagger-count scores, ordered by score
   */
  static async fetchUsersByTags(params: TUsersByTagsQuery): Promise<TUserTagSearchResult[]> {
    const viewerId = useAuthStore.getState().currentUserPubky ?? undefined;
    return await SearchApplication.fetchUsersByTags({ ...params, viewerId });
  }
}
