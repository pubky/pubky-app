'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import * as Libs from '@/libs';
import { useIsMobile } from '@/hooks';

export function MutedUsers() {
  const t = useTranslations('settings.mutedUsers');
  const isMobile = useIsMobile();

  return (
    <Molecules.SettingsSectionCard
      icon={Libs.MegaphoneOff}
      wrapChildren={!isMobile}
      title={t('title')}
      description={t('description')}
    >
      <Organisms.MutedUsersList />
    </Molecules.SettingsSectionCard>
  );
}
