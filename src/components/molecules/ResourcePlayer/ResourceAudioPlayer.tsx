'use client';

import { useId } from 'react';
import { Container } from '@/atoms/Container/Container';
import type { PostActionSurface } from '@/organisms/PostActionsBar/PostActionButton';
import { usePlayerHost, usePlaysElsewhere } from './PlayerHost';
import { getAudioPlayer } from './resourcePlayer.utils';
import { PlayerDock, PlayStandIn } from './ResourcePlayerControls';
import { ResourcePlayerFrame } from './ResourcePlayerFrame';
import { useResourcePlayer } from './useResourcePlayer';

interface ResourceAudioPlayerProps {
  /** The audio file: a podcast episode's enclosure. */
  src: string;
  /** What plays, by its link (the episode's): a card of the same on the next page shows the same player. */
  resource: string;
  /** Its name, the row's title. */
  title: string;
  /** Its date and length as Pinakes read them (`formatFactDate`, `formatDuration`). */
  date?: string | null;
  length?: string | null;
  /** What the row's Play button sits on (`ResourceActions`' `surface`). */
  surface?: PostActionSurface;
  'data-testid'?: string;
}

/**
 * An audio file in a card (a show's episode) as one row (`PlayStandIn`): Play, its title, date and
 * length. Nothing loads before Play, whatever platform embeds up front says. Play opens the browser's
 * own player under the title, started by that press, as the page's player (`useResourcePlayer`): the
 * app's player host keeps it (`PlayerDock`), so it plays on across pages, docks while it plays and
 * its card is away, and one media plays at a time. Open, the file's own length shows in its controls
 * (a feed's length can differ by the ads put in); paused in the card it stays there, and Close in the
 * dock unloads it. A card of the same on the next page shows the playing one (`usePlaysElsewhere`).
 */
export function ResourceAudioPlayer({
  src,
  resource,
  title,
  date,
  length,
  surface,
  'data-testid': dataTestId,
}: ResourceAudioPlayerProps) {
  const owner = `${useId()}|${resource}`;
  const target = getAudioPlayer(src);
  const hosted = usePlayerHost() !== null;
  const player = useResourcePlayer(owner, [target], { hosted });
  const isOpen = player.current !== null;
  const shown = usePlaysElsewhere(`${resource}|${target.provider}`, owner) || isOpen;

  return (
    <Container overrideDefaults data-testid={dataTestId} className="flex min-w-0 flex-col gap-2">
      <PlayStandIn
        label={`Play ${title}`}
        title={title}
        detail={[date, shown ? null : length].filter(Boolean).join(' · ')}
        onPlay={shown ? undefined : () => player.play(target)}
        surface={surface}
      />
      {shown && (
        <PlayerDock
          target={target}
          title={title}
          onClose={player.close}
          dockable={isOpen && !player.paused}
          pagePlayer={hosted ? { owner, resource } : undefined}
        >
          {/* Played from another card: the host lays that player over this one's place. */}
          {isOpen && (
            <ResourcePlayerFrame
              target={target}
              title={title}
              load={player.load}
              onLoaded={player.onLoaded}
              onPlay={(media) => player.play(target, media)}
              onPause={player.pause}
            />
          )}
        </PlayerDock>
      )}
    </Container>
  );
}
