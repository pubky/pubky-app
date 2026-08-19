'use client';

import { useState } from 'react';
import { Container } from '@/atoms/Container/Container';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { getBusinessKey } from '@/models/notification/notification.helpers';
import { NotificationGroupItem } from '../NotificationGroupItem/NotificationGroupItem';
import { NotificationItem } from '../NotificationItem/NotificationItem';
import type { NotificationsListProps } from './NotificationsList.types';

export function NotificationsList({ entries, unreadNotifications }: NotificationsListProps) {
  const isMobile = useIsMobile();

  // Which groups are expanded, tracked by their members rather than by row identity: a
  // run gains members as pages load and refreshes arrive, so any single member can stop
  // being the row's key — but the run stays the same run as long as one member matches.
  const [expandedMemberKeys, setExpandedMemberKeys] = useState<ReadonlySet<string>>(() => new Set());

  // Set of unread notification business keys for O(1) lookup
  const unreadKeys = new Set(unreadNotifications.map(getBusinessKey));

  return (
    <Container data-cy="notifications-list" className="gap-3 rounded-md bg-card p-6">
      {entries.map((entry) => {
        if (entry.kind === 'group') {
          const memberKeys = entry.notifications.map(getBusinessKey);
          // A group is unread while any of its collapsed members still is.
          const isUnread = memberKeys.some((key) => unreadKeys.has(key));
          const isExpanded = memberKeys.some((key) => expandedMemberKeys.has(key));

          const handleExpandedChange = (expanded: boolean) =>
            setExpandedMemberKeys((previous) => {
              const next = new Set(previous);
              for (const key of memberKeys) {
                if (expanded) next.add(key);
                else next.delete(key);
              }
              return next;
            });

          return (
            <NotificationGroupItem
              // Keyed on the head because pagination appends older notifications, so a
              // growing run grows at its tail and the head stays put. The prefix keeps
              // group and single keys from ever colliding. A remount is survivable
              // either way: the disclosure state lives here, not in the row.
              key={`group:${memberKeys[0]}`}
              notifications={entry.notifications}
              isUnread={isUnread}
              isMobile={isMobile}
              isExpanded={isExpanded}
              onExpandedChange={handleExpandedChange}
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
