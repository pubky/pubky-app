'use client';

import { Music } from 'lucide-react';
import { isPinakesConfigured } from '@/config/pinakes';
import { SettingsSectionCard } from '@/molecules/Settings/SettingsSectionCard/SettingsSectionCard';
import { MediaSettings } from '@/organisms/Settings/MediaSettings/MediaSettings';

export function Media() {
  // These settings act on external resource cards, which need Pinakes.
  const isAvailable = isPinakesConfigured();

  return (
    <SettingsSectionCard
      icon={Music}
      title={'Links and Media'}
      description={
        isAvailable
          ? 'Choose how the music, videos and posts that people link to show and play on Pubky.'
          : 'Link cards are not available here, so there is nothing to set.'
      }
      wrapChildren={isAvailable}
    >
      {isAvailable && <MediaSettings />}
    </SettingsSectionCard>
  );
}
