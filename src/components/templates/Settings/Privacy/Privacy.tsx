'use client';

import { Network, Shield } from 'lucide-react';
import { Container } from '@/atoms/Container/Container';
import { hasLocalIndexSource } from '@/config/nexus';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { LocalIndexStatus } from '@/organisms/Settings/LocalIndexStatus/LocalIndexStatus';
import { PrivacySettings } from '@/organisms/Settings/PrivacySettings/PrivacySettings';

export function Privacy() {
  return (
    <Container overrideDefaults className="flex w-full flex-col gap-6">
      <SettingsSectionCard
        icon={Shield}
        title={'Privacy and Safety'}
        description={'Privacy is not a crime. Manage your visibility and safety on Pubky.'}
      >
        <PrivacySettings />
      </SettingsSectionCard>
      {hasLocalIndexSource() && (
        <SettingsSectionCard
          icon={Network}
          title={'Your network'}
          description={'This browser builds your feeds from the homeservers of the people in your network.'}
        >
          <LocalIndexStatus />
        </SettingsSectionCard>
      )}
    </Container>
  );
}
