import type { NotificationType } from './NotificationSettings.types';

/**
 * Translation keys for notification settings labels
 * Maps each notification preference key to its i18n key in 'notifications.settings' namespace
 */
export const NOTIFICATION_LABEL_KEYS: Record<NotificationType, string> = {
  follow: 'newFollower',
  newFriend: 'newFriend',
  tagPost: 'taggedPost',
  tagProfile: 'taggedProfile',
  mention: 'mentionedProfile',
  reply: 'newReply',
  repost: 'newRepost',
  postDeleted: 'deletedPost',
  postEdited: 'editedPost',
};
