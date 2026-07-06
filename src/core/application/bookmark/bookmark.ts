import type { TBookmarkPersistInput } from '@/application/bookmark/bookmark.types';
import { HttpMethod } from '@/libs/http/http.types';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalBookmarkService } from '@/services/local/bookmark/bookmark';
import { useAuthStore } from '@/stores/auth/auth.store';

/**
 * Bookmark application service.
 *
 * **Parallel Write Pattern:**
 * Both `create` and `delete` methods update the local IndexedDB and homeserver
 * in parallel for optimal performance.
 *
 * **Failure Handling:**
 * If either operation fails, the entire operation fails. Callers should handle
 * errors and potentially retry or implement compensation logic.
 */
export class BookmarkApplication {
  /**
   * Check if a post is bookmarked
   * @param postId - Composite post ID (authorId:postId)
   * @returns boolean indicating if the post is bookmarked
   */
  static async exists(postId: string): Promise<boolean> {
    return LocalBookmarkService.exists(postId);
  }

  /**
   * Get all locally-known bookmarked composite post IDs for the current
   * user, sorted by `created_at` descending (most recently bookmarked
   * first).
   *
   * Local-only read — does not fetch from Nexus. The bookmarks table is
   * populated opportunistically as a side effect of any stream fetch whose
   * response includes the viewer's `bookmark` field on a post (see
   * `LocalStreamPostsService.persistPosts`). Consumers that need a fully
   * hydrated picture should seed via a stream fetch first.
   *
   * @returns Composite post IDs (`authorId:postId`), newest-bookmarked
   *   first.
   */
  static async getAll(): Promise<string[]> {
    return LocalBookmarkService.getAllBookmarksSorted();
  }

  static async persist(action: HttpMethod, params: TBookmarkPersistInput) {
    // Get current user ID for user counts update
    const userId = useAuthStore.getState().selectCurrentUserPubky();

    const { postId, bookmarkUrl, bookmarkJson } = params;

    // Execute local and homeserver operations in parallel
    await Promise.all([
      LocalBookmarkService.persist(action, { userId, postId }),
      HomeserverService.request({ method: action, url: bookmarkUrl, bodyJson: bookmarkJson }),
    ]);
  }
}
