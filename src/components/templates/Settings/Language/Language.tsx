'use client';

import { useTranslations } from 'next-intl';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { LanguageSelector } from '@/organisms/Settings/LanguageSelector/LanguageSelector';

import { Globe } from 'lucide-react';
export function Language() {
  const t = useTranslations('settings.language');
  return (
    <SettingsSectionCard icon={Globe} title={t('title')} description={t('description')}>
      <LanguageSelector />
    </SettingsSectionCard>
  );
}
