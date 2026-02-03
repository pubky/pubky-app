'use client';

import { Frown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';

export function NotificationsEmpty() {
  const t = useTranslations('notifications.empty');

  return (
    <Molecules.ProfilePageEmptyState
      imageSrc="/images/notifications-empty-state.webp"
      imageAlt={t('alt')}
      icon={Frown}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  );
}
