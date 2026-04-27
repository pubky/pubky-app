'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { useIsMobile } from '@/hooks';
import { MegaphoneOff } from 'lucide-react';
export function MutedUsers() {
  const t = useTranslations('settings.mutedUsers');
  const isMobile = useIsMobile();
  return (
    <Molecules.SettingsSectionCard
      icon={MegaphoneOff}
      wrapChildren={!isMobile}
      title={t('title')}
      description={t('description')}
    >
      <Organisms.MutedUsersList />
    </Molecules.SettingsSectionCard>
  );
}
