'use client';

import { Frown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { IllustratedEmptyState } from '../IllustratedEmptyState/IllustratedEmptyState';

export function NotificationsEmpty() {
  const t = useTranslations('notifications.empty');

  return (
    <IllustratedEmptyState
      imageSrc="/images/notifications-empty-state.webp"
      imageAlt={t('alt')}
      icon={Frown}
      title={t('title')}
      subtitle={t('subtitle')}
    />
  );
}
