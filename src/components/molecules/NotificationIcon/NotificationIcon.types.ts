import type { NotificationType } from '@/models/notification/notification.types';
/**
 * Props for the NotificationIcon component
 */
export interface NotificationIconProps {
  /**
   * The type of notification (determines which icon to display)
   */
  type: NotificationType;

  /**
   * Whether to show the unread badge indicator
   */
  showBadge: boolean;
}
