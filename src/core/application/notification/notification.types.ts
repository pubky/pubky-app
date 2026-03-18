import * as Core from '@/core';

export type TNotificationApplicationNotificationsParams = {
  userId: Core.Pubky;
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
  userId: Core.Pubky;
  limit: number;
  flatNotifications: Core.TFlatNotificationList;
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
export type TGetOrFetchNotificationsParams = Core.TOlderThanQueryParams & {
  userId: Core.Pubky;
};

export type TFlatNotificationList = Core.FlatNotification[];

export type TFlatNotifications = {
  flatNotifications: Core.TFlatNotificationList;
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
  notifications: Core.NexusNotification[];
  lastRead: number;
  flatNotifications?: Core.TFlatNotificationList;
};

export type TFetchMissingEntitiesParams = {
  notifications: Core.NexusNotification[];
  viewerId: Core.Pubky;
};

export type TParseNotificationsResult = {
  relatedPostIds: string[];
  relatedUserIds: Core.Pubky[];
};
