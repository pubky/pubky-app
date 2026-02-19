import * as Core from '@/core';
import { HttpMethod } from '@/libs';
import { postUriBuilder } from 'pubky-app-specs';

export class BookmarkController {
  private constructor() {}

  /**
   * Get all bookmarks for the current user, sorted by most recent
   */
  static async getAll(userId: string): Promise<Core.NexusFileDetails[]> {
    const bookmarks = await Core.LocalBookmarkService.readAll(userId);
    if (!bookmarks || bookmarks.length === 0) {
      const fetched = await Core.NexusBookmarkService.fetchAll(userId);
      await Core.LocalBookmarkService.bulkSave(fetched);
      return fetched;
    }
    return bookmarks;
  }

  /**
   * Check if a post is bookmarked
   * @param postId - Composite post ID (authorId:postId)
   * @returns boolean indicating if the post is bookmarked
   */
  static async exists(postId: string): Promise<boolean> {
    return Core.BookmarkApplication.exists(postId);
  }

  /**
   * Create a bookmark
   * @param params - Parameters object
   * @param params.userId - ID of the user creating the bookmark (current user)
   * @param params.postId - Composite post ID (authorId:postId)
   */
  static async commitCreate({ postId, userId }: Core.TBookmarkEventParams) {
    const { pubky: authorId, id: rawPostId } = Core.parseCompositeId(postId);
    const postUri = postUriBuilder(authorId, rawPostId);
    const { bookmark, meta } = Core.BookmarkNormalizer.to(postUri, userId);

    await Core.BookmarkApplication.persist(HttpMethod.PUT, {
      postId,
      bookmarkUrl: meta.url,
      bookmarkJson: bookmark.toJson(),
    });
  }

  /**
   * Delete a bookmark
   * @param params - Parameters object
   * @param params.userId - ID of the user removing the bookmark (current user)
   * @param params.postId - Composite post ID (authorId:postId)
   */
  static async commitDelete({ postId, userId }: Core.TBookmarkEventParams) {
    const { pubky: authorId, id: rawPostId } = Core.parseCompositeId(postId);
    const postUri = postUriBuilder(authorId, rawPostId);
    const { meta } = Core.BookmarkNormalizer.to(postUri, userId);

    await Core.BookmarkApplication.persist(HttpMethod.DELETE, {
      postId,
      bookmarkUrl: meta.url,
    });
  }
}
