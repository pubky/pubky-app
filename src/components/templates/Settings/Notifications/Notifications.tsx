'use client';

import { Bell } from 'lucide-react';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { NotificationSettings } from '@/organisms/Settings/NotificationSettings/NotificationSettings';

export function Notifications() {
  return (
    <SettingsSectionCard
      icon={Bell}
      title={'Platform notifications'}
      description={'Please select which notifications you want to receive on Pubky.'}
    >
      <NotificationSettings />
    </SettingsSectionCard>
  );
}
