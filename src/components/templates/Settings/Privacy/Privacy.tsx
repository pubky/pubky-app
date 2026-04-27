'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { Shield } from 'lucide-react';
export function Privacy() {
  const t = useTranslations('settings.privacy');
  return (
    <Molecules.SettingsSectionCard icon={Shield} title={t('title')} description={t('description')}>
      <Organisms.PrivacySettings />
    </Molecules.SettingsSectionCard>
  );
}
