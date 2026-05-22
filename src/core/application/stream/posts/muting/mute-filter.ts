import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { parseCompositeId } from '@/models/models.utils';

/**
 * Handles mute filtering for post streams.
 *
 * This class provides static utility methods for filtering posts based on muted users.
 * It does not directly access the Service layer - muted user IDs should be retrieved
 * at the Application layer and passed as parameters.
 *
 * Two filtering methods are provided:
 * - `filterPosts`: Used in Application layer where composite IDs are guaranteed valid
 * - `filterPostsSafe`: Used in UI layer where IDs may be malformed; includes error handling
 */
export class MuteFilter {
  private constructor() {}

  /**
   * Filters out posts authored by muted users.
   * Use this in the Application layer where composite IDs are guaranteed valid.
   *
   * @param postIds - Array of composite post IDs to filter
   * @param mutedUserIds - Set of muted user IDs (pubkeys)
   * @returns Filtered array of post IDs excluding posts from muted users
   */
  static filterPosts(postIds: string[], mutedUserIds: Set<Pubky>): string[] {
    if (mutedUserIds.size === 0) {
      return postIds;
    }
    return postIds.filter((postId) => {
      const { pubky: authorId } = parseCompositeId(postId);
      return !mutedUserIds.has(authorId);
    });
  }

  /**
   * Safely filters out posts authored by muted users with error handling.
   * Use this in the UI layer where composite IDs may be malformed.
   *
   * On parse failure, items are included (fail-open) and a debug log is emitted.
   * This ensures the UI doesn't break on unexpected data while still surfacing issues.
   *
   * @param postIds - Array of composite post IDs to filter
   * @param mutedUserIds - Set of muted user IDs (pubkeys)
   * @returns Filtered array of post IDs excluding posts from muted users
   */
  static filterPostsSafe(postIds: string[], mutedUserIds: Set<Pubky>): string[] {
    if (mutedUserIds.size === 0) {
      return postIds;
    }
    return postIds.filter((postId) => {
      try {
        const { pubky: authorId } = parseCompositeId(postId);
        return !mutedUserIds.has(authorId);
      } catch {
        // Fail-open: include items we can't parse to avoid hiding valid content
        Logger.debug('MuteFilter: Failed to parse composite ID for mute filtering', postId);
        return true;
      }
    });
  }

  /**
   * Checks if a single post is from a muted user (safe version with error handling).
   *
   * @param postId - Composite post ID to check
   * @param mutedUserIds - Set of muted user IDs (pubkeys)
   * @returns true if the post author is muted, false otherwise (including on parse error)
   */
  static isPostMuted(postId: string, mutedUserIds: Set<Pubky>): boolean {
    if (mutedUserIds.size === 0) {
      return false;
    }
    try {
      const { pubky: authorId } = parseCompositeId(postId);
      return mutedUserIds.has(authorId);
    } catch {
      Logger.debug('MuteFilter: Failed to parse composite ID for mute check', postId);
      return false;
    }
  }
}
