import { NotificationType } from '@/core/models/notification/notification.types';
import type { NotificationPreferences } from '@/core/stores/settings/settings.types';

// Maps each NotificationType enum to its corresponding NotificationPreferences key.
// Needed because NotificationType values don't match the preference key names directly.
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
