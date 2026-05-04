'use client';

import { useTranslations } from 'next-intl';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { NotificationSettings } from '@/organisms/Settings/NotificationSettings/NotificationSettings';

import { Bell } from 'lucide-react';
export function Notifications() {
  const t = useTranslations('settings.notifications');
  return (
    <SettingsSectionCard icon={Bell} title={t('title')} description={t('description')}>
      <NotificationSettings />
    </SettingsSectionCard>
  );
}
