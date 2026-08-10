import type { NotificationType } from './NotificationSettings.types';

/**
 * Display labels for notification settings switches.
 * Maps each notification preference key to its label copy.
 */
export const NOTIFICATION_LABELS: Record<NotificationType, string> = {
  follow: 'New follower',
  newFriend: 'New friend',
  tagPost: 'Someone tagged your post',
  tagProfile: 'Someone tagged your profile',
  mention: 'Someone mentioned your profile',
  reply: 'New reply to your post',
  repost: 'New repost to your post',
  postDeleted: 'Someone deleted the post you interacted with',
  postEdited: 'Someone edited the post you interacted with',
};
