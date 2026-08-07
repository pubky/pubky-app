'use client';

import { Shield } from 'lucide-react';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { PrivacySettings } from '@/organisms/Settings/PrivacySettings/PrivacySettings';

export function Privacy() {
  return (
    <SettingsSectionCard
      icon={Shield}
      title={'Privacy and Safety'}
      description={'Privacy is not a crime. Manage your visibility and safety on Pubky.'}
    >
      <PrivacySettings />
    </SettingsSectionCard>
  );
}
