'use client';

import * as Atoms from '@/atoms';
import type { NotificationIconProps } from './NotificationIcon.types';
import { NOTIFICATION_ICON_MAP, ICON_SIZE, BADGE_SIZE } from './NotificationIcon.constants';
import { StickyNote } from 'lucide-react';
export function NotificationIcon({ type, showBadge }: NotificationIconProps) {
  const IconComponent = NOTIFICATION_ICON_MAP[type] || StickyNote;
  return (
    <Atoms.Container
      overrideDefaults={true}
      className="relative shrink-0"
      style={{
        width: ICON_SIZE,
        height: ICON_SIZE,
      }}
    >
      <IconComponent className="text-foreground" size={ICON_SIZE} />
      {showBadge && (
        <Atoms.Container
          data-cy="notification-unread-dot"
          overrideDefaults={true}
          className="absolute right-0 bottom-0 rounded-full bg-brand"
          style={{
            width: BADGE_SIZE,
            height: BADGE_SIZE,
          }}
        />
      )}
    </Atoms.Container>
  );
}
