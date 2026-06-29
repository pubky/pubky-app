import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';

/**
 * The two local bookmark streams. The bookmarks route has no content/sort filter
 * UI, so non-collection bookmarks all live in the single ALL feed; collections
 * are filed under the dedicated collection stream that backs FollowedCollections.
 */
const BOOKMARK_STREAMS = {
  all: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
  collection: PostStreamTypes.TIMELINE_BOOKMARKS_COLLECTION,
} as const;

export class LocalBookmarkService {
  private static readonly BOOKMARK_TABLES = [
    BookmarkModel.table,
    UserCountsModel.table,
    PostStreamModel.table,
    PostDetailsModel.table,
  ] as const;

  /**
   * Persists a bookmark operation (create or delete).
   */
  static async persist(action: HttpMethod, { userId, postId }: TBookmarkEventParams) {
    const isCreate = action === HttpMethod.PUT;

    try {
      await db.transaction('rw', this.BOOKMARK_TABLES, async () => {
        const existingBookmark = await BookmarkModel.findById(postId);
        const bookmarkExists = !!existingBookmark;

        // Skip if already in desired state (idempotent operation)
        if (bookmarkExists === isCreate) {
          Logger.debug(isCreate ? 'Post already bookmarked' : 'Post not bookmarked', { postId });
          return;
        }

        // Fetch post details to determine which streams to update
        const postDetails = await PostDetailsModel.findById(postId);
        const kind = postDetails?.kind;

        // The `bookmarks` count is posts-only — bookmarked collections are
        // excluded — so only move the count when the target isn't a collection.
        const isCollection = kind === 'collection';

        if (isCreate) {
          const ops: Promise<unknown>[] = [
            BookmarkModel.upsert({
              id: postId,
              created_at: Date.now(),
            }),
            this.addToBookmarkStreams(postId, kind),
          ];
          if (!isCollection) {
            ops.push(UserCountsModel.updateCounts({ userId, countChanges: { bookmarks: 1 } }));
          }
          await Promise.all(ops);

          Logger.debug('Bookmark created', { postId });
        } else {
          const ops: Promise<unknown>[] = [
            BookmarkModel.deleteById(postId),
            this.removeFromBookmarkStreams(postId, kind),
          ];
          if (!isCollection) {
            ops.push(UserCountsModel.updateCounts({ userId, countChanges: { bookmarks: -1 } }));
          }
          await Promise.all(ops);

          Logger.debug('Bookmark deleted', { postId });
        }
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, `Failed to ${isCreate ? 'create' : 'delete'} bookmark`, {
        service: ErrorService.Local,
        operation: isCreate ? 'createBookmark' : 'deleteBookmark',
        context: { postId },
        cause: error,
      });
    }
  }

  /**
   * Checks if a post is bookmarked.
   *
   * @param postId - Composite post ID (authorId:postId)
   * @returns boolean indicating if the post is bookmarked
   */
  static async exists(postId: string): Promise<boolean> {
    const bookmark = await BookmarkModel.findById(postId);
    return bookmark !== null;
  }

  /**
   * Get all bookmarked post IDs (unordered).
   *
   * @returns Array of bookmarked post IDs
   */
  static async getAllBookmarks(): Promise<string[]> {
    return await BookmarkModel.findAll();
  }

  /**
   * Get all bookmarked post IDs sorted by `created_at` descending
   * (most recently bookmarked first).
   *
   * @returns Array of bookmarked post IDs, newest first.
   */
  static async getAllBookmarksSorted(): Promise<string[]> {
    const sorted = await BookmarkModel.findAllSorted();
    return sorted.map((b) => b.id);
  }

  /**
   * Resolve which local bookmark stream a post belongs to, by kind.
   *
   * Collections are "followed", not feed posts: the posts feed (`…_ALL`) filters
   * collection-kind posts out on read, so we keep them out of it entirely and
   * file them under the dedicated collection bookmark stream instead. Every other
   * kind goes to the ALL stream.
   *
   * @param kind - Post kind (short, long, image, video, file, link, collection)
   */
  private static bookmarkStreamsForKind(kind?: string): PostStreamTypes[] {
    return kind === 'collection' ? [BOOKMARK_STREAMS.collection] : [BOOKMARK_STREAMS.all];
  }

  /**
   * Add a post to the appropriate bookmark streams based on post type
   *
   * @param postId - Composite post ID
   * @param kind - Post kind (short, long, image, video, file, link, collection)
   */
  private static async addToBookmarkStreams(postId: string, kind?: string): Promise<void> {
    await Promise.all(
      this.bookmarkStreamsForKind(kind).map((streamId) =>
        LocalStreamPostsService.prependToStream({ streamId, compositePostId: postId }),
      ),
    );
  }

  /**
   * Remove a post from the bookmark streams it was added to (see `bookmarkStreamsForKind`).
   *
   * @param postId - Composite post ID
   * @param kind - Post kind (short, long, image, video, file, link, collection)
   */
  private static async removeFromBookmarkStreams(postId: string, kind?: string): Promise<void> {
    await Promise.all(
      this.bookmarkStreamsForKind(kind).map((streamId) =>
        LocalStreamPostsService.removeFromStream({ streamId, compositePostId: postId }),
      ),
    );
  }
}
