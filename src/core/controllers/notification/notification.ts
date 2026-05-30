import { NotificationApplication } from '@/application/notification/notification';
import type { TGetOrFetchNotificationsResponse } from '@/application/notification/notification.types';
import { NEXUS_NOTIFICATIONS_LIMIT } from '@/config/nexus';
import type { TGetNotificationsParams } from '@/controllers/notification/notification.types';
import type { TReadProfileParams } from '@/controllers/profile/profile.types';
import { type FlatNotification, NotificationType } from '@/models/notification/notification.types';
import { LastReadNormalizer } from '@/pipes/lastRead/lastRead.normalizer';
import { NotificationNormalizer } from '@/pipes/notification/notification.normalizer';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useNotificationStore } from '@/stores/notification/notification.store';
import { useSettingsStore } from '@/stores/settings/settings.store';

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
    const preferences = useSettingsStore.getState().notifications;

    const allowedTypes = NotificationNormalizer.toEnabledTypes(preferences);
    const { unread, nextPollCursor } = await NotificationApplication.fetchNotifications({
      userId,
      lastPolledTimestamp,
      lastRead,
      allowedTypes,
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

    // Skip if there are no unread notifications
    const notificationStore = useNotificationStore.getState();
    if (notificationStore.selectUnread() === 0) return;

    // Create new lastRead with current timestamp using normalizer
    const lastRead = LastReadNormalizer.to(pubky);

    NotificationApplication.markAllAsRead(lastRead);

    // Update local store
    notificationStore.setLastRead(Number(lastRead.last_read.timestamp));
    notificationStore.setUnread(0);
  }

  /**
   * Retrieves notifications from cache if available, otherwise fetches from Nexus.
   * Uses timestamp-based pagination.
   *
   * All notifications are stored unfiltered in IndexedDB.
   * The controller reads NotificationPreferences from the settings store and computes
   * allowedTypes, then delegates filtering-aware pagination to NotificationApplication.
   * This keeps store access in the Controller layer (ADR-0004) while keeping fetch
   * orchestration in the Application layer.
   *
   * @param params.olderThan - Unix timestamp to get notifications older than.
   *                           Defaults to Infinity for initial load (most recent notifications).
   *                           Use the timestamp of the last notification for pagination.
   * @param params.limit - Maximum number of notifications to return. Defaults to NEXUS_NOTIFICATIONS_LIMIT.
   *
   * @returns Promise resolving to filtered notifications and next timestamp for pagination
   */
  static async getOrFetchNotifications({
    olderThan = Infinity,
    limit = NEXUS_NOTIFICATIONS_LIMIT,
  }: TGetNotificationsParams): Promise<TGetOrFetchNotificationsResponse> {
    const userId = useAuthStore.getState().selectCurrentUserPubky();
    const preferences = useSettingsStore.getState().notifications;
    const allowedTypes = NotificationNormalizer.toEnabledTypes(preferences);
    const shouldFilterByPreferences = allowedTypes.length < Object.values(NotificationType).length;

    return await NotificationApplication.getOrFetchNotifications({
      userId,
      olderThan,
      limit,
      allowedTypes: shouldFilterByPreferences ? allowedTypes : undefined,
    });
  }

  /**
   * Retrieves all notifications from the local database without preference filtering.
   * Currently unused since filtered-notification was introduced, but kept for future use.
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
