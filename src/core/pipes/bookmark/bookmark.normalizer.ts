import { type Bookmark, buildBookmark, buildUri, type Built, decodeObject, parseUri } from 'pubky-social-specs';
import type { CompositeIdResult, Pubky } from '@/models/models.types';
import { buildCompositeId } from '@/models/models.utils';
import type { TBookmarkListing, TStoredBookmark } from '@/pipes/bookmark/bookmark.types';
import { toSpecsValidationError } from '@/pipes/specs.errors';

export class BookmarkNormalizer {
  private constructor() {}

  /**
   * The bookmark of a post, targeting its versionless v1 reference, as `pubky-social-specs` stores
   * it under the bookmarker's private root. Its path spells the target, so building it again names
   * the file a delete removes.
   */
  static to(post: CompositeIdResult, userId: Pubky): Built<Bookmark> {
    try {
      return buildBookmark(userId, buildUri(post.pubky, 'post', post.id));
    } catch (error) {
      throw toSpecsValidationError(error, 'buildBookmark', { author: post.pubky, postId: post.id, userId });
    }
  }

  /**
   * What one entry of the bookmarks directory listing names: the post its filename spells, or, for
   * the overflow form `~{hash}` (a target too long for a filename), nothing until the stored object
   * is read. Null for a file that is no bookmark of a post: another kind, a web or profile target,
   * a post version, a 0.x post reference.
   */
  static fromListing(url: string): TBookmarkListing | null {
    try {
      const parsed = parseUri(url);
      if (parsed.kind !== 'bookmark') return null;
      if (parsed.target === undefined) return parsed.id.startsWith('~') ? { url, postId: null } : null;
      const postId = this.postIdOfTarget(parsed.target);
      return postId === null ? null : { url, postId };
    } catch {
      // A name that is no canonical URI names no bookmark.
      return null;
    }
  }

  /**
   * The stored bookmark at `url`: the post it targets (null when it targets anything else) and when
   * it was made, in milliseconds. Throws a validation `AppError` for bytes the data model refuses.
   */
  static fromStored(url: string, bytes: Uint8Array): TStoredBookmark {
    try {
      const parsed = parseUri(url);
      const stored = decodeObject(url, bytes, 'bookmark');
      const target = (parsed.kind === 'bookmark' ? parsed.target : undefined) ?? stored.target;
      return {
        postId: target ? this.postIdOfTarget(target) : null,
        // `created_at` is microseconds; the local row keeps milliseconds.
        createdAt: Math.floor(stored.created_at / 1000),
      };
    } catch (error) {
      throw toSpecsValidationError(error, 'decodeBookmark', { url });
    }
  }

  /** The composite id of a versionless v1 post reference; null for any other target. */
  private static postIdOfTarget(target: string): string | null {
    try {
      const parsed = parseUri(target);
      if (parsed.kind !== 'post' || parsed.editId !== undefined) return null;
      return buildCompositeId({ pubky: parsed.owner, id: parsed.id });
    } catch {
      // A web URL, or anything else that is no pubky URI.
      return null;
    }
  }
}
