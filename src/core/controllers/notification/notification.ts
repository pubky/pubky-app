import * as Config from '@/config';
import { NotificationApplication } from '@/application/notification/notification';
import type { TGetOrFetchNotificationsResponse } from '@/application/notification/notification.types';
import type { TGetNotificationsParams } from '@/controllers/notification/notification.types';
import type { TReadProfileParams } from '@/controllers/profile/profile.types';
import type { FlatNotification } from '@/models/notification/notification.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
export class NotificationController {
  private constructor() {} // Prevent instantiation

  /**
   * Refreshes unread notifications for the current user.
   * Uses lastPolledTimestamp as the Nexus polling cursor and lastRead as the read/unread boundary.
   * After fetching, advances lastPolledTimestamp to the newest notification timestamp.
   *
   * @param userId - The user ID to fetch notifications for
   * @returns Promise resolving when notifications are updated
   */
  static async fetchNotifications({ userId }: TReadProfileParams) {
    const notificationStore = useNotificationStore.getState();
    const lastPolledTimestamp = notificationStore.selectLastPolledTimestamp();
    const lastRead = notificationStore.selectLastRead();

    const { unread, nextPollCursor } = await NotificationApplication.fetchNotifications({
      userId,
      lastPolledTimestamp,
      lastRead,
    });

    notificationStore.setUnread(unread);

    const currentCursor = notificationStore.selectLastPolledTimestamp();
    if (nextPollCursor !== undefined && (currentCursor === undefined || nextPollCursor > currentCursor)) {
      notificationStore.setLastPolledTimestamp(nextPollCursor);
    }
  }

  /**
   * Marks all notifications as read by updating the lastRead timestamp on the homeserver.
   * This resets the unread count to 0 and updates the local store.
   * Should be called when the user enters the notifications page.
   */
  static markAllAsRead() {
    const authStore = useAuthStore.getState();
    const pubky = authStore.currentUserPubky;

    // Skip if user is not authenticated (e.g., during logout)
    if (!pubky) return;

    // Create new lastRead with current timestamp using normalizer
    const lastRead = LastReadNormalizer.to(pubky);

    NotificationApplication.markAllAsRead(lastRead);

    // Update local store
    const notificationStore = useNotificationStore.getState();
    notificationStore.setLastRead(Number(lastRead.last_read.timestamp));
    notificationStore.setUnread(0);
  }

  /**
   * Retrieves notifications from cache if available, otherwise fetches from Nexus.
   * Uses timestamp-based pagination.
   *
   * @param params.olderThan - Unix timestamp to get notifications older than.
   *                           Defaults to Infinity for initial load (most recent notifications).
   *                           Use the timestamp of the last notification for pagination.
   * @param params.limit - Maximum number of notifications to return. Defaults to NEXUS_NOTIFICATIONS_LIMIT.
   *
   * @returns Promise resolving to notifications and next timestamp for pagination
   */
  static async getOrFetchNotifications({
    olderThan = Infinity,
    limit = Config.NEXUS_NOTIFICATIONS_LIMIT,
  }: TGetNotificationsParams): Promise<TGetOrFetchNotificationsResponse> {
    const userId = useAuthStore.getState().selectCurrentUserPubky();

    return await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan,
      limit,
    });
  }

  /**
   * Retrieves all notifications from the local database.
   * Used for reactive queries in UI components.
   *
   * @returns Promise resolving to all notifications ordered by timestamp descending
   */
  static async getAllFromCache(): Promise<FlatNotification[]> {
    return await NotificationApplication.getAllFromCache();
  }

  static getNotificationsCountsNow(): number {
    const notificationStore = useNotificationStore.getState();
    return notificationStore.selectUnread();
  }
}
