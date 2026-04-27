import * as Core from '@/core';
import { LastReadResult } from 'pubky-app-specs';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';

export class NotificationApplication {
  private constructor() {} // Prevent instantiation

  /**
   * Retrieves notifications from the nexus service and persists them locally,
   * then returns the count of unread notifications and the newest notification timestamp.
   *
   * @param params.userId - The user ID to fetch notifications for
   * @param params.lastPolledTimestamp - Polling cursor passed as `end` to Nexus (advances after each poll)
   * @param params.lastRead - Read/unread boundary used to count unread notifications
   * @returns Promise resolving to unread count and the newest notification timestamp
   */
  static async fetchNotifications({
    userId,
    lastPolledTimestamp,
    lastRead,
  }: Core.TNotificationApplicationNotificationsParams): Promise<Core.TFetchNotificationsResult> {
    const notifications = await Core.NexusUserService.notifications({ user_id: userId, end: lastPolledTimestamp });
    const flatNotifications = await this.fetchMissingEntities({ notifications, viewerId: userId });
    return this.persistAndSummarize({ notifications, lastRead, flatNotifications });
  }
  /**
   * Updates the lastRead timestamp on the homeserver to mark all notifications as read.
   * This is a fire-and-forget operation - homeserver errors are logged but don't block.
   *
   * @param pubky - The user's public key
   * @returns The new lastRead timestamp
   */
  static markAllAsRead({ meta, last_read }: LastReadResult) {
    Core.HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: last_read.toJson() }).catch(
      (error) => Logger.warn('Failed to update lastRead on homeserver', { error }),
    );
  }

  /**
   * Retrieves all notifications from the local cache.
   * @returns Promise resolving to all notifications ordered by timestamp descending
   */
  static async getAllFromCache(): Promise<Core.FlatNotification[]> {
    return await Core.LocalNotificationService.getAll();
  }

  /**
   * Retrieves notifications from cache if available, otherwise fetches from Nexus.
   * Follows a cache-first pattern similar to stream posts.
   *
   * Flow:
   * 1. Query cache for notifications older than the given timestamp
   * 2. If cache has enough items, return immediately (full cache hit)
   * 3. If cache has partial items, fetch remaining from Nexus (partial cache hit)
   * 4. If cache is empty, fetch all from Nexus (cache miss)
   * 5. Persist fetched notifications and return combined result
   *
   * @param params - Parameters containing userId, olderThan timestamp, and limit
   * @returns Promise resolving to notifications and next olderThan for pagination
   */
  static async getOrFetchNotifications({
    userId,
    olderThan,
    limit,
  }: Core.TGetOrFetchNotificationsParams): Promise<Core.TGetOrFetchNotificationsResponse> {
    // Try to get notifications from cache
    const flatNotifications = await Core.LocalNotificationService.getOlderThan({ olderThan, limit });

    // Full cache hit - return cached results
    if (flatNotifications.length === limit) {
      const nextOlderThan = flatNotifications[flatNotifications.length - 1]?.timestamp;
      return { flatNotifications, olderThan: nextOlderThan };
    }

    // Partial cache hit - fetch remaining from Nexus
    if (flatNotifications.length > 0 && flatNotifications.length < limit) {
      return await this.partialCacheHit({ userId, limit, flatNotifications });
    }

    // Cache miss - fetch all from Nexus
    return await this.fetchFromNexus({ userId, olderThan, limit });
  }

  /**
   * Persists flat notifications to IndexedDB, counts unread, and computes the
   * next poll cursor
   */
  static async persistAndSummarize({
    notifications,
    lastRead,
    flatNotifications: precomputed,
  }: Core.TPersistAndSummarizeParams): Promise<Core.TFetchNotificationsResult> {
    const flatNotifications = precomputed ?? this.toSupportedFlatNotifications(notifications);
    await Core.LocalNotificationService.bulkSave({ flatNotifications });
    const unread = await Core.LocalNotificationService.countUnreadSince(lastRead);
    const nextPollCursor = notifications.length > 0 ? notifications[0].timestamp + 1 : undefined;
    return { unread, nextPollCursor };
  }

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  /**
   * Handles partial cache hits by fetching remaining notifications from Nexus.
   */
  private static async partialCacheHit({
    userId,
    limit,
    flatNotifications,
  }: Core.TNotificationsPartialCacheHitParams): Promise<Core.TGetOrFetchNotificationsResponse> {
    const lastCachedTimestamp = flatNotifications[flatNotifications.length - 1]?.timestamp;
    const remainingLimit = limit - flatNotifications.length;

    // Fetch remaining from Nexus
    const { flatNotifications: nexusFlatNotifications, olderThan: nextOlderThan } = await this.fetchFromNexus({
      userId,
      olderThan: lastCachedTimestamp,
      limit: remainingLimit,
    });

    // Combine cached and fetched, ensuring no duplicates by id (business key)
    const seenIds = new Set(flatNotifications.map((n) => n.id));
    const uniqueNexusNotifications = nexusFlatNotifications.filter((n) => !seenIds.has(n.id));
    const combinedNotifications = [...flatNotifications, ...uniqueNexusNotifications];

    return { flatNotifications: combinedNotifications, olderThan: nextOlderThan };
  }

  /**
   * Fetches notifications from Nexus and persists them to cache.
   */
  private static async fetchFromNexus({
    userId,
    olderThan,
    limit,
  }: {
    userId: Core.Pubky;
    olderThan: number;
    limit: number;
  }): Promise<Core.TGetOrFetchNotificationsResponse> {
    try {
      // Fetch from Nexus using skip/limit pagination
      const notifications = await Core.NexusUserService.notifications({
        user_id: userId,
        limit,
        start: olderThan === Infinity ? undefined : olderThan,
      });

      if (notifications.length === 0) {
        return { flatNotifications: [], olderThan: undefined };
      }

      const flatNotifications = await this.fetchMissingEntities({ notifications, viewerId: userId });

      // IMPORTANT: Save notifications AFTER fetching related entities. If we save notifications first,
      // useLiveQuery will trigger re-renders in components, but referenced posts/users won't be
      // available yet, causing incomplete UI states. By persisting related entities first, everything is
      // ready when the re-render happens.
      try {
        await Core.LocalNotificationService.bulkSave({ flatNotifications });
      } catch (error) {
        Logger.warn('Failed to persist notifications to cache', { error });
        // Continue - we still return the fetched notifications for display
      }

      // Calculate next olderThan from the oldest notification in this batch
      const nextOlderThan = flatNotifications[flatNotifications.length - 1]?.timestamp;

      // Decrement the timestamp. If not we will get duplicated notification. Infinity is used for initial load.
      return { flatNotifications, olderThan: nextOlderThan - 1 };
    } catch (error) {
      Logger.warn('Failed to fetch notifications from Nexus', { userId, olderThan, limit, error });
      return { flatNotifications: [], olderThan: undefined };
    }
  }

  /**
   * Fetches posts and users referenced in notifications that are not yet persisted in cache.
   *
   * @param notifications - Array of flat notifications to extract post and user references from
   */
  static async fetchMissingEntities({
    notifications,
    viewerId,
  }: Core.TFetchMissingEntitiesParams): Promise<Core.TFlatNotificationList> {
    const flatNotifications = this.toSupportedFlatNotifications(notifications);

    const { relatedPostIds, relatedUserIds } = Core.LocalNotificationService.parseNotifications({ flatNotifications });

    const notPersistedPostIds = await Core.LocalStreamPostsService.getNotPersistedPostsInCache(relatedPostIds);
    const notPersistedUserIds = await Core.LocalStreamUsersService.getNotPersistedUsersInCache(relatedUserIds);

    if (notPersistedPostIds.length > 0) {
      await Core.PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds: notPersistedPostIds,
        viewerId,
      });
    }

    if (notPersistedUserIds.length > 0) {
      await Core.UserStreamApplication.fetchMissingUsersFromNexus({ cacheMissUserIds: notPersistedUserIds, viewerId });
    }
    return flatNotifications;
  }

  /**
   * Transforms Nexus notifications to flat format and filters out unsupported types
   * (e.g., lost_friend from the server).
   */
  static toSupportedFlatNotifications(notifications: Core.NexusNotification[]): Core.TFlatNotificationList {
    const supportedTypes = Object.values(Core.NotificationType) as string[];
    return notifications
      .map((n) => Core.NotificationNormalizer.toFlatNotification(n))
      .filter((n) => supportedTypes.includes(n.type));
  }
}
