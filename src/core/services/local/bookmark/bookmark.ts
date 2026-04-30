import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
import { db } from '@/database/franky/franky';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
/**
 * Mapping of post kinds to their corresponding bookmark stream types.
 * The 'all' key represents the stream containing all bookmarks.
 */
const BOOKMARK_STREAMS: Record<string, PostStreamTypes> = {
  all: PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
  short: PostStreamTypes.TIMELINE_BOOKMARKS_SHORT,
  long: PostStreamTypes.TIMELINE_BOOKMARKS_LONG,
  image: PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE,
  video: PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO,
  file: PostStreamTypes.TIMELINE_BOOKMARKS_FILE,
  link: PostStreamTypes.TIMELINE_BOOKMARKS_LINK,
};

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

        if (isCreate) {
          await Promise.all([
            BookmarkModel.upsert({
              id: postId,
              created_at: Date.now(),
            }),
            UserCountsModel.updateCounts({ userId, countChanges: { bookmarks: 1 } }),
            this.addToBookmarkStreams(postId, kind),
          ]);

          Logger.debug('Bookmark created', { postId });
        } else {
          await Promise.all([
            BookmarkModel.deleteById(postId),
            UserCountsModel.updateCounts({ userId, countChanges: { bookmarks: -1 } }),
            this.removeFromBookmarkStreams(postId, kind),
          ]);

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
   * Get all bookmarked post IDs
   *
   * @returns Array of bookmarked post IDs
   */
  static async getAllBookmarks(): Promise<string[]> {
    return await BookmarkModel.findAll();
  }

  /**
   * Add a post to the appropriate bookmark streams based on post type
   *
   * @param postId - Composite post ID
   * @param kind - Post kind (short, long, image, video, file, link)
   */
  private static async addToBookmarkStreams(postId: string, kind?: string): Promise<void> {
    const streams = [BOOKMARK_STREAMS.all]; // Always add to ALL stream.

    // If there is a post kind also add to that stream, but never more than one.
    const kindStream = kind && BOOKMARK_STREAMS[kind];
    if (kindStream) {
      streams.push(kindStream);
    }

    await Promise.all(
      streams.map((streamId) => LocalStreamPostsService.prependToStream({ streamId, compositePostId: postId })),
    );
  }

  /**
   * Remove a post from bookmark streams
   *
   * Removes from the 'all' stream and the kind-specific stream if kind is provided.
   *
   * @param postId - Composite post ID
   * @param kind - Post kind (short, long, image, video, file, link)
   */
  private static async removeFromBookmarkStreams(postId: string, kind?: string): Promise<void> {
    const streams = [BOOKMARK_STREAMS.all]; // Always remove from ALL stream.

    // If there is a post kind also remove from that stream.
    const kindStream = kind && BOOKMARK_STREAMS[kind];
    if (kindStream) {
      streams.push(kindStream);
    }

    await Promise.all(
      streams.map((streamId) => LocalStreamPostsService.removeFromStream({ streamId, compositePostId: postId })),
    );
  }
}
