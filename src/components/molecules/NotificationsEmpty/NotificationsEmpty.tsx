'use client';

import { Frown } from 'lucide-react';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

export function NotificationsEmpty() {
  return (
    <IllustratedEmptyState
      imageSrc="/images/notifications-empty-state.webp"
      imageAlt={'Notifications - Empty state'}
      icon={Frown}
      title={'Nothing to see here yet'}
      subtitle={'Tags, follows, reposts and account information will be displayed here.'}
    />
  );
}
