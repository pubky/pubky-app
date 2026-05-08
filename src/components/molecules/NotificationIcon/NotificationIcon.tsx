'use client';
import { StickyNote } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { BADGE_SIZE, ICON_SIZE, NOTIFICATION_ICON_MAP } from './NotificationIcon.constants';
import type { NotificationIconProps } from './NotificationIcon.types';

export function NotificationIcon({ type, showBadge }: NotificationIconProps) {
  const IconComponent = NOTIFICATION_ICON_MAP[type] || StickyNote;
  return (
    <Container
      overrideDefaults={true}
      className="relative shrink-0"
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
      }}
    >
      <IconComponent className="text-foreground" size={ICON_SIZE} />
      {showBadge && (
        <Container
          data-cy="notification-unread-dot"
          overrideDefaults={true}
          className="absolute right-0 bottom-0 rounded-full bg-brand"
          style={{
            width: BADGE_SIZE,
            height: BADGE_SIZE,
          }}
        />
      )}
    </Container>
  );
}
