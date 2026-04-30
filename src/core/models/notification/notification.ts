import { Table } from 'dexie';
import * as Config from '@/config';
import { FlatNotification, NotificationType } from './notification.types';
import { Logger } from '@/libs/logger/logger';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { db } from '@/database/franky/franky';
// Primary key: business key (id) as string - provides natural deduplication
export class NotificationModel {
  static table: Table<FlatNotification> = db.table('notifications');

  type!: NotificationType;
  timestamp!: number;

  // User-specific fields (optional based on notification type)
  followed_by?: string;
  tagged_by?: string;
  tag_label?: string;
  post_uri?: string;
  parent_post_uri?: string;
  reply_uri?: string;
  reposted_by?: string;
  embed_uri?: string;
  repost_uri?: string;
  mentioned_by?: string;
  delete_source?: string;
  deleted_by?: string;
  deleted_uri?: string;
  linked_uri?: string;
  edit_source?: string;
  edited_by?: string;
  edited_uri?: string;

  constructor(notification: FlatNotification) {
    Object.assign(this, notification);
  }

  /**
   * Bulk save notifications to the database.
   * Uses business key (id) as primary key - duplicates are automatically handled via upsert.
   */
  static async bulkSave(notifications: FlatNotification[]) {
    if (notifications.length === 0) {
      return [];
    }

    // Filter out malformed notifications missing required fields
    const validNotifications = notifications.filter((n) => {
      const isValid = n.id && n.timestamp !== undefined && n.type !== undefined;
      if (!isValid) {
        Logger.warn('Skipping malformed notification', {
          hasId: !!n.id,
          hasTimestamp: n.timestamp !== undefined,
          hasType: n.type !== undefined,
        });
      }
      return isValid;
    });

    if (validNotifications.length === 0) {
      return [];
    }

    // bulkPut with business key as id handles duplicates automatically (upsert)
    return await this.table.bulkPut(validNotifications);
  }

  /**
   * Retrieves all notifications ordered by timestamp descending.
   * @returns Promise resolving to array of all notifications
   */
  static async getAll(): Promise<FlatNotification[]> {
    try {
      return await this.table.orderBy('timestamp').reverse().toArray();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, `Failed to read all notifications from ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'getAll',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }

  static async getRecent(limit: number = Config.NEXUS_NOTIFICATIONS_LIMIT): Promise<FlatNotification[]> {
    try {
      return await this.table.orderBy('timestamp').reverse().limit(limit).toArray();
    } catch (error) {
      throw Err.database(
        DatabaseErrorCode.QUERY_FAILED,
        `Failed to read recent notifications from ${this.table.name}`,
        {
          service: ErrorService.Local,
          operation: 'getRecent',
          context: { table: this.table.name, limit },
          cause: error,
        },
      );
    }
  }

  static async getByType(type: NotificationType): Promise<FlatNotification[]> {
    try {
      return await this.table.where('type').equals(type).toArray();
    } catch (error) {
      throw Err.database(
        DatabaseErrorCode.QUERY_FAILED,
        `Failed to read notifications by type from ${this.table.name}`,
        {
          service: ErrorService.Local,
          operation: 'getByType',
          context: { table: this.table.name, type },
          cause: error,
        },
      );
    }
  }

  static async getRecentByType(
    type: NotificationType,
    limit: number = Config.NEXUS_NOTIFICATIONS_LIMIT,
  ): Promise<FlatNotification[]> {
    try {
      return await this.table
        .where('type')
        .equals(type)
        .reverse()
        .sortBy('timestamp')
        .then((notifications) => notifications.slice(0, limit));
    } catch (error) {
      throw Err.database(
        DatabaseErrorCode.QUERY_FAILED,
        `Failed to read recent notifications by type from ${this.table.name}`,
        {
          service: ErrorService.Local,
          operation: 'getRecentByType',
          context: { table: this.table.name, type, limit },
          cause: error,
        },
      );
    }
  }

  /**
   * Counts notifications with a timestamp strictly greater than the given value.
   * Used to get the total unread count by passing the lastRead timestamp.
   */
  static async countNewerThan(timestamp: number): Promise<number> {
    try {
      return await this.table.where('timestamp').above(timestamp).count();
    } catch (error) {
      throw Err.database(
        DatabaseErrorCode.QUERY_FAILED,
        `Failed to count notifications newer than ${timestamp} from ${this.table.name}`,
        {
          service: ErrorService.Local,
          operation: 'countNewerThan',
          context: { table: this.table.name, timestamp },
          cause: error,
        },
      );
    }
  }

  /**
   * Retrieves notifications older than a given timestamp, ordered by timestamp descending.
   * Used for timestamp-based pagination.
   *
   * @param olderThan - Unix timestamp to get notifications older than. Use Infinity for initial load.
   * @param limit - Maximum number of notifications to return
   * @returns Promise resolving to array of notifications ordered by timestamp descending
   */
  static async getOlderThan(
    olderThan: number,
    limit: number = Config.NEXUS_NOTIFICATIONS_LIMIT,
  ): Promise<FlatNotification[]> {
    try {
      return await this.table.where('timestamp').below(olderThan).reverse().limit(limit).toArray();
    } catch (error) {
      throw Err.database(
        DatabaseErrorCode.QUERY_FAILED,
        `Failed to read notifications older than ${olderThan} from ${this.table.name}`,
        {
          service: ErrorService.Local,
          operation: 'getOlderThan',
          context: { table: this.table.name, olderThan, limit },
          cause: error,
        },
      );
    }
  }

  /**
   * Clear all notifications from the table.
   */
  static async clear(): Promise<void> {
    try {
      await this.table.clear();
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, `Failed to clear table ${this.table.name}`, {
        service: ErrorService.Local,
        operation: 'clear',
        context: { table: this.table.name },
        cause: error,
      });
    }
  }
}
