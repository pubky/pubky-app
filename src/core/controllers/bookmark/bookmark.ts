import { buildUri } from 'pubky-social-specs';
import { BookmarkApplication } from '@/application/bookmark/bookmark';
import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
import { HttpMethod } from '@/libs/http/http.types';
import { parseCompositeId } from '@/models/models.utils';
import { BookmarkNormalizer } from '@/pipes/bookmark/bookmark.normalizer';

export class BookmarkController {
  private constructor() {}

  /**
   * Check if a post is bookmarked
   * @param postId - Composite post ID (authorId:postId)
   * @returns boolean indicating if the post is bookmarked
   */
  static async exists(postId: string): Promise<boolean> {
    return BookmarkApplication.exists(postId);
  }

  /**
   * Get all locally-known bookmarked composite post IDs for the current user.
   *
   * Local-only read — the bookmarks table is hydrated opportunistically by
   * stream fetches. Surfaces that need a complete view should seed via the
   * relevant stream id first (e.g. `timeline:bookmarks:collection` for the
   * Followed Collections section).
   *
   * Designed for use inside `useLiveQuery` so callers can react to follow /
   * unfollow events anywhere in the app.
   *
   * @returns Array of composite post IDs (`authorId:postId`).
   */
  static async getAll(): Promise<string[]> {
    return BookmarkApplication.getAll();
  }

  /**
   * Create a bookmark
   * @param params - Parameters object
   * @param params.userId - ID of the user creating the bookmark (current user)
   * @param params.postId - Composite post ID (authorId:postId)
   */
  static async commitCreate({ postId, userId }: TBookmarkEventParams) {
    const { pubky: authorId, id: rawPostId } = parseCompositeId(postId);
    const { url, body } = BookmarkNormalizer.to(buildUri(authorId, 'post', rawPostId), userId);

    await BookmarkApplication.persist(HttpMethod.PUT, { postId, bookmarkUrl: url, bookmarkBody: body });
  }

  /**
   * Delete a bookmark
   * @param params - Parameters object
   * @param params.userId - ID of the user removing the bookmark (current user)
   * @param params.postId - Composite post ID (authorId:postId)
   */
  static async commitDelete({ postId, userId }: TBookmarkEventParams) {
    const { pubky: authorId, id: rawPostId } = parseCompositeId(postId);
    // The bookmark's path spells its target, so building it again names the file to delete.
    const { url } = BookmarkNormalizer.to(buildUri(authorId, 'post', rawPostId), userId);

    await BookmarkApplication.persist(HttpMethod.DELETE, { postId, bookmarkUrl: url });
  }
}
