import * as Core from '@/core';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/**
 * Mapping of post kinds to their corresponding bookmark stream types.
 * The 'all' key represents the stream containing all bookmarks.
 */
const BOOKMARK_STREAMS: Record<string, Core.PostStreamTypes> = {
  all: Core.PostStreamTypes.TIMELINE_BOOKMARKS_ALL,
  short: Core.PostStreamTypes.TIMELINE_BOOKMARKS_SHORT,
  long: Core.PostStreamTypes.TIMELINE_BOOKMARKS_LONG,
  image: Core.PostStreamTypes.TIMELINE_BOOKMARKS_IMAGE,
  video: Core.PostStreamTypes.TIMELINE_BOOKMARKS_VIDEO,
  file: Core.PostStreamTypes.TIMELINE_BOOKMARKS_FILE,
  link: Core.PostStreamTypes.TIMELINE_BOOKMARKS_LINK,
};

export class LocalBookmarkService {
  private static readonly BOOKMARK_TABLES = [
    Core.BookmarkModel.table,
    Core.UserCountsModel.table,
    Core.PostStreamModel.table,
    Core.PostDetailsModel.table,
  ] as const;

  /**
   * Persists a bookmark operation (create or delete).
   */
  static async persist(action: HttpMethod, { userId, postId }: Core.TBookmarkEventParams) {
    const isCreate = action === HttpMethod.PUT;

    try {
      await Core.db.transaction('rw', this.BOOKMARK_TABLES, async () => {
        const existingBookmark = await Core.BookmarkModel.findById(postId);
        const bookmarkExists = !!existingBookmark;

        // Skip if already in desired state (idempotent operation)
        if (bookmarkExists === isCreate) {
          Logger.debug(isCreate ? 'Post already bookmarked' : 'Post not bookmarked', { postId });
          return;
        }

        // Fetch post details to determine which streams to update
        const postDetails = await Core.PostDetailsModel.findById(postId);
        const kind = postDetails?.kind;

        if (isCreate) {
          await Promise.all([
            Core.BookmarkModel.upsert({
              id: postId,
              created_at: Date.now(),
            }),
            Core.UserCountsModel.updateCounts({ userId, countChanges: { bookmarks: 1 } }),
            this.addToBookmarkStreams(postId, kind),
          ]);

          Logger.debug('Bookmark created', { postId });
        } else {
          await Promise.all([
            Core.BookmarkModel.deleteById(postId),
            Core.UserCountsModel.updateCounts({ userId, countChanges: { bookmarks: -1 } }),
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
    const bookmark = await Core.BookmarkModel.findById(postId);
    return bookmark !== null;
  }

  /**
   * Get all bookmarked post IDs
   *
   * @returns Array of bookmarked post IDs
   */
  static async getAllBookmarks(): Promise<string[]> {
    return await Core.BookmarkModel.findAll();
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
      streams.map((streamId) => Core.LocalStreamPostsService.prependToStream({ streamId, compositePostId: postId })),
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
      streams.map((streamId) => Core.LocalStreamPostsService.removeFromStream({ streamId, compositePostId: postId })),
    );
  }
}
