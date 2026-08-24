'use client';

import { useSettingsActions } from '@/hooks/useSettingsActions/useSettingsActions';
import { SettingsSwitchGroup } from '@/molecules/Settings/SettingsSwitchGroup/SettingsSwitchGroup';
import { SettingsSwitchItem } from '@/molecules/Settings/SettingsSwitchItem/SettingsSwitchItem';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { NOTIFICATION_LABELS } from './NotificationSettings.constants';
import type { NotificationType } from './NotificationSettings.types';

export function NotificationSettings() {
  const { notifications } = useSettingsStore();
  const { setNotificationPreference } = useSettingsActions();

  const handleToggle = (type: NotificationType) => {
    setNotificationPreference(type, !notifications[type]);
  };

  const notificationTypes = Object.keys(NOTIFICATION_LABELS) as NotificationType[];

  return (
    <SettingsSwitchGroup>
      {notificationTypes.map((type) => (
        <SettingsSwitchItem
          key={type}
          id={`notification-switch-${type}`}
          label={NOTIFICATION_LABELS[type]}
          checked={notifications[type]}
          onChange={() => handleToggle(type)}
        />
      ))}
    </SettingsSwitchGroup>
  );
}
