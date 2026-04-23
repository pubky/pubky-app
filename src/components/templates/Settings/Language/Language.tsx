'use client';

import { useTranslations } from 'next-intl';
import * as Molecules from '@/molecules';
import * as Organisms from '@/organisms';
import { Globe } from 'lucide-react';
export function Language() {
  const t = useTranslations('settings.language');
  return (
    <Molecules.SettingsSectionCard icon={Globe} title={t('title')} description={t('description')}>
      <Organisms.LanguageSelector />
    </Molecules.SettingsSectionCard>
  );
}
