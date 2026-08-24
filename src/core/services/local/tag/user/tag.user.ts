import { db } from '@/database/franky/franky';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { Pubky } from '@/models/models.types';
import { UserCountsModel } from '@/models/user/counts/userCounts';
import { UserTagsModel, type UserTagsModelSchema } from '@/models/user/tags/userTags';
import { postStreamDirtyRegistry } from '@/services/local/stream/posts/postStreamDirtyRegistry';
import type { TLocalTagParams } from '@/services/local/tag/tag.types';
import type { NexusTag } from '@/services/nexus/nexus.types';

export class LocalUserTagService {
  private static readonly TAG_TABLES = [UserTagsModel.table, UserCountsModel.table] as const;

  static async create({ taggerId, taggedId, label }: TLocalTagParams): Promise<boolean> {
    try {
      const didCreate = await db.transaction('rw', this.TAG_TABLES, async () => {
        const userTagsModel = await UserTagsModel.getOrCreate<Pubky, UserTagsModelSchema>(taggedId);
        const tagExists = userTagsModel.addTagger(label, taggerId);

        // Idempotent: user already tagged this user with this label
        if (tagExists === null) {
          return false;
        }
        await Promise.all([
          this.saveUserTagsModel(taggedId, userTagsModel),
          UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: 1 } }),
          UserCountsModel.updateCounts({
            userId: taggedId,
            countChanges: { tags: 1, unique_tags: !tagExists ? 1 : undefined },
          }),
        ]);
        return true;
      });

      if (didCreate) {
        // Profile tags define wot_domain (Tagged as) membership. Defer cache
        // invalidation to each domain stream's next initial load (#2302).
        postStreamDirtyRegistry.markDirty('profile_tag');
      }
      return didCreate;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to create user tag', {
        service: ErrorService.Local,
        operation: 'create',
        context: { taggedId, label, taggerId },
        cause: error,
      });
    }
  }

  /**
   * Removes a tag from a user and updates all related counts.
   *
   * @param params.taggerId - Unique identifier of the user removing the tag
   * @param params.taggedId - Unique identifier of the user being untagged
   * @param params.label - Tag label to remove
   *
   * @returns {boolean} true if tag was deleted, false if nothing to delete (idempotent)
   * @throws {AppError} When database operations fail
   */
  static async delete({ taggerId, taggedId, label }: TLocalTagParams): Promise<boolean> {
    // Check if user has tags before starting transaction
    const userTagsModel = await UserTagsModel.findById(taggedId);
    if (!userTagsModel) {
      return false; // Nothing to delete
    }

    const lastTaggerOnTag = userTagsModel.removeTagger(label, taggerId);
    if (lastTaggerOnTag === null) {
      return false; // User hasn't tagged this user with this label
    }

    try {
      await db.transaction('rw', this.TAG_TABLES, async () => {
        await Promise.all([
          this.saveUserTagsModel(taggedId, userTagsModel),
          UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: -1 } }),
          UserCountsModel.updateCounts({
            userId: taggedId,
            countChanges: { tags: -1, unique_tags: lastTaggerOnTag ? -1 : undefined },
          }),
        ]);
      });
      // Profile tags define wot_domain (Tagged as) membership. Defer cache
      // invalidation to each domain stream's next initial load (#2302).
      postStreamDirtyRegistry.markDirty('profile_tag');
      return true;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to delete user tag', {
        service: ErrorService.Local,
        operation: 'delete',
        context: { taggedId, label, taggerId },
        cause: error,
      });
    }
  }

  /**
   * Saves the UserTagsModel to the database.
   *
   * @param taggedId - Unique identifier of the tagged user
   * @param userTagsModel - The UserTagsModel instance to save
   * @private
   */
  private static async saveUserTagsModel(userId: Pubky, userTagsModel: UserTagsModel) {
    await UserTagsModel.upsert({
      id: userId,
      tags: userTagsModel.tags as NexusTag[],
    });
  }

  /**
   * Find which users don't have tags persisted in cache.
   * Used to identify missing tag data that needs to be fetched.
   * @param userIds - Array of user IDs to check
   * @returns Array of user IDs that don't have tags in cache
   */
  static async getNotPersistedUserTagsInCache(userIds: Pubky[]): Promise<Pubky[]> {
    if (userIds.length === 0) return [];

    const existingTags = await UserTagsModel.findByIdsPreserveOrder(userIds);
    return userIds.filter((_userId, index) => existingTags[index] === undefined);
  }
}
