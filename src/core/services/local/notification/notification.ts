import type {
  TFlatNotificationList,
  TFlatNotifications,
  TParseNotificationsResult,
} from '@/application/notification/notification.types';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { NotificationModel } from '@/models/notification/notification';
import { NotificationType } from '@/models/notification/notification.types';
import type { TOlderThanQueryParams } from '@/services/local/notification/notification.types';
export class LocalNotificationService {
  private constructor() {}

  static async getOlderThan({ olderThan, limit }: TOlderThanQueryParams): Promise<TFlatNotificationList> {
    return await NotificationModel.getOlderThan(olderThan, limit);
  }

  /**
   * Retrieves all notifications from the local database ordered by timestamp descending.
   * @returns Promise resolving to array of all notifications
   */
  static async getAll(): Promise<TFlatNotificationList> {
    return await NotificationModel.getAll();
  }

  /**
   * Persists flat notifications to the local database.
   * @param notifications - Array of flat notifications to save
   */
  static async bulkSave({ flatNotifications }: TFlatNotifications): Promise<void> {
    await NotificationModel.bulkSave(flatNotifications);
  }

  /**
   * Counts unread notifications by querying IndexedDB for entries newer than lastRead.
   * @param lastRead - Timestamp of the last read notification
   * @returns Promise resolving to the total number of unread notifications
   */
  static async countUnreadSince(lastRead: number): Promise<number> {
    return await NotificationModel.countNewerThan(lastRead);
  }

  /**
   * Parses notifications to extract post and user references.
   * @param flatNotifications - Array of flat notifications to extract post and user references from
   * @returns Object containing related post IDs and user IDs
   */
  static parseNotifications({ flatNotifications }: TFlatNotifications): TParseNotificationsResult {
    // Handle duplicates
    const relatedPostIds = new Set<string>();
    const relatedUserIds = new Set<Pubky>();

    const addPostUri = (uri: string | undefined) => {
      if (!uri) return;
      const compositeId = buildCompositeIdFromPubkyUri({ uri, domain: CompositeIdDomain.POSTS });
      if (compositeId) {
        relatedPostIds.add(compositeId);
      }
    };

    for (const notification of flatNotifications) {
      switch (notification.type) {
        case NotificationType.Follow:
        case NotificationType.NewFriend:
          relatedUserIds.add(notification.followed_by);
          break;
        case NotificationType.TagPost:
          addPostUri(notification.post_uri);
          relatedUserIds.add(notification.tagged_by);
          break;
        case NotificationType.TagProfile:
          relatedUserIds.add(notification.tagged_by);
          break;
        case NotificationType.Reply:
          addPostUri(notification.reply_uri);
          relatedUserIds.add(notification.replied_by);
          break;
        case NotificationType.Repost:
          addPostUri(notification.repost_uri);
          relatedUserIds.add(notification.reposted_by);
          break;
        case NotificationType.Mention:
          addPostUri(notification.post_uri);
          relatedUserIds.add(notification.mentioned_by);
          break;
        case NotificationType.PostDeleted:
          addPostUri(notification.deleted_uri);
          relatedUserIds.add(notification.deleted_by);
          break;
        case NotificationType.PostEdited:
          addPostUri(notification.edited_uri);
          relatedUserIds.add(notification.edited_by);
          break;
        default:
          break;
      }
    }
    return {
      relatedPostIds: Array.from(relatedPostIds),
      relatedUserIds: Array.from(relatedUserIds),
    };
  }
}
