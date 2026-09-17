import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isAppError } from '@/libs/error/error.utils';
import { PostCountsModel } from '@/models/post/counts/postCounts';
import { PostTagsModel, type PostTagsModelSchema } from '@/models/post/tags/postTags';
import { PostTtlModel } from '@/models/post/ttl/postTtl';
import { UserCountsModel } from '@/models/user/counts/userCounts';
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
   * @returns {boolean} true if local state changed; false if the tagger already had this tag (idempotent — no writes)
   * @throws {DatabaseError} When database operations fail
   */
  static async create({
    taggedId: postId,
    label,
    taggerId,
    mutationId,
    expectedMutationId,
    synced = false,
    isCurrent,
  }: TLocalTagParams): Promise<boolean> {
    // True only when the transaction actually changed IndexedDB state.
    let mutated = false;
    try {
      mutated = await db.transaction('rw', this.TAG_TABLES, async () => {
        const postTagsModel = await PostTagsModel.getOrCreate<string, PostTagsModelSchema>(postId);
        if ((isCurrent && !isCurrent()) || !postTagsModel.ownsMutation(label, taggerId, expectedMutationId))
          return false;
        const status = postTagsModel.addTagger(label, taggerId);
        // Idempotent: user already tagged this post with this label
        if (status === null && expectedMutationId === undefined) {
          return false;
        }
        postTagsModel.recordMutation(label, taggerId, true, mutationId, synced);
        if (status === null) {
          await this.savePostTagsModel(postId, postTagsModel);
          return true;
        }
        await Promise.all([
          this.savePostTagsModel(postId, postTagsModel),
          PostCountsModel.updateCounts({
            postCompositeId: postId,
            countChanges: { tags: 1, unique_tags: !status ? 1 : undefined },
          }),
          UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: 1 } }),
          PostTtlModel.upsert({ id: postId, lastUpdatedAt: Date.now() }),
        ]);
        return true;
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create post tag', {
        service: ErrorService.Local,
        operation: 'create',
        context: { postId, label, taggerId },
        cause: error,
      });
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
   * @throws {DatabaseError} When database operations fail
   */
  static async delete({
    taggedId: postId,
    label,
    taggerId,
    mutationId,
    expectedMutationId,
    synced = false,
    isCurrent,
  }: TLocalTagParams): Promise<boolean> {
    let deleted: boolean;
    try {
      deleted = await db.transaction('rw', this.TAG_TABLES, async () => {
        const postTagsModel = await PostTagsModel.findById(postId);
        if (!postTagsModel) return false;
        if ((isCurrent && !isCurrent()) || !postTagsModel.ownsMutation(label, taggerId, expectedMutationId))
          return false;
        const status = postTagsModel.removeTagger(label, taggerId);
        if (status === null && expectedMutationId === undefined) return false;
        postTagsModel.recordMutation(label, taggerId, false, mutationId, synced);
        await this.savePostTagsModel(postId, postTagsModel);
        if (status === null) return true;
        await PostCountsModel.updateCounts({
          postCompositeId: postId,
          countChanges: { tags: -1, unique_tags: status ? -1 : undefined },
        });
        await UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: -1 } });
        await PostTtlModel.upsert({ id: postId, lastUpdatedAt: Date.now() });
        return true;
      });
    } catch (error) {
      if (isAppError(error)) throw error;
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to delete post tag', {
        service: ErrorService.Local,
        operation: 'delete',
        context: { postId, label, taggerId },
        cause: error,
      });
    }
    return deleted;
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
      cache: postTagsModel.cache,
      mutations: postTagsModel.mutations,
    });
  }
}
