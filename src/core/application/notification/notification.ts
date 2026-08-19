import { LastReadResult } from 'pubky-app-specs';
import type {
  TFetchMissingEntitiesParams,
  TFetchNotificationsResult,
  TFlatNotificationList,
  TGetOrFetchNotificationsParams,
  TGetOrFetchNotificationsResponse,
  TNotificationApplicationNotificationsParams,
  TNotificationsPartialCacheHitParams,
  TPersistAndSummarizeParams,
} from '@/application/notification/notification.types';
import { PostStreamApplication } from '@/application/stream/posts/post';
import { UserStreamApplication } from '@/application/stream/users/users';
import { HttpMethod } from '@/libs/http/http.types';
import { Logger } from '@/libs/logger/logger';
import { CompositeIdDomain, type Pubky } from '@/models/models.types';
import { buildCompositeIdFromPubkyUri } from '@/models/models.utils';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { LocalNotificationService } from '@/services/local/notification/notification';
import { LocalStreamPostsService } from '@/services/local/stream/posts/posts';
import { LocalStreamUsersService } from '@/services/local/stream/users/users';
import type { NexusNotification } from '@/services/nexus/nexus.types';
import { NexusUserService } from '@/services/nexus/user/user';

const MAX_FETCH_ROUNDS = 10;

export class NotificationApplication {
  private constructor() {} // Prevent instantiation

  /**
   * Retrieves notifications from the nexus service and persists them locally,
   * then returns the preference-filtered unread count and the newest notification timestamp.
   *
   * @param params.userId - The user ID to fetch notifications for
   * @param params.lastPolledTimestamp - Polling cursor passed as `end` to Nexus (advances after each poll)
   * @param params.lastRead - Read/unread boundary used to count unread notifications
   * @param params.allowedTypes - Notification types to include in the unread count
   * @returns Promise resolving to filtered unread count and the newest notification timestamp
   */
  static async fetchNotifications({
    userId,
    lastPolledTimestamp,
    lastRead,
    allowedTypes,
  }: TNotificationApplicationNotificationsParams): Promise<TFetchNotificationsResult> {
    const notifications = await NexusUserService.notifications({ user_id: userId, end: lastPolledTimestamp });
    const flatNotifications = await this.fetchMissingEntities({ notifications, viewerId: userId });
    return this.persistAndSummarize({ notifications, lastRead, allowedTypes, flatNotifications });
  }
  /**
   * Persists the lastRead timestamp on the homeserver to mark all notifications as read.
   * Awaits the write and lets failures propagate so the caller can decide whether to update
   * local state. Callers must ensure an active session that owns the path exists first.
   *
   * @param lastRead - The lastRead result (target URL + payload) built for the current user
   */
  static async markAllAsRead({ meta, last_read }: LastReadResult): Promise<void> {
    await HomeserverService.request({ method: HttpMethod.PUT, url: meta.url, bodyJson: last_read.toJson() });
  }

  /**
   * Retrieves all notifications from the local cache.
   * @returns Promise resolving to all notifications ordered by timestamp descending
   */
  static async getAllFromCache(): Promise<FlatNotification[]> {
    return await LocalNotificationService.getAll();
  }

  /**
   * Counts unread notifications filtered by allowed types.
   * Used by Controllers to compute the preference-filtered badge count.
   *
   * @param lastRead - Timestamp of the last read notification
   * @param allowedTypes - Notification types to include in the count
   * @returns Promise resolving to the filtered unread count
   */
  static async countFilteredUnreadSince(lastRead: number, allowedTypes: NotificationType[]): Promise<number> {
    return await LocalNotificationService.countFilteredUnreadSince(lastRead, allowedTypes);
  }

  /**
   * Retrieves notifications from cache if available, otherwise fetches from Nexus.
   * Follows a cache-first pattern similar to stream posts.
   *
   * When `allowedTypes` is provided (e.g., preference filtering), continues fetching
   * successive pages and accumulates matching notifications until reaching `limit`
   * or until there are no more pages, capped at MAX_FETCH_ROUNDS.
   * This handles the case where filtering removes all items from early pages —
   * without looping, the UI would show "no notifications" even though later pages
   * may contain matching items.
   * Follows the same pattern as PostStreamQueue.collect().
   *
   * Flow (per page):
   * 1. Query cache for notifications older than the given timestamp
   * 2. If cache has enough items, return immediately (full cache hit)
   * 3. If cache has partial items, fetch remaining from Nexus (partial cache hit)
   * 4. If cache is empty, fetch all from Nexus (cache miss)
   * 5. Persist fetched notifications and return combined result
   *
   * @param params - Parameters containing userId, olderThan timestamp, limit, and optional allowedTypes
   * @returns Promise resolving to notifications and next olderThan for pagination
   */
  static async getOrFetchNotifications({
    userId,
    olderThan,
    limit,
    allowedTypes,
  }: TGetOrFetchNotificationsParams): Promise<TGetOrFetchNotificationsResponse> {
    if (allowedTypes === undefined) {
      // No preference constraints are applied (e.g., all notification settings are enabled),
      // so use the normal single-page fetch path.
      return this.getOrFetchPage({ userId, olderThan, limit });
    }
    if (allowedTypes.length === 0) {
      // All notification types are disabled by user preferences, so skip pagination calls.
      return { flatNotifications: [], olderThan: undefined };
    }
    // Preference filtering - fetch filtered notifications
    return this.collectPages({ userId, olderThan, limit, allowedTypes });
  }

  /**
   * Get or fetch pages until `limit` filtered notifications are collected or no more pages exist.
   * Capped at MAX_FETCH_ROUNDS to prevent runaway requests.
   */
  private static async collectPages({
    userId,
    olderThan,
    limit,
    allowedTypes,
  }: {
    userId: Pubky;
    olderThan: number;
    limit: number;
    allowedTypes: NotificationType[];
  }): Promise<TGetOrFetchNotificationsResponse> {
    let cursor: number | undefined = olderThan;
    const collected: FlatNotification[] = [];

    // TODO(notification): #1746 - Discuss with Product/UI/UX. This can return no visible
    // notifications while still allowing "load more" when many pages are filtered out.
    // Example: user only enables "New Friend", but the next 10 pages (300 items) have none.
    // Decide what users should see in that case.
    for (let attempt = 0; attempt < MAX_FETCH_ROUNDS && collected.length < limit; attempt++) {
      const remaining = limit - collected.length;
      const response = await this.getOrFetchPage({
        userId,
        olderThan: cursor ?? Infinity,
        limit,
      });

      const filtered = this.filterByAllowedTypes(response.flatNotifications, allowedTypes);

      if (filtered.length > 0) {
        const taken = filtered.slice(0, remaining);
        collected.push(...taken);

        // When we slice (more matches than remaining), set cursor from the last
        // included item so skipped matches on this page are reachable on "load more".
        if (filtered.length > remaining) {
          cursor = taken[taken.length - 1].timestamp - 1;
          break;
        }
      }

      cursor = response.olderThan;
      // cursor === undefined means no more pages to fetch
      if (cursor === undefined) break;
    }

    return { flatNotifications: collected, olderThan: cursor };
  }

  /**
   * Fetches a single page of notifications using cache-first strategy.
   */
  private static async getOrFetchPage({
    userId,
    olderThan,
    limit,
  }: {
    userId: Pubky;
    olderThan: number;
    limit: number;
  }): Promise<TGetOrFetchNotificationsResponse> {
    // Try to get notifications from cache
    const flatNotifications = await LocalNotificationService.getOlderThan({ olderThan, limit });

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
   * Persists flat notifications to IndexedDB, counts preference-filtered unread,
   * and computes the next poll cursor.
   */
  static async persistAndSummarize({
    notifications,
    lastRead,
    allowedTypes,
    flatNotifications: precomputed,
  }: TPersistAndSummarizeParams): Promise<TFetchNotificationsResult> {
    const flatNotifications = precomputed ?? this.toSupportedFlatNotifications(notifications);
    await LocalNotificationService.bulkSave({ flatNotifications });
    const unread = await LocalNotificationService.countFilteredUnreadSince(lastRead, allowedTypes);
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
  }: TNotificationsPartialCacheHitParams): Promise<TGetOrFetchNotificationsResponse> {
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
    userId: Pubky;
    olderThan: number;
    limit: number;
  }): Promise<TGetOrFetchNotificationsResponse> {
    try {
      // Fetch from Nexus using skip/limit pagination
      const notifications = await NexusUserService.notifications({
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
        await LocalNotificationService.bulkSave({ flatNotifications });
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
   * Edited posts are refetched even on a cache hit: the notification itself proves the
   * cached copy predates the edit, and the local-first read path never revalidates a
   * cached post, so without this the notification row would render the pre-edit content.
   *
   * @param notifications - Array of flat notifications to extract post and user references from
   */
  static async fetchMissingEntities({
    notifications,
    viewerId,
  }: TFetchMissingEntitiesParams): Promise<TFlatNotificationList> {
    const flatNotifications = this.toSupportedFlatNotifications(notifications);

    const { relatedPostIds, relatedUserIds } = LocalNotificationService.parseNotifications({ flatNotifications });

    const notPersistedPostIds = await LocalStreamPostsService.getNotPersistedPostsInCache(relatedPostIds);
    const notPersistedUserIds = await LocalStreamUsersService.getNotPersistedUsersInCache(relatedUserIds);

    const editedPostIds = flatNotifications.flatMap((n) =>
      n.type === NotificationType.PostEdited
        ? (buildCompositeIdFromPubkyUri({ uri: n.edited_uri, domain: CompositeIdDomain.POSTS }) ?? [])
        : [],
    );

    const postIdsToFetch = [...new Set([...notPersistedPostIds, ...editedPostIds])];

    if (postIdsToFetch.length > 0) {
      await PostStreamApplication.fetchMissingPostsFromNexus({
        cacheMissPostIds: postIdsToFetch,
        viewerId,
      });
    }

    if (notPersistedUserIds.length > 0) {
      await UserStreamApplication.fetchMissingUsersFromNexus({ cacheMissUserIds: notPersistedUserIds, viewerId });
    }
    return flatNotifications;
  }

  /**
   * Transforms Nexus notifications to flat format and filters out unsupported types
   * (e.g., lost_friend from the server).
   */
  static toSupportedFlatNotifications(notifications: NexusNotification[]): TFlatNotificationList {
    const supportedTypes = Object.values(NotificationType) as string[];
    return notifications
      .map((n) => NotificationNormalizer.toFlatNotification(n))
      .filter((n) => supportedTypes.includes(n.type));
  }

  /**
   * Applies user preference filtering to a page of notifications.
   * Only called from collectPages where allowedTypes is guaranteed non-empty.
   */
  private static filterByAllowedTypes(
    notifications: FlatNotification[],
    allowedTypes: NotificationType[],
  ): FlatNotification[] {
    return notifications.filter((notification) => allowedTypes.includes(notification.type));
  }
}
