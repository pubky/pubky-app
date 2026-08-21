import type { FlatNotification, NotificationType } from '@/models/notification/notification.types';

/** Notification types whose repeats collapse into a grouped row. */
export type GroupableNotificationType = NotificationType.PostDeleted | NotificationType.PostEdited;

export type GroupableNotification = Extract<FlatNotification, { type: GroupableNotificationType }>;

/**
 * One rendered row: either a lone notification or a run of consecutive ones that share a
 * type, an actor and a post kind. Grouped runs hold at least MIN_NOTIFICATION_GROUP_SIZE
 * members, newest first (mirroring the source order).
 */
export type NotificationListEntry =
  | { kind: 'single'; notification: FlatNotification }
  | { kind: 'group'; notifications: GroupableNotification[] };

export interface NotificationsListProps {
  /** Rows to display, already grouped by `groupNotifications`. */
  entries: NotificationListEntry[];
  /** Used to decide which rows show the unread badge. */
  unreadNotifications: FlatNotification[];
}
