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

  /**
   * Whether the notification list is being viewed below the desktop breakpoint.
   * Supplied by the list so rows do not each subscribe to viewport changes.
   */
  isMobile?: boolean;
}
