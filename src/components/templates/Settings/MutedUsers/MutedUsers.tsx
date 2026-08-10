'use client';

import { MegaphoneOff } from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { MutedUsersList } from '@/organisms/Settings/MutedUsersList/MutedUsersList';

export function MutedUsers() {
  const isMobile = useIsMobile();
  return (
    <SettingsSectionCard
      icon={MegaphoneOff}
      wrapChildren={!isMobile}
      title={'Muted users'}
      description={'Here is an overview of all users you muted. You can choose to unmute users if you want.'}
    >
      <MutedUsersList />
    </SettingsSectionCard>
  );
}
