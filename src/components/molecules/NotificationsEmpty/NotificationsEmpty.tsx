'use client';

import { Bell } from 'lucide-react';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

export function NotificationsEmpty() {
  return (
    <IllustratedEmptyState
      imageSrc="/images/notifications-empty-state.webp"
      imageAlt={'Notifications - Empty state'}
      icon={Bell}
      title={'No notifications yet'}
      subtitle={'Tags, follows, reposts and account information will be displayed here.'}
    />
  );
}
