import type { FlatNotification } from '@/core/models/notification/notification.types';
import { NotificationType } from '@/core/models/notification/notification.types';
import type { NotificationPreferences } from '@/core/stores/settings/settings.types';

/**
 * Bridges the Nexus notification type enum (e.g., 'post_deleted') to the user's
 * preference key in settings (e.g., 'postDeleted'). These use different naming
 * conventions — the enum uses snake_case from the API, while preferences use
 * camelCase from the settings store — so an explicit mapping is required.
 */
// exported for tests
export const NOTIFICATION_TYPE_TO_PREFERENCE_KEY: Record<NotificationType, keyof NotificationPreferences> = {
  [NotificationType.Follow]: 'follow',
  [NotificationType.NewFriend]: 'newFriend',
  [NotificationType.TagPost]: 'tagPost',
  [NotificationType.TagProfile]: 'tagProfile',
  [NotificationType.Reply]: 'reply',
  [NotificationType.Repost]: 'repost',
  [NotificationType.Mention]: 'mention',
  [NotificationType.PostDeleted]: 'postDeleted',
  [NotificationType.PostEdited]: 'postEdited',
};

/**
 * Filters notifications by user preferences.
 * Returns only notifications whose type is enabled in the given preferences.
 *
 * Pure function — no IO, no store access.
 */
export function filterByPreferences(
  notifications: FlatNotification[],
  preferences: NotificationPreferences,
): FlatNotification[] {
  return notifications.filter((notification) => {
    const preferenceKey = NOTIFICATION_TYPE_TO_PREFERENCE_KEY[notification.type];
    return preferences[preferenceKey];
  });
}
