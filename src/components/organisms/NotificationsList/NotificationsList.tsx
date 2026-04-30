'use client';

import { useMemo } from 'react';
import * as Atoms from '@/atoms';
import * as Organisms from '@/organisms';
import type { NotificationsListProps } from './NotificationsList.types';
import { getBusinessKey } from '@/models/notification/notification.helpers';
export function NotificationsList({ notifications, unreadNotifications }: NotificationsListProps) {
  // Create a Set of unread notification business keys for O(1) lookup
  // Early return optimization for empty unread list
  const unreadKeys = useMemo(() => {
    if (unreadNotifications.length === 0) return new Set<string>();
    return new Set(unreadNotifications.map(getBusinessKey));
  }, [unreadNotifications]);

  return (
    <Atoms.Container data-cy="notifications-list" className="gap-3 rounded-md bg-card p-6">
      {notifications.map((notification) => {
        // Use business key for unread lookup (to match unreadNotifications)
        const businessKey = getBusinessKey(notification);
        const isUnread = unreadKeys.has(businessKey);

        return <Organisms.NotificationItem key={businessKey} notification={notification} isUnread={isUnread} />;
      })}
    </Atoms.Container>
  );
}
