'use client';

import { SunMoon } from 'lucide-react';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { AppearanceSettings } from '@/organisms/Settings/AppearanceSettings/AppearanceSettings';

export function Appearance() {
  return (
    <SettingsSectionCard
      icon={SunMoon}
      title={'Appearance'}
      description={'Choose how Pubky looks on this device. Your preference is saved in this browser.'}
    >
      <AppearanceSettings />
    </SettingsSectionCard>
  );
}
