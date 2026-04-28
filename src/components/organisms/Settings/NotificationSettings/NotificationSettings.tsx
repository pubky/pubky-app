'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import { useSettingsStore } from '@/core';
import { useSettingsActions } from '@/hooks/useSettingsActions/useSettingsActions';
import { NOTIFICATION_LABEL_KEYS } from './NotificationSettings.constants';
import type { NotificationType } from './NotificationSettings.types';

export function NotificationSettings() {
  const t = useTranslations('notifications.settings');
  const { notifications } = useSettingsStore();
  const { setNotificationPreference } = useSettingsActions();

  const handleToggle = (type: NotificationType) => {
    setNotificationPreference(type, !notifications[type]);
  };

  const notificationTypes = Object.keys(NOTIFICATION_LABEL_KEYS) as NotificationType[];

  return (
    <Molecules.SettingsSwitchGroup>
      {notificationTypes.map((type) => (
        <Molecules.SettingsSwitchItem
          key={type}
          id={`notification-switch-${type}`}
          label={t(NOTIFICATION_LABEL_KEYS[type])}
          checked={notifications[type]}
          onChange={() => handleToggle(type)}
        />
      ))}
    </Molecules.SettingsSwitchGroup>
  );
}
