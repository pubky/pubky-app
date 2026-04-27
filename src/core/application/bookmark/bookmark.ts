import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';

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
    return Core.LocalBookmarkService.exists(postId);
  }

  static async persist(action: HttpMethod, params: Core.TBookmarkPersistInput) {
    // Get current user ID for user counts update
    const userId = Core.useAuthStore.getState().selectCurrentUserPubky();

    const { postId, bookmarkUrl, bookmarkJson } = params;

    // Execute local and homeserver operations in parallel
    await Promise.all([
      Core.LocalBookmarkService.persist(action, { userId, postId }),
      Core.HomeserverService.request({ method: action, url: bookmarkUrl, bodyJson: bookmarkJson }),
    ]);
  }
}
