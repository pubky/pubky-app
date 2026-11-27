'use client';

import { useId, useRef } from 'react';
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
  /** The row's title is for screen readers only: a card whose own heading names it (an episode's card). */
  hideTitle?: boolean;
  /** Its date and length as Pinakes read them (`formatFactDate`, `formatDuration`). */
  date?: string | null;
  length?: string | null;
  /** Its page in the app (an episode's resource page): the row's title and the player's open it. */
  href?: string | null;
  /** Open `href` in a new tab (where links may not navigate: the composer, a dialog). */
  linkTarget?: '_blank';
  /** What it is from (its show's name), shown in the player. */
  from?: string | null;
  /** Its cover (the episode's image, else its show's): in the player, and beside a `featured` row's title. */
  image?: string | null;
  /** The row leads its list (a show's newest episode): its cover beside it and its title on up to two lines. */
  featured?: boolean;
  /** What the row's Play button sits on (`ResourceActions`' `surface`). */
  surface?: PostActionSurface;
  'data-testid'?: string;
}

/**
 * An audio file in a card (a show's episode) as one row (`PlayStandIn`): Play, its title, date and
 * length; with `href` the title (and the row outside Play) opens its page. Nothing loads before
 * Play. Play replaces the row with the app's audio player
 * (`ResourceAudioControls`: cover, title, show, controls), started by that press, as the page's
 * player (`useResourcePlayer`): the app's player host keeps it (`PlayerDock`), so it plays on across
 * pages, docks while it plays and its card is away, and one media plays at a time. Paused in the
 * card it stays there, and Close in the dock unloads it. A card of the same on the next page shows
 * the playing one (`usePlaysElsewhere`).
 */
export function ResourceAudioPlayer({
  src,
  resource,
  title,
  hideTitle = false,
  date,
  length,
  href,
  linkTarget,
  from,
  image,
  featured = false,
  surface,
  'data-testid': dataTestId,
}: ResourceAudioPlayerProps) {
  const owner = `${useId()}|${resource}`;
  const target = getAudioPlayer(src, { image, from, page: href, ...(linkTarget ? { pageTarget: linkTarget } : {}) });
  // Set by a press on the row's Play: the player that press opens takes its focus, once.
  const pressed = useRef(false);
  const hosted = usePlayerHost() !== null;
  const player = useResourcePlayer(owner, [target], { hosted });
  const isOpen = player.current !== null;
  const shown = usePlaysElsewhere(`${resource}|${target.provider}`, owner) || isOpen;

  return (
    <Container overrideDefaults data-testid={dataTestId} className="flex min-w-0 flex-col gap-2">
      {shown ? (
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
              takeFocus={() => {
                const was = pressed.current;
                pressed.current = false;
                return was;
              }}
            />
          )}
        </PlayerDock>
      ) : (
        <PlayStandIn
          label={`Play ${title}`}
          title={title}
          hideTitle={hideTitle}
          detail={[date, length].filter(Boolean).join(' · ')}
          onPlay={() => {
            pressed.current = true;
            player.play(target);
          }}
          surface={surface}
          href={href}
          linkTarget={linkTarget}
          {...(featured ? { image: image ?? null, titleLines: 2 as const } : {})}
        />
      )}
    </Container>
  );
}
