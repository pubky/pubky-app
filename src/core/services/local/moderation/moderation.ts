import * as Core from '@/core';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

export class LocalModerationService {
  private constructor() {}

  /**
   * Sets an item as un-blurred by the user.
   */
  static async setUnBlur(id: string): Promise<void> {
    try {
      const record = await Core.ModerationModel.findById(id);
      if (!record) {
        return;
      }
      await Core.ModerationModel.update(id, { is_blurred: false });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to unblur item', {
        service: ErrorService.Local,
        operation: 'setUnBlur',
        context: { id },
        cause: error,
      });
    }
  }

  /**
   * Gets the moderation state for an item.
   * Returns null if the item is not moderated.
   * Optionally filters by type.
   */
  static async getModerationRecord(id: string, type?: Core.ModerationType): Promise<Core.ModerationModelSchema | null> {
    try {
      const record = await Core.ModerationModel.findById(id);
      if (!record) return null;
      if (type && record.type !== type) return null;
      return record;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to get moderation record', {
        service: ErrorService.Local,
        operation: 'getModerationRecord',
        context: { id, type },
        cause: error,
      });
    }
  }

  /**
   * Gets the moderation records for multiple items.
   * Optionally filters by type.
   */
  static async getModerationRecords(ids: string[], type?: Core.ModerationType): Promise<Core.ModerationModelSchema[]> {
    try {
      const records = await Core.ModerationModel.findByIds(ids);
      if (type) {
        return records.filter((r) => r.type === type);
      }
      return records;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to get moderation records', {
        service: ErrorService.Local,
        operation: 'getModerationRecords',
        context: { ids, type },
        cause: error,
      });
    }
  }
}
