import { SearchApplication } from '@/application/search/search';
import { captureViewerSession } from '@/controllers/tag/tag-cache.utils';
import { AuthErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type {
  NexusSearchReach,
  TPrefixSearchParams,
  TSearchResult,
  TUsersByTagsSearchParams,
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
   * Search users by profile tags
   * @returns User ids with tagger-count scores, ordered by score
   */
  static async fetchUsersByTags({
    reach,
    ...params
  }: Omit<TUsersByTagsSearchParams, 'user_id' | 'reach'> & { reach?: NexusSearchReach }): Promise<
    TUserTagSearchResult[]
  > {
    const userId = useAuthStore.getState().currentUserPubky;
    if (reach && !userId) {
      throw Err.auth(AuthErrorCode.UNAUTHORIZED, 'Sign in to search within your network', {
        service: ErrorService.Nexus,
        operation: 'SearchController.fetchUsersByTags',
      });
    }
    const isCurrent = captureViewerSession();
    const results = await SearchApplication.fetchUsersByTags(
      reach && userId ? { ...params, reach, user_id: userId } : params,
    );
    return isCurrent() ? results : [];
  }
}
