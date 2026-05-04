'use client';

import { useTranslations } from 'next-intl';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { MutedUsersList } from '@/organisms/Settings/MutedUsersList/MutedUsersList';

import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { MegaphoneOff } from 'lucide-react';

export function MutedUsers() {
  const t = useTranslations('settings.mutedUsers');
  const isMobile = useIsMobile();
  return (
    <SettingsSectionCard icon={MegaphoneOff} wrapChildren={!isMobile} title={t('title')} description={t('description')}>
      <MutedUsersList />
    </SettingsSectionCard>
  );
}
