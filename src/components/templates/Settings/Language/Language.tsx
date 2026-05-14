'use client';

import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { LanguageSelector } from '@/organisms/Settings/LanguageSelector/LanguageSelector';

export function Language() {
  const t = useTranslations('settings.language');
  return (
    <SettingsSectionCard icon={Globe} title={t('title')} description={t('description')}>
      <LanguageSelector />
    </SettingsSectionCard>
  );
}
