import type { TBookmarkEventParams } from '@/controllers/bookmark/bookmark.types';
import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { BookmarkModel } from '@/models/bookmark/bookmark';
import type { BookmarkModelSchema } from '@/models/bookmark/bookmark.schema';
import { PostDetailsModel } from '@/models/post/details/postDetails';
import { PostStreamTypes } from '@/models/stream/post/postStream.types';
import { PostStreamModel } from '@/models/stream/post/tables/postStream';
import type { TBookmarkReconcileParams } from '@/services/local/bookmark/bookmark.types';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';

/**
 * The one local bookmark stream: every bookmark, collections included, newest bookmark first. The
 * bookmarks feed drops collections on read; `FollowedCollections` walks it to hydrate them.
 */
const BOOKMARKS_STREAM = PostStreamTypes.TIMELINE_BOOKMARKS_ALL;

export class LocalBookmarkService {
  private static readonly BOOKMARK_TABLES = [BookmarkModel.table, PostStreamModel.table] as const;

  /** Counts the local bookmark writes of this tab; see `captureWriteSequence`. */
  private static writeSequence = 0;
  /** The sequence number of the latest local write per composite post id. */
  private static readonly lastWriteSequence = new Map<string, number>();

  /**
   * Persists a bookmark operation (create or delete).
   *
   * The write is numbered before it runs, so a reconcile whose listing started earlier leaves this
   * post alone (`reconcile`).
   */
  static async persist(action: HttpMethod, { postId }: Pick<TBookmarkEventParams, 'postId'>) {
    const isCreate = action === HttpMethod.PUT;
    this.lastWriteSequence.set(postId, ++this.writeSequence);

    try {
      await db.transaction('rw', this.BOOKMARK_TABLES, async () => {
        const existingBookmark = await BookmarkModel.findById(postId);
        const bookmarkExists = !!existingBookmark;

        // Skip if already in desired state (idempotent operation)
        if (bookmarkExists === isCreate) {
          Logger.debug(isCreate ? 'Post already bookmarked' : 'Post not bookmarked', { postId });
          return;
        }

        if (isCreate) {
          await Promise.all([
            BookmarkModel.upsert({
              id: postId,
              created_at: Date.now(),
            }),
            LocalStreamPostsService.prependToStream({ streamId: BOOKMARKS_STREAM, compositePostId: postId }),
          ]);

          Logger.debug('Bookmark created', { postId });
        } else {
          await Promise.all([
            BookmarkModel.deleteById(postId),
            LocalStreamPostsService.removeFromStream({ streamId: BOOKMARKS_STREAM, compositePostId: postId }),
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
   * The position of this tab's local bookmark writes, for a reconcile to take before it lists the
   * homeserver directory: every write after it is newer than that listing.
   */
  static captureWriteSequence(): number {
    return this.writeSequence;
  }

  /**
   * Replaces the local bookmarks with what the homeserver listing holds, in one transaction:
   * deletes every row the listing no longer names (un-bookmarked elsewhere), upserts the listed
   * ones and rewrites the bookmarks stream from the table, newest bookmark first and without a
   * Nexus cursor. A post this tab bookmarked or un-bookmarked after `since` keeps its local state:
   * the listing predates that write. `isCurrent` is checked inside the transaction, so a listing
   * that finished after an account switch writes nothing for the next account.
   *
   * @returns The stored bookmark ids, newest first, or null when nothing was written.
   */
  static async reconcile({ bookmarks, since, isCurrent }: TBookmarkReconcileParams): Promise<string[] | null> {
    const writtenSince = (postId: string) => (this.lastWriteSequence.get(postId) ?? 0) > since;
    try {
      return await db.transaction('rw', this.BOOKMARK_TABLES, async () => {
        if (isCurrent && !isCurrent()) return null;
        const listedIds = new Set(bookmarks.map((bookmark) => bookmark.id));
        const stale = (await BookmarkModel.findAll()).filter((id) => !listedIds.has(id) && !writtenSince(id));
        const listed = bookmarks.filter((bookmark) => !writtenSince(bookmark.id));
        if (stale.length > 0) await BookmarkModel.table.bulkDelete(stale);
        if (listed.length > 0) await BookmarkModel.bulkSave(listed);

        const ids = (await BookmarkModel.findAllSorted()).map((bookmark) => bookmark.id);
        await LocalStreamPostsService.upsert({ streamId: BOOKMARKS_STREAM, stream: ids });
        return ids;
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.TRANSACTION_FAILED, 'Failed to reconcile bookmarks with the homeserver', {
        service: ErrorService.Local,
        operation: 'reconcileBookmarks',
        context: { table: BookmarkModel.table.name, count: bookmarks.length },
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

  /** Every local bookmark row, newest first. */
  static async readAll(): Promise<BookmarkModelSchema[]> {
    return await BookmarkModel.findAllSorted();
  }

  /**
   * How many bookmarked posts there are: every bookmark but those of collections, which the
   * Collections page lists as followed instead. A bookmark whose post is not cached yet counts.
   */
  static async countPosts(): Promise<number> {
    const ids = await BookmarkModel.findAll();
    if (ids.length === 0) return 0;
    const details = await PostDetailsModel.findByIdsPreserveOrder(ids);
    return details.filter((detail) => detail?.kind !== 'collection').length;
  }
}
