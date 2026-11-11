'use client';

import { useSettingsActions } from '@/hooks/useSettingsActions/useSettingsActions';
import { SettingsSwitchGroup } from '@/molecules/Settings/SettingsSwitchGroup/SettingsSwitchGroup';
import { SettingsSwitchItem } from '@/molecules/Settings/SettingsSwitchItem/SettingsSwitchItem';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { MediaPlayerList } from './MediaPlayerList';

/**
 * Links and media: the services cards play on, ranked, with the ones the viewer removed never played
 * (`MediaPlayerList`), and whether a link's platform embed shows up front.
 */
export function MediaSettings() {
  const { media } = useSettingsStore();
  const { setPlayers, setEmbedsUpFront } = useSettingsActions();

  return (
    <SettingsSwitchGroup>
      <MediaPlayerList players={media} onChange={setPlayers} />
      <SettingsSwitchItem
        id="media-switch-embedsUpFront"
        label={'Show platform embeds up front'}
        description={'When off, links show their card, and the platform loads only when you press Play or Show on.'}
        checked={media.embedsUpFront}
        onChange={setEmbedsUpFront}
      />
    </SettingsSwitchGroup>
  );
}
