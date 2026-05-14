'use client';
import { HelpContent } from '@/molecules/Settings/HelpContent/HelpContent';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';

export function Help() {
  return (
    <SettingsSectionCard wrapChildren={false}>
      <HelpContent />
    </SettingsSectionCard>
  );
}
