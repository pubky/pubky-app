import * as Core from '@/core';
import { DatabaseErrorCode, Err, ErrorService } from '@/libs';

export class LocalUserTagService {
  private static readonly TAG_TABLES = [Core.UserTagsModel.table, Core.UserCountsModel.table] as const;

  static async create({ taggerId, taggedId, label }: Core.TLocalTagParams): Promise<boolean> {
    try {
      return await Core.db.transaction('rw', this.TAG_TABLES, async () => {
        const userTagsModel = await Core.UserTagsModel.getOrCreate<Core.Pubky, Core.UserTagsModelSchema>(taggedId);
        const tagExists = userTagsModel.addTagger(label, taggerId);

        // Idempotent: user already tagged this user with this label
        if (tagExists === null) {
          return false;
        }
        await Promise.all([
          this.saveUserTagsModel(taggedId, userTagsModel),
          Core.UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: 1 } }),
          Core.UserCountsModel.updateCounts({
            userId: taggedId,
            countChanges: { tags: 1, unique_tags: !tagExists ? 1 : undefined },
          }),
        ]);
        return true;
      });
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
  static async delete({ taggerId, taggedId, label }: Core.TLocalTagParams): Promise<boolean> {
    // Check if user has tags before starting transaction
    const userTagsModel = await Core.UserTagsModel.findById(taggedId);
    if (!userTagsModel) {
      return false; // Nothing to delete
    }

    const lastTaggerOnTag = userTagsModel.removeTagger(label, taggerId);
    if (lastTaggerOnTag === null) {
      return false; // User hasn't tagged this user with this label
    }

    try {
      await Core.db.transaction('rw', this.TAG_TABLES, async () => {
        await Promise.all([
          this.saveUserTagsModel(taggedId, userTagsModel),
          Core.UserCountsModel.updateCounts({ userId: taggerId, countChanges: { tagged: -1 } }),
          Core.UserCountsModel.updateCounts({
            userId: taggedId,
            countChanges: { tags: -1, unique_tags: lastTaggerOnTag ? -1 : undefined },
          }),
        ]);
      });
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
  private static async saveUserTagsModel(userId: Core.Pubky, userTagsModel: Core.UserTagsModel) {
    await Core.UserTagsModel.upsert({
      id: userId,
      tags: userTagsModel.tags as Core.NexusTag[],
    });
  }

  /**
   * Find which users don't have tags persisted in cache.
   * Used to identify missing tag data that needs to be fetched.
   * @param userIds - Array of user IDs to check
   * @returns Array of user IDs that don't have tags in cache
   */
  static async getNotPersistedUserTagsInCache(userIds: Core.Pubky[]): Promise<Core.Pubky[]> {
    if (userIds.length === 0) return [];

    const existingTags = await Core.UserTagsModel.findByIdsPreserveOrder(userIds);
    return userIds.filter((_userId, index) => existingTags[index] === undefined);
  }
}
