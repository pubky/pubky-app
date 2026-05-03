import type { FlatNotification } from '@/models/notification/notification.types';

/**
 * Props for the NotificationItem component
 */
export interface NotificationItemProps {
  /**
   * The notification data to display
   */
  notification: FlatNotification;

  /**
   * Whether the notification is unread
   */
  isUnread: boolean;
}
