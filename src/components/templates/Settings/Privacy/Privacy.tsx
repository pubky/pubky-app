'use client';

import { Shield } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { PrivacySettings } from '@/organisms/Settings/PrivacySettings/PrivacySettings';

export function Privacy() {
  const t = useTranslations('settings.privacy');
  return (
    <SettingsSectionCard icon={Shield} title={t('title')} description={t('description')}>
      <PrivacySettings />
    </SettingsSectionCard>
  );
}
