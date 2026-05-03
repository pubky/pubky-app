import { postUriBuilder } from 'pubky-app-specs';
import { HttpMethod } from '@/libs/http/http.types';
import { BookmarkApplication } from '@/application/bookmark/bookmark';
import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
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
   * Create a bookmark
   * @param params - Parameters object
   * @param params.userId - ID of the user creating the bookmark (current user)
   * @param params.postId - Composite post ID (authorId:postId)
   */
  static async commitCreate({ postId, userId }: TBookmarkEventParams) {
    const { pubky: authorId, id: rawPostId } = parseCompositeId(postId);
    const postUri = postUriBuilder(authorId, rawPostId);
    const { bookmark, meta } = BookmarkNormalizer.to(postUri, userId);

    await BookmarkApplication.persist(HttpMethod.PUT, {
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
  static async commitDelete({ postId, userId }: TBookmarkEventParams) {
    const { pubky: authorId, id: rawPostId } = parseCompositeId(postId);
    const postUri = postUriBuilder(authorId, rawPostId);
    const { meta } = BookmarkNormalizer.to(postUri, userId);

    await BookmarkApplication.persist(HttpMethod.DELETE, {
      postId,
      bookmarkUrl: meta.url,
    });
  }
}
