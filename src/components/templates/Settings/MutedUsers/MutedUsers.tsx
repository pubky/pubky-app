'use client';

import { MegaphoneOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useIsMobile } from '@/hooks/useIsMobile/useIsMobile';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { MutedUsersList } from '@/organisms/Settings/MutedUsersList/MutedUsersList';

export function MutedUsers() {
  const t = useTranslations('settings.mutedUsers');
  const isMobile = useIsMobile();
  return (
    <SettingsSectionCard icon={MegaphoneOff} wrapChildren={!isMobile} title={t('title')} description={t('description')}>
      <MutedUsersList />
    </SettingsSectionCard>
  );
}
