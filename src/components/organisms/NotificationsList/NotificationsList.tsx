'use client';

import { useMemo } from 'react';
import { Container } from '@/atoms/Container/Container';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { getBusinessKey } from '@/models/notification/notification.helpers';
import { NotificationItem } from '../NotificationItem/NotificationItem';
import type { NotificationsListProps } from './NotificationsList.types';

export function NotificationsList({ notifications, unreadNotifications }: NotificationsListProps) {
  const isMobile = useIsMobile();

  // Create a Set of unread notification business keys for O(1) lookup
  // Early return optimization for empty unread list
  const unreadKeys = useMemo(() => {
    if (unreadNotifications.length === 0) return new Set<string>();
    return new Set(unreadNotifications.map(getBusinessKey));
  }, [unreadNotifications]);

  return (
    <Container data-cy="notifications-list" className="gap-3 rounded-md bg-card p-6">
      {notifications.map((notification) => {
        // Use business key for unread lookup (to match unreadNotifications)
        const businessKey = getBusinessKey(notification);
        const isUnread = unreadKeys.has(businessKey);

        return (
          <NotificationItem key={businessKey} notification={notification} isUnread={isUnread} isMobile={isMobile} />
        );
      })}
    </Container>
  );
}
