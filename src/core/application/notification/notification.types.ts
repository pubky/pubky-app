import type { Pubky } from '@/models/models.types';
import type { FlatNotification } from '@/models/notification/notification.types';
import type { TOlderThanQueryParams } from '@/services/local/notification/notification.types';
import type { NexusNotification } from '@/services/nexus/nexus.types';
export type TNotificationApplicationNotificationsParams = {
  userId: Pubky;
  lastPolledTimestamp: number | undefined;
  lastRead: number;
};

/**
 * Result from fetchNotifications containing unread count and the next poll cursor.
 *
 * @property unread - Number of unread notifications (those newer than lastRead)
 * @property nextPollCursor - Next polling cursor (newest timestamp + 1 to avoid refetch), undefined if no notifications
 */
export type TFetchNotificationsResult = {
  unread: number;
  nextPollCursor: number | undefined;
};

export type TNotificationsPartialCacheHitParams = {
  userId: Pubky;
  limit: number;
  flatNotifications: TFlatNotificationList;
};

/**
 * Parameters for timestamp-based notification pagination.
 *
 * @property userId - The user ID to fetch notifications for
 * @property olderThan - Unix timestamp to get notifications older than.
 *                       Use Infinity for initial load (most recent notifications).
 *                       Use the timestamp of the last notification for pagination.
 * @property limit - Maximum number of notifications to return
 */
export type TGetOrFetchNotificationsParams = TOlderThanQueryParams & {
  userId: Pubky;
};

export type TFlatNotificationList = FlatNotification[];

export type TFlatNotifications = {
  flatNotifications: TFlatNotificationList;
};

/**
 * Response from getOrFetchNotifications containing notifications and pagination info.
 *
 * @property notifications - Array of notifications ordered by timestamp descending
 * @property olderThan - Timestamp to use for next page, undefined if no more results
 */
export type TGetOrFetchNotificationsResponse = TFlatNotifications & {
  olderThan: number | undefined;
};

export type TPersistAndSummarizeParams = {
  notifications: NexusNotification[];
  lastRead: number;
  flatNotifications?: TFlatNotificationList;
};

export type TFetchMissingEntitiesParams = {
  notifications: NexusNotification[];
  viewerId: Pubky;
};

export type TParseNotificationsResult = {
  relatedPostIds: string[];
  relatedUserIds: Pubky[];
};
