'use client';

import { useTranslations } from 'next-intl';
import { useSettingsActions } from '@/hooks/useSettingsActions/useSettingsActions';
import { SettingsSwitchGroup } from '@/molecules/Settings/SettingsSwitchGroup/SettingsSwitchGroup';
import { SettingsSwitchItem } from '@/molecules/Settings/SettingsSwitchItem/SettingsSwitchItem';
import { useSettingsStore } from '@/stores/settings/settings.store';
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
    <SettingsSwitchGroup>
      {notificationTypes.map((type) => (
        <SettingsSwitchItem
          key={type}
          id={`notification-switch-${type}`}
          label={t(NOTIFICATION_LABEL_KEYS[type])}
          checked={notifications[type]}
          onChange={() => handleToggle(type)}
        />
      ))}
    </SettingsSwitchGroup>
  );
}
