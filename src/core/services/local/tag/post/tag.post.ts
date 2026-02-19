import * as Core from '@/core';
import { DatabaseErrorCode, Err, ErrorService, Logger } from '@/libs';

export class LocalPostTagService {
  private static readonly TAG_TABLES = [
    Core.PostTagsModel.table,
    Core.PostCountsModel.table,
    Core.UserCountsModel.table,
    Core.PostTtlModel.table,
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
   * @throws {AppError} When user has already tagged this post with the same label
   * @throws {DatabaseError} When database operations fail
   */
  static async create({ taggedId: postId, label, taggerId }: Core.TLocalTagParams) {
    try {
      await Core.db.transaction('rw', this.TAG_TABLES, async () => {
        const postTagsModel = await Core.PostTagsModel.getOrCreate<string, Core.PostTagsModelSchema>(postId);
        const status = postTagsModel.addTagger(label, taggerId);
        // Idempotent: user already tagged this post with this label
        if (status === null) {
          return;
        }
        await Promise.all([
          this.savePostTagsModel(postId, postTagsModel),
          this.updatePostCounts(postId, postTagsModel),
          Core.UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: 1 } }),
          Core.PostTtlModel.upsert({ id: postId, lastUpdatedAt: Date.now() }),
        ]);
      });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create post tag', {
        service: ErrorService.Local,
        operation: 'create',
        context: { postId, label, taggerId },
        cause: error,
      });
    }
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
  static async delete({ taggedId: postId, label, taggerId }: Core.TLocalTagParams): Promise<boolean> {
    // Check if post has tags before starting transaction
    const tagsData = await Core.PostTagsModel.findById(postId);
    if (!tagsData) {
      return false; // Nothing to delete
    }

    const postTagsModel = new Core.PostTagsModel(tagsData);
    const status = postTagsModel.removeTagger(label, taggerId);
    if (status === null) {
      return false; // User hasn't tagged this post with this label
    }

    try {
      await Core.db.transaction('rw', this.TAG_TABLES, async () => {
        await this.savePostTagsModel(postId, postTagsModel);
        await this.updatePostCounts(postId, postTagsModel);
        await Core.UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: -1 } });
        await Core.PostTtlModel.upsert({ id: postId, lastUpdatedAt: Date.now() });
      });
      return true;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to delete post tag', {
        service: ErrorService.Local,
        operation: 'delete',
        context: { postId, label, taggerId },
        cause: error,
      });
    }
  }

  /**
   * Saves the PostTagsModel to the database.
   *
   * @param postId - Unique identifier of the post
   * @param postTagsModel - The PostTagsModel instance to save
   * @private
   */
  private static async savePostTagsModel(postId: string, postTagsModel: Core.PostTagsModel) {
    await Core.PostTagsModel.upsert({
      id: postId,
      tags: postTagsModel.tags as Core.NexusTag[],
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
  private static async updatePostCounts(postId: Core.Pubky, postTagsModel: Core.PostTagsModel) {
    const tags = postTagsModel.tags.reduce((sum, tag) => sum + tag.taggers_count, 0);
    const unique_tags = postTagsModel.tags.length;

    const countsExist = await Core.PostCountsModel.findById(postId);
    if (countsExist) {
      await Core.PostCountsModel.update(postId, {
        tags,
        unique_tags,
      });
    } else {
      // TODO: Maybe fetch counts from Nexus and reconcile local tag counts.
      Logger.warn('Post counts not found, skipping update', { postId });
    }
  }

  /**
   * Merges new tags from Nexus with existing local tags.
   * Updates existing tags or adds new ones without removing any.
   *
   * @param postId - Unique identifier of the post
   * @param tags - Array of NexusTags to merge
   */
  static async mergeTags({ postId, tags }: { postId: string; tags: Core.NexusTag[] }) {
    try {
      await Core.db.transaction('rw', [Core.PostTagsModel.table], async () => {
        const existing = await Core.PostTagsModel.findById(postId);
        const existingTags = existing?.tags ?? [];

        // Create a map of existing tags by label for quick lookup
        const tagMap = new Map<string, Core.NexusTag>();
        for (const tag of existingTags) {
          tagMap.set(tag.label.toLowerCase(), tag);
        }

        // Merge new tags - update existing or add new
        for (const newTag of tags) {
          const key = newTag.label.toLowerCase();
          const existingTag = tagMap.get(key);

          if (existingTag) {
            // Merge taggers - combine unique taggers
            const mergedTaggers = [...new Set([...(existingTag.taggers ?? []), ...(newTag.taggers ?? [])])];
            tagMap.set(key, {
              ...existingTag,
              ...newTag,
              taggers: mergedTaggers,
              taggers_count: Math.max(existingTag.taggers_count ?? 0, newTag.taggers_count ?? mergedTaggers.length),
            });
          } else {
            tagMap.set(key, newTag);
          }
        }

        // Convert map back to array
        const mergedTags = Array.from(tagMap.values());

        await Core.PostTagsModel.upsert({
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
