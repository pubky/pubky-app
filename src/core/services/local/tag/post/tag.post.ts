import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import type { Pubky } from '@/models/models.types';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTagsModel, type PostTagsModelSchema } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { ViewerTagMarkerStorage } from '@/services/local/tag/post/viewerTagMarkerStorage';
import type { TLocalTagParams } from '@/services/local/tag/tag.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

export class LocalPostTagService {
  private static readonly TAG_TABLES = [
    PostTagsModel.table,
    PostCountsModel.table,
    UserCountsModel.table,
    PostTtlModel.table,
  ] as const;
  /**
   * Adds a tag to a post and updates all related counts.
   *
   * - Adds the tagger to the specified tag
   * - Updates post counts (total tags, unique tags)
   * - Increments the tagger's tagged count
   *
   * @param params.postId - Unique identifier of the post to tag
   * @param params.label - Normalized tag label (must be pre-normalized by caller)
   * @param params.taggerId - Unique identifier of the user adding the tag
   *
   * @returns {boolean} true if local state changed; false if the tagger already had this tag (idempotent — no writes, no viewer marker)
   * @throws {AppError} When user has already tagged this post with the same label
   * @throws {DatabaseError} When database operations fail
   */
  static async create({ taggedId: postId, label, taggerId }: TLocalTagParams): Promise<boolean> {
    // True only when the transaction actually changed IndexedDB state.
    // We use this to decide whether to write the viewer-mutation marker after
    // the transaction commits: if nothing changed (e.g., the user already had
    // this tag), there's no local state to protect from stale Nexus responses,
    // so we skip the marker.
    let mutated = false;
    try {
      mutated = await db.transaction('rw', this.TAG_TABLES, async () => {
        const postTagsModel = await PostTagsModel.getOrCreate<string, PostTagsModelSchema>(postId);
        const status = postTagsModel.addTagger(label, taggerId);
        // Idempotent: user already tagged this post with this label
        if (status === null) {
          return false;
        }
        await Promise.all([
          this.savePostTagsModel(postId, postTagsModel),
          this.updatePostCounts(postId, postTagsModel),
          UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: 1 } }),
          PostTtlModel.upsert({ id: postId, lastUpdatedAt: Date.now() }),
        ]);
        return true;
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create post tag', {
        service: ErrorService.Local,
        operation: 'create',
        context: { postId, label, taggerId },
        cause: error,
      });
    }

    if (mutated) {
      // Record this viewer change so mergeTags ignores stale Nexus responses
      // for the next ~5 minutes (until Nexus catches up).
      ViewerTagMarkerStorage.set({ pubky: taggerId, postId, label, op: HttpMethod.PUT });
    }

    return mutated;
  }

  /**
   * Removes a tag from a post and updates all related counts.
   *
   * - Removes the tagger from the specified tag
   * - Updates post counts (total tags, unique tags)
   * - Decrements the tagger's tagged count
   * - Removes the tag entirely if no taggers remain
   *
   * @param params.taggedId - Unique identifier of the post to remove tag from
   * @param params.label - Tag label to remove
   * @param params.taggerId - Unique identifier of the user removing the tag
   *
   * @returns {boolean} true if tag was deleted, false if nothing to delete (idempotent)
   * @throws {AppError} When post has no tags or user hasn't tagged with this label
   * @throws {DatabaseError} When database operations fail
   */
  static async delete({ taggedId: postId, label, taggerId }: TLocalTagParams): Promise<boolean> {
    // Check if post has tags before starting transaction
    const tagsData = await PostTagsModel.findById(postId);
    if (!tagsData) {
      return false; // Nothing to delete
    }

    const postTagsModel = new PostTagsModel(tagsData);
    const status = postTagsModel.removeTagger(label, taggerId);
    if (status === null) {
      return false; // User hasn't tagged this post with this label
    }

    try {
      await db.transaction('rw', this.TAG_TABLES, async () => {
        await this.savePostTagsModel(postId, postTagsModel);
        await this.updatePostCounts(postId, postTagsModel);
        await UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: -1 } });
        await PostTtlModel.upsert({ id: postId, lastUpdatedAt: Date.now() });
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to delete post tag', {
        service: ErrorService.Local,
        operation: 'delete',
        context: { postId, label, taggerId },
        cause: error,
      });
    }

    // Record this viewer change so mergeTags ignores stale Nexus responses
    // for the next ~5 minutes (until Nexus catches up).
    ViewerTagMarkerStorage.set({ pubky: taggerId, postId, label, op: HttpMethod.DELETE });
    return true;
  }

  /**
   * Saves the PostTagsModel to the database.
   *
   * @param postId - Unique identifier of the post
   * @param postTagsModel - The PostTagsModel instance to save
   * @private
   */
  private static async savePostTagsModel(postId: string, postTagsModel: PostTagsModel) {
    await PostTagsModel.upsert({
      id: postId,
      tags: postTagsModel.tags as NexusTag[],
    });
  }

  /**
   * Updates post counts based on the current tag state.
   *
   * This helper method calculates and updates the total tags and unique tags
   * for a post based on the current PostTagsModel state.
   *
   * @param postId - Unique identifier of the post
   * @param postTagsModel - The PostTagsModel instance with current tag data
   * @private
   */
  private static async updatePostCounts(postId: Pubky, postTagsModel: PostTagsModel) {
    const tags = postTagsModel.tags.reduce((sum, tag) => sum + tag.taggers_count, 0);
    const unique_tags = postTagsModel.tags.length;

    const countsExist = await PostCountsModel.findById(postId);
    if (countsExist) {
      await PostCountsModel.update(postId, {
        tags,
        unique_tags,
      });
    } else {
      // TODO: Maybe fetch counts from Nexus and reconcile local tag counts.
      Logger.warn('Post counts not found, skipping update', { postId });
    }
  }

  /**
   * Merges Nexus tags into local IndexedDB using a per-field policy:
   *
   * - `taggers_count`: replaced with the Nexus value (Nexus is authoritative
   *   for the total).
   * - Viewer's `relationship` and the viewer's entry in `taggers`: an active
   *   sessionStorage marker (set by `create` / `delete`) overrides; otherwise
   *   the Nexus value is used.
   * - Other users in `taggers`: union of existing + Nexus. The Nexus `taggers`
   *   array is a truncated top-N sample, so replacing would drop locally-cached
   *   taggers.
   * - Labels in IndexedDB but not in `tags`: left alone, since Nexus paginates
   *   by label and absent labels may exist on later pages.
   *
   * @param postId - Composite post ID
   * @param tags - Tags from the Nexus response
   * @param viewerId - Current viewer pubky for marker lookup. Null when the
   *   user is unauthenticated, in which case Nexus values are used as-is.
   */
  static async mergeTags({ postId, tags, viewerId }: { postId: string; tags: NexusTag[]; viewerId: Pubky | null }) {
    // Piggyback GC: drop expired markers so sessionStorage doesn't accumulate them.
    ViewerTagMarkerStorage.sweepExpired();

    try {
      await db.transaction('rw', [PostTagsModel.table], async () => {
        const existing = await PostTagsModel.findById(postId);
        const existingTags = existing?.tags ?? [];

        // Create a map of existing tags by label for quick lookup
        const tagMap = new Map<string, NexusTag>();
        for (const tag of existingTags) {
          tagMap.set(tag.label.toLowerCase(), tag);
        }

        // Merge new tags - update existing or add new
        for (const newTag of tags) {
          const key = newTag.label.toLowerCase();
          const existingTag = tagMap.get(key);

          // If the viewer just toggled this tag locally, the marker tells us
          // the intended viewer-state — trust it over a possibly stale Nexus
          // value for the next ~5 minutes.
          const marker = viewerId ? ViewerTagMarkerStorage.get({ pubky: viewerId, postId, label: newTag.label }) : null;
          const nexusSaysViewerIsTagger = Boolean(newTag.relationship);
          const viewerIsTagger = marker ? marker.op === HttpMethod.PUT : nexusSaysViewerIsTagger;

          // Other users: union of existing + Nexus, viewer excluded
          // (viewer's slot is decided by `viewerIsTagger`).
          const otherTaggers = new Set(
            [...(existingTag?.taggers ?? []), ...(newTag.taggers ?? [])].filter((tagger) => tagger !== viewerId),
          );
          const mergedTaggers: Pubky[] = Array.from(otherTaggers);
          if (viewerIsTagger && viewerId) {
            mergedTaggers.push(viewerId);
          }

          // Default: trust Nexus's count.
          // Exception: if the marker says the viewer is a tagger but Nexus
          // doesn't know yet, Nexus's count is one short — add 1. If the marker
          // says the viewer is NOT a tagger but Nexus still counts them, Nexus's
          // count is one too high — subtract 1. This keeps `taggers_count`
          // matching the final `taggers` / `relationship` we write below.
          let taggers_count = newTag.taggers_count;
          if (marker && viewerIsTagger !== nexusSaysViewerIsTagger) {
            taggers_count = viewerIsTagger ? taggers_count + 1 : Math.max(0, taggers_count - 1);
          }

          tagMap.set(key, {
            ...newTag,
            taggers_count,
            taggers: mergedTaggers,
            relationship: viewerIsTagger,
          });
        }

        // Convert map back to array
        const mergedTags = Array.from(tagMap.values());

        await PostTagsModel.upsert({
          id: postId,
          tags: mergedTags,
        });
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to merge post tags', {
        service: ErrorService.Local,
        operation: 'mergeTags',
        context: { postId },
        cause: error,
      });
    }
  }
}
