'use client';

import { Container } from '@/atoms/Container/Container';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { getBusinessKey } from '@/models/notification/notification.helpers';
import { NotificationGroupItem } from '../NotificationGroupItem/NotificationGroupItem';
import { NotificationItem } from '../NotificationItem/NotificationItem';
import type { NotificationsListProps } from './NotificationsList.types';

export function NotificationsList({ entries, unreadNotifications }: NotificationsListProps) {
  const isMobile = useIsMobile();

  // Set of unread notification business keys for O(1) lookup
  const unreadKeys = new Set(unreadNotifications.map(getBusinessKey));

  return (
    <Container data-cy="notifications-list" className="gap-3 rounded-md bg-card p-6">
      {entries.map((entry) => {
        if (entry.kind === 'group') {
          // A group is unread while any of its collapsed members still is.
          const isUnread = entry.notifications.some((notification) => unreadKeys.has(getBusinessKey(notification)));

          return (
            <NotificationGroupItem
              // Keyed on the oldest member: a poll refresh prepends newer members to the
              // run the user may be reading (the head moves), while pagination extends
              // only the off-screen frontier run at its tail — so the tail is the stabler
              // identity. The prefix keeps group and single keys from ever colliding.
              key={`group:${getBusinessKey(entry.notifications[entry.notifications.length - 1])}`}
              notifications={entry.notifications}
              isUnread={isUnread}
              isMobile={isMobile}
            />
          );
        }

        const businessKey = getBusinessKey(entry.notification);

        return (
          <NotificationItem
            key={businessKey}
            notification={entry.notification}
            isUnread={unreadKeys.has(businessKey)}
            isMobile={isMobile}
          />
        );
      })}
    </Container>
  );
}
