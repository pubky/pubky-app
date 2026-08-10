'use client';

import { useSettingsActions } from '@/hooks/useSettingsActions/useSettingsActions';
import { SettingsSwitchGroup } from '@/molecules/Settings/SettingsSwitchGroup/SettingsSwitchGroup';
import { SettingsSwitchItem } from '@/molecules/Settings/SettingsSwitchItem/SettingsSwitchItem';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { PRIVACY_SETTINGS } from './PrivacySettings.constants';
import type { PrivacyType } from './PrivacySettings.types';

export function PrivacySettings() {
  const { privacy } = useSettingsStore();
  const actions = useSettingsActions();

  const privacyTypes = Object.keys(PRIVACY_SETTINGS) as PrivacyType[];

  return (
    <SettingsSwitchGroup>
      {privacyTypes.map((type) => {
        const { label, action, disabled } = PRIVACY_SETTINGS[type];
        return (
          <SettingsSwitchItem
            key={type}
            id={`privacy-switch-${type}`}
            label={label}
            checked={privacy[type]}
            onChange={actions[action]}
            disabled={disabled}
          />
        );
      })}
    </SettingsSwitchGroup>
  );
}
