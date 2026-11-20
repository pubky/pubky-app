'use client';

import { Container } from '@/atoms/Container/Container';
import { Typography } from '@/atoms/Typography/Typography';
import { useSettingsActions } from '@/hooks/useSettingsActions/useSettingsActions';
import { getCategoryPlayers, PlayerCategory } from '@/molecules/ResourcePlayer/resourcePlayer.utils';
import { SettingsSwitchGroup } from '@/molecules/Settings/SettingsSwitchGroup/SettingsSwitchGroup';
import { SettingsSwitchItem } from '@/molecules/Settings/SettingsSwitchItem/SettingsSwitchItem';
import { useSettingsStore } from '@/stores/settings/settings.store';
import { MediaPlayerList } from './MediaPlayerList';

/** The kinds of resource with their own Players, in the page's order. */
const CATEGORIES = [PlayerCategory.MUSIC, PlayerCategory.PODCASTS, PlayerCategory.VIDEO];

/**
 * Links and media: the services cards play on, ranked, with the ones the viewer removed never played,
 * one list per kind of resource (`MediaPlayerList`: Music, Podcasts, Video), and whether a link's
 * platform embed shows up front.
 */
export function MediaSettings() {
  const { media } = useSettingsStore();
  const { setPlayers, setEmbedsUpFront } = useSettingsActions();

  return (
    <SettingsSwitchGroup>
      <Container overrideDefaults className="flex w-full flex-col items-start gap-6">
        <Container overrideDefaults className="flex flex-col gap-2">
          <Typography size="sm" className="leading-5 font-medium">
            {'Players'}
          </Typography>
          <Typography size="sm" className="font-normal text-muted-foreground">
            {
              'Cards play on the first of these services they are on; removed ones never play. Until you reorder them, a link plays on its own service first, and a podcast in the built-in player.'
            }
          </Typography>
        </Container>
        {CATEGORIES.map((category) => (
          <MediaPlayerList
            key={category}
            category={category}
            players={getCategoryPlayers(media, category)}
            onChange={(order, hidden) => setPlayers(order, hidden, category)}
          />
        ))}
      </Container>
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
